// ─── Appointments Service ─────────────────────────────────────────────────────
// THE boundary between the UI and the data layer.
//
// Components and TanStack Query hooks call ONLY this module — never the mock
// data files directly. When the Node + Supabase backend is ready, we replace
// the body of each function with a real fetch/supabase call and nothing else
// in the app changes.
//
// Every write action here:
//   1. checks the acting role has permission (permissions.ts),
//   2. checks the status transition is legal (statusMachine.ts),
//   3. prevents duplicate actions,
//   4. records an audit event (auditLog.ts).
// The backend will enforce the same rules server-side via RLS + triggers
// (PRD §10: do not rely on the frontend alone).

import { SEED_APPROVALS, type ApprovalRecord } from '../data/approvalData'
import type { AppointmentStatus } from '../data/mockAppointments'
import { assertTransition } from '../config/statusMachine'
import { hasPermission, type Role, type Action } from '../config/permissions'
import { recordEvent, getTimeline, getAllEvents, type AuditEvent } from '../data/auditLog'
import { SEED_AVAILABILITY, type Availability } from '../data/availabilityData'
import {
  computeReport,
  applyFilters,
  type ReportFilters,
  type ReportSummary,
  type TableReportResult,
  type RegisterRow,
  type PendingRow,
  type TurnaroundRow,
  type ChangeRow,
} from '../data/reportTypes'
import {
  seedMasterData, sameName, isNonEmpty,
  type MasterData, type Department, type MasterAppointmentType, type MasterAuthority,
} from '../data/masterData'
import {
  seedUsers, isValidEmail, sameEmail, isNonEmpty as isNonEmptyUser,
  type ManagedUser,
} from '../data/userData'
import { ROLES } from '../config/permissions'
import { api, baseUrl, getToken } from './apiClient'
import { generateGoogleMeetLink } from '../utils/googleMeet'
import { sendAppointmentConfirmationEmail } from './emailService'

// ─── Config: which implementation backs this service ─────────────────────────
// Flip to 'supabase' when the backend is wired. Only this module reads it.
// Automated test suite always runs on the mock path (see CUTOVER.md).
const DATA_SOURCE: 'mock' | 'supabase' =
  import.meta.env.MODE === 'test' ? 'mock' : (import.meta.env.VITE_API_BASE_URL ? 'supabase' : 'mock')

// ─── In-memory store (mock implementation) ────────────────────────────────────
const STORE: ApprovalRecord[] = SEED_APPROVALS.map(r => ({ ...r }))

// Availability config store (deep copy so resets restore the seed exactly).
const AVAILABILITY_STORE: Availability[] = SEED_AVAILABILITY.map(a => ({
  ...a,
  workingHours: a.workingHours.map(w => ({ ...w })),
  holidays:     a.holidays.map(h => ({ ...h })),
}))

// Master-data store (departments / types / authorities).
let MASTER: MasterData = seedMasterData()

// User accounts store (super-admin managed).
let USERS: ManagedUser[] = seedUsers()
let userSeq = 2000

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ─── Acting user passed from the UI (from authStore) ──────────────────────────
export interface Actor {
  id:   string
  name: string
  role: Role
}

// ─── Error type ─────────────────────────────────────────────────────────────────
// Defined in ./serviceError and re-exported here so existing imports
// (`import { ServiceError } from '../services/appointmentsService'`) keep working
// and the API client can share the same type without an import cycle.
export { ServiceError, type ServiceErrorCode } from './serviceError'
import { ServiceError } from './serviceError'

// ─── Guard helpers ──────────────────────────────────────────────────────────────
function requirePermission(actor: Actor, action: Action) {
  if (!hasPermission(actor.role, action)) {
    throw new ServiceError('forbidden', 'You do not have permission to perform this action.')
  }
}

function find(id: string): ApprovalRecord {
  const rec = STORE.find(r => r.id === id)
  if (!rec) throw new ServiceError('not_found', `Appointment ${id} not found.`)
  return rec
}

// ─── Reads ──────────────────────────────────────────────────────────────────────

/** Queue of records this actor may act on, by their role + assignment. */
export async function fetchApprovalQueue(actor: Actor): Promise<ApprovalRecord[]> {
  if (DATA_SOURCE === 'supabase') {
    // The backend scopes the list by the signed-in actor (from the JWT).
    const res = await api.get<{ appointments: ApprovalRecord[] }>('/appointments')
    return res.appointments
  }
  await delay(250)
  // super_admin + admin_dispatcher see everything; coordinator_authority sees
  // items assigned to their role.
  return STORE.filter(rec => {
    if (actor.role === 'super_admin' || actor.role === 'admin_dispatcher') return true
    if (rec.assignedRole !== actor.role) return false
    if (actor.role === 'coordinator_authority') {
      return rec.assignedToId === actor.id || true // demo: show all of the role
    }
    return true
  })
}

export async function fetchApproval(id: string): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.get<{ appointment: ApprovalRecord }>(`/appointments/${id}`)
    return res.appointment
  }
  await delay(150)
  return { ...find(id) }
}

export async function fetchAppointmentTimeline(id: string): Promise<AuditEvent[]> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.get<{ timeline: AuditEvent[] }>(`/appointments/${id}/timeline`)
    return res.timeline
  }
  await delay(100)
  return getTimeline(id)
}

// ─── Writes ───────────────────────────────────────────────────────────────────

function applyTransition(
  rec: ApprovalRecord,
  to: AppointmentStatus,
  actor: Actor,
  action: Parameters<typeof recordEvent>[0]['action'],
  summary: string,
  detail?: string,
  visibleToRequester = true,
) {
  assertTransition(rec.status, to)   // throws on illegal transition
  const from = rec.status
  rec.status = to
  rec.updatedAt = new Date().toISOString()
  recordEvent({
    appointmentId: rec.id,
    action,
    actorId:   actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    summary,
    detail,
    fromStatus: from,
    toStatus:   to,
    visibleToRequester,
  })
}

/**
 * Approve a submitted request. Moves submitted → approved.
 * Per the department flow, the authority provides the slot during approval: if
 * the request has no date/time yet, `slot` must be supplied and is written to
 * the record. If the request already carries a slot, `slot` is optional.
 */
export interface ApproveOptions {
  note?: string
  slot?: { date: string; time: string }
  meetingUrl?: string
  confirm?: boolean
}

export async function approveAppointment(
  id: string, actor: Actor, opts: ApproveOptions | string = {},
): Promise<ApprovalRecord> {
  const isConfirming = typeof opts === 'string' ? false : (opts.confirm === true)
  if (DATA_SOURCE === 'supabase') {
    const body = typeof opts === 'string' ? { note: opts } : opts
    const res = await api.post<{ appointment: ApprovalRecord }>(`/appointments/${id}/approve`, body)
    if (body.confirm) {
      try {
        sendAppointmentConfirmationEmail(res.appointment)
      } catch (err) {
        console.warn('Confirmation email dispatch warning:', err)
      }
    }
    return res.appointment
  }
  await delay(300)
  requirePermission(actor, 'appointment.approve')
  // Backward compatible: a bare string is treated as the note.
  const { note, slot, meetingUrl } = typeof opts === 'string' ? { note: opts, slot: undefined, meetingUrl: undefined } : opts

  const rec = find(id)
  if (rec.status === 'confirmed') {
    throw new ServiceError('duplicate', 'This request has already been confirmed.')
  }
  if (rec.status === 'approved' && !isConfirming) {
    throw new ServiceError('duplicate', 'This request has already been approved.')
  }

  const alreadyHasSlot = !!rec.date && !!rec.time
  if (!alreadyHasSlot) {
    // The requester left the slot for the authority to decide. A time is
    // required to approve such a request.
    if (!slot || !slot.date || !slot.time) {
      throw new ServiceError('illegal_transition', 'Provide a date and time to approve this request.')
    }
    rec.date = slot.date
    rec.time = slot.time
  } else if (slot && slot.date && slot.time) {
    // Authority overrides the requester's preferred slot at approval.
    rec.date = slot.date
    rec.time = slot.time
  }

  if (meetingUrl && meetingUrl.trim()) {
    rec.meetingUrl = meetingUrl.trim()
    rec.locationLabel = meetingUrl.trim()
  } else if (rec.mode === 'online' && !rec.meetingUrl) {
    rec.meetingUrl = generateGoogleMeetLink(rec.id)
    rec.locationLabel = rec.meetingUrl
  }

  const slotDetail = `Scheduled for ${rec.date} at ${rec.time}.`
  const meetNote = rec.mode === 'online' && rec.meetingUrl ? ` Google Meet link: ${rec.meetingUrl}.` : ''
  const detail = note ? `${slotDetail}${meetNote} ${note}` : `${slotDetail}${meetNote}`

  if (rec.status !== 'approved') {
    applyTransition(rec, 'approved', actor, 'approved', `Approved by ${actor.name}.`, detail)
  }

  if (isConfirming) {
    applyTransition(rec, 'confirmed', actor, 'confirmed', `Confirmed by ${actor.name}.`)
    rec.assignedStage = 'Confirmed'
    recordEvent({
      appointmentId: rec.id, action: 'notification-sent',
      actorId: 'system', actorName: 'System', actorRole: 'system',
      summary: 'Confirmation sent to the requester by website and email.',
      detail: `Appointment confirmed for ${rec.date} at ${rec.time}.${meetNote}`,
    })
    try {
      sendAppointmentConfirmationEmail(rec)
    } catch (err) {
      console.warn('Confirmation email dispatch warning:', err)
    }
  } else {
    rec.assignedStage = 'Confirmation pending'
  }

  return { ...rec }
}

/** Reject a request. Reason is required (PRD §6.12). */
export async function rejectAppointment(id: string, actor: Actor, reason: string): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ appointment: ApprovalRecord }>(`/appointments/${id}/reject`, { reason })
    return res.appointment
  }
  await delay(300)
  requirePermission(actor, 'appointment.reject')
  if (!reason.trim()) {
    throw new ServiceError('illegal_transition', 'A reason is required to reject a request.')
  }
  const rec = find(id)
  applyTransition(rec, 'rejected', actor, 'rejected', `Rejected by ${actor.name}.`, reason)
  rec.assignedStage = 'Rejected'
  return { ...rec }
}

/** Request additional information from the requester. */
export async function requestInfo(id: string, actor: Actor, message: string): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ appointment: ApprovalRecord }>(`/appointments/${id}/request-info`, { message })
    return res.appointment
  }
  await delay(300)
  requirePermission(actor, 'appointment.requestInfo')
  if (!message.trim()) {
    throw new ServiceError('illegal_transition', 'Describe what information is needed.')
  }
  const rec = find(id)
  applyTransition(rec, 'additional-info', actor, 'info-requested', `Information requested by ${actor.name}.`, message)
  rec.assignedStage = 'Awaiting requester'
  return { ...rec }
}

/**
 * Confirm an approved appointment. Moves approved → confirmed (explicit step).
 * On confirmation the requester is notified via the website and email (recorded
 * in the timeline), matching the department flow: confirmation via website and
 * email notification after approval + slot.
 */
export async function confirmAppointment(id: string, actor: Actor): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ appointment: ApprovalRecord }>(`/appointments/${id}/confirm`, {})
    return res.appointment
  }
  await delay(300)
  requirePermission(actor, 'appointment.confirm')
  const rec = find(id)
  if (rec.status === 'confirmed') {
    throw new ServiceError('duplicate', 'This appointment is already confirmed.')
  }
  if (!rec.date || !rec.time) {
    throw new ServiceError('illegal_transition', 'A date and time must be set before confirming.')
  }
  if (rec.mode === 'online') {
    if (!rec.meetingUrl) {
      rec.meetingUrl = generateGoogleMeetLink(rec.id)
    }
    rec.locationLabel = rec.meetingUrl
  }

  applyTransition(rec, 'confirmed', actor, 'confirmed', `Confirmed by ${actor.name}.`)
  rec.assignedStage = 'Confirmed'
  // Record the confirmation notification (website + email).
  const meetNote = rec.mode === 'online' && rec.meetingUrl ? ` Google Meet link: ${rec.meetingUrl}.` : ''
  recordEvent({
    appointmentId: rec.id, action: 'notification-sent',
    actorId: 'system', actorName: 'System', actorRole: 'system',
    summary: 'Confirmation sent to the requester by website and email.',
    detail: `Appointment confirmed for ${rec.date} at ${rec.time}.${meetNote}`,
  })
  try {
    sendAppointmentConfirmationEmail(rec)
  } catch (err) {
    console.warn('Confirmation email dispatch warning:', err)
  }
  return { ...rec }
}

/** Update Google Meet / online meeting URL directly */
export async function updateMeetingUrl(id: string, actor: Actor, meetingUrl: string): Promise<ApprovalRecord> {
  const cleanUrl = meetingUrl.trim()
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ appointment: ApprovalRecord }>(`/appointments/${id}/meeting-url`, { meetingUrl: cleanUrl })
    return res.appointment
  }
  await delay(200)
  const rec = find(id)
  rec.meetingUrl = cleanUrl
  if (rec.mode === 'online') {
    rec.locationLabel = cleanUrl
  }
  recordEvent({
    appointmentId: rec.id,
    action: 'internal-remark',
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    summary: `Google Meet link updated by ${actor.name}.`,
    detail: cleanUrl,
  })
  return { ...rec }
}

/** Forward to another role for approval (coordinator escalation). */
export async function forwardForApproval(id: string, actor: Actor, toRole: Role): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ appointment: ApprovalRecord }>(`/appointments/${id}/forward`, { toRole })
    return res.appointment
  }
  await delay(250)
  requirePermission(actor, 'appointment.forward')
  const rec = find(id)
  rec.assignedRole = toRole
  rec.assignedStage = 'Forwarded for approval'
  rec.updatedAt = new Date().toISOString()
  recordEvent({
    appointmentId: rec.id, action: 'forwarded',
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    summary: `Forwarded to ${toRole} by ${actor.name}.`,
  })
  return { ...rec }
}

/** Add an internal remark — hidden from the requester. */
export async function addInternalRemark(id: string, actor: Actor, text: string): Promise<AuditEvent> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ event: AuditEvent }>(`/appointments/${id}/internal-remark`, { text })
    return res.event
  }
  await delay(200)
  requirePermission(actor, 'appointment.internalRemark')
  if (!text.trim()) throw new ServiceError('illegal_transition', 'Enter a remark.')
  const rec = find(id)
  return recordEvent({
    appointmentId: rec.id, action: 'internal-remark',
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    summary: `Internal remark by ${actor.name}.`, detail: text,
    visibleToRequester: false,
  })
}

/**
 * Propose a new date/time (authority/coordinator). Moves the current status to
 * `rescheduled` and records the proposed slot for the requester to respond to.
 * Legal from submitted / approved / confirmed (per the status machine).
 */
export async function proposeReschedule(
  id: string, actor: Actor, proposedDate: string, proposedTime: string, note?: string,
): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ appointment: ApprovalRecord }>(`/appointments/${id}/propose-reschedule`, { proposedDate, proposedTime, note })
    return res.appointment
  }
  await delay(300)
  requirePermission(actor, 'appointment.proposeReschedule')
  if (!proposedDate || !proposedTime) {
    throw new ServiceError('illegal_transition', 'A new date and time are required to reschedule.')
  }
  const rec = find(id)
  const detail = `New slot proposed: ${proposedDate} at ${proposedTime}.${note ? ` ${note}` : ''}`
  applyTransition(rec, 'rescheduled', actor, 'reschedule-proposed', `Reschedule proposed by ${actor.name}.`, detail)
  rec.proposedDate = proposedDate
  rec.proposedTime = proposedTime
  rec.assignedStage = 'Awaiting requester'
  return { ...rec }
}

/**
 * Requester responds to a reschedule proposal.
 * accept -> moves rescheduled → confirmed and applies the proposed slot.
 * decline -> moves rescheduled → cancelled.
 */
export async function respondReschedule(
  id: string, actor: Actor, decision: 'accept' | 'decline',
): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ appointment: ApprovalRecord }>(`/appointments/${id}/respond-reschedule`, { decision })
    return res.appointment
  }
  await delay(300)
  requirePermission(actor, 'appointment.respondReschedule')
  const rec = find(id)
  if (rec.status !== 'rescheduled') {
    throw new ServiceError('illegal_transition', 'There is no pending reschedule to respond to.')
  }
  if (decision === 'accept') {
    if (rec.proposedDate) rec.date = rec.proposedDate
    if (rec.proposedTime) rec.time = rec.proposedTime
    applyTransition(rec, 'confirmed', actor, 'reschedule-accepted', `New schedule accepted by ${actor.name}.`)
    rec.assignedStage = 'Confirmed'
  } else {
    applyTransition(rec, 'cancelled', actor, 'reschedule-declined', `New schedule declined by ${actor.name}.`)
    rec.assignedStage = 'Cancelled'
  }
  rec.proposedDate = undefined
  rec.proposedTime = undefined
  return { ...rec }
}

/**
 * Cancel an appointment. Staff use `appointment.cancel`; the requester uses
 * `appointment.requestCancel`. A reason is required. Legal from any
 * non-terminal status the machine permits a cancel from.
 */
export async function cancelAppointment(id: string, actor: Actor, reason: string): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ appointment: ApprovalRecord }>(`/appointments/${id}/cancel`, { reason })
    return res.appointment
  }
  await delay(300)
  const action: Action = actor.role === 'requester' ? 'appointment.requestCancel' : 'appointment.cancel'
  requirePermission(actor, action)
  if (!reason.trim()) {
    throw new ServiceError('illegal_transition', 'A reason is required to cancel.')
  }
  const rec = find(id)
  applyTransition(rec, 'cancelled', actor, 'cancelled', `Cancelled by ${actor.name}.`, reason)
  rec.assignedStage = 'Cancelled'
  return { ...rec }
}

/**
 * Requester provides the additional information that was requested.
 * Moves additional-info → submitted so the request re-enters review.
 */
export async function provideAdditionalInfo(id: string, actor: Actor, message: string): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ appointment: ApprovalRecord }>(`/appointments/${id}/provide-info`, { message })
    return res.appointment
  }
  await delay(300)
  requirePermission(actor, 'appointment.provideInfo')
  if (!message.trim()) {
    throw new ServiceError('illegal_transition', 'Enter the requested information before sending.')
  }
  const rec = find(id)
  if (rec.status !== 'additional-info') {
    throw new ServiceError('illegal_transition', 'No information was requested for this appointment.')
  }
  applyTransition(rec, 'submitted', actor, 'info-provided', `Information provided by ${actor.name}.`, message)
  rec.assignedStage = 'Authority review'
  return { ...rec }
}

/**
 * Mark a confirmed appointment as not reported — the time passed with no
 * check-in (PRD §8 "Not reported"). Moves confirmed → not-reported.
 */
export async function markNotReported(id: string, actor: Actor): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ appointment: ApprovalRecord }>(`/appointments/${id}/not-reported`, {})
    return res.appointment
  }
  await delay(250)
  requirePermission(actor, 'appointment.markNotReported')
  const rec = find(id)
  applyTransition(rec, 'not-reported', actor, 'not-reported', `Marked not reported by ${actor.name}.`)
  rec.assignedStage = 'Not reported'
  return { ...rec }
}

// ─── Visitor check-in / check-out (reception desk) ────────────────────────────
// check-in and check-out are audit actions, not statuses. A confirmed
// appointment keeps status 'confirmed' through the visit; check-out records the
// departure and transitions confirmed → completed.

/** Record the visitor's arrival. Appointment must be confirmed. */
export async function checkInVisitor(id: string, actor: Actor): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ appointment: ApprovalRecord }>(`/appointments/${id}/check-in`, {})
    return res.appointment
  }
  await delay(250)
  requirePermission(actor, 'visitor.checkIn')
  const rec = find(id)
  if (rec.status !== 'confirmed') {
    throw new ServiceError('illegal_transition', 'Only confirmed appointments can be checked in.')
  }
  if (rec.checkedInAt) {
    throw new ServiceError('duplicate', 'This visitor has already been checked in.')
  }
  rec.checkedInAt = new Date().toISOString()
  rec.assignedStage = 'Checked in'
  rec.updatedAt = rec.checkedInAt
  recordEvent({
    appointmentId: rec.id, action: 'checked-in',
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    summary: `Visitor checked in by ${actor.name}.`,
  })
  return { ...rec }
}

/** Record the visitor's departure and complete the appointment. */
export async function checkOutVisitor(id: string, actor: Actor): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ appointment: ApprovalRecord }>(`/appointments/${id}/check-out`, {})
    return res.appointment
  }
  await delay(250)
  requirePermission(actor, 'visitor.checkOut')
  const rec = find(id)
  if (!rec.checkedInAt) {
    throw new ServiceError('illegal_transition', 'The visitor must be checked in before checking out.')
  }
  if (rec.checkedOutAt) {
    throw new ServiceError('duplicate', 'This visitor has already been checked out.')
  }
  rec.checkedOutAt = new Date().toISOString()
  recordEvent({
    appointmentId: rec.id, action: 'checked-out',
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    summary: `Visitor checked out by ${actor.name}.`,
  })
  // Completing the appointment is the natural end of a visit.
  applyTransition(rec, 'completed', actor, 'completed', `Appointment completed.`)
  rec.assignedStage = 'Completed'
  return { ...rec }
}

/**
 * Reception desk queue: appointments on a given day that reception handles —
 * confirmed (expected / in progress) and completed (already seen).
 * Ordered by time. Requires the check-in capability.
 */
export async function fetchReceptionQueue(actor: Actor, date: string): Promise<ApprovalRecord[]> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.get<{ queue: ApprovalRecord[] }>(`/appointments/reception/queue?date=${encodeURIComponent(date)}`)
    return res.queue
  }
  await delay(200)
  requirePermission(actor, 'visitor.checkIn')
  return STORE
    .filter(rec => visibleTo(actor, rec))
    .filter(rec => rec.date === date)
    .filter(rec => rec.status === 'confirmed' || rec.status === 'completed')
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(rec => ({ ...rec }))
}

// ─── Calendar reads ───────────────────────────────────────────────────────────
// Which appointments an actor may see on the calendar, same visibility rule as
// the approval queue: super_admin/admin_dispatcher see all (admin also runs the
// reception desk); coordinator_authority sees those assigned to their role.
function visibleTo(actor: Actor, rec: ApprovalRecord): boolean {
  if (actor.role === 'super_admin' || actor.role === 'admin_dispatcher') return true
  if (actor.role === 'coordinator_authority') {
    return rec.assignedRole === actor.role
  }
  // requester: only their own
  return rec.requester === actor.name
}

/** Appointments within [from, to] inclusive (ISO yyyy-mm-dd) the actor may see. */
export async function fetchCalendarAppointments(
  actor: Actor, range: { from: string; to: string },
): Promise<ApprovalRecord[]> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.get<{ appointments: ApprovalRecord[] }>(
      `/appointments/calendar?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)
    return res.appointments
  }
  await delay(200)
  return STORE
    .filter(rec => visibleTo(actor, rec))
    .filter(rec => rec.date >= range.from && rec.date <= range.to)
    .map(rec => ({ ...rec }))
}

/** Appointments on a single day, ordered by time. */
export async function fetchDayAppointments(actor: Actor, date: string): Promise<ApprovalRecord[]> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.get<{ appointments: ApprovalRecord[] }>(`/appointments/day?date=${encodeURIComponent(date)}`)
    return res.appointments
  }
  await delay(150)
  return STORE
    .filter(rec => visibleTo(actor, rec))
    .filter(rec => rec.date === date)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(rec => ({ ...rec }))
}

// ─── Availability reads / writes ──────────────────────────────────────────────
/** Read the availability config for an authority (defaults to the actor). */
export async function fetchAvailability(authorityId: string): Promise<Availability | undefined> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.get<{ availability: Availability }>(`/availability/${encodeURIComponent(authorityId)}`)
    return res.availability
  }
  await delay(150)
  const av = AVAILABILITY_STORE.find(a => a.authorityId === authorityId)
  if (!av) return undefined
  return {
    ...av,
    workingHours: av.workingHours.map(w => ({ ...w })),
    holidays:     av.holidays.map(h => ({ ...h })),
  }
}

/**
 * Update availability. An authority may manage only their own
 * (calendar.manageOwn); admin_dispatcher/super_admin may manage any
 * (calendar.manageAny).
 */
export async function updateAvailability(actor: Actor, next: Availability): Promise<Availability> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.put<{ availability: Availability }>(`/availability/${encodeURIComponent(next.authorityId)}`, {
      slotMinutes:  next.slotMinutes,
      workingHours: next.workingHours,
      holidays:     next.holidays,
    })
    return res.availability
  }
  await delay(250)

  const canManageAny = hasPermission(actor.role, 'calendar.manageAny')
  const canManageOwn = hasPermission(actor.role, 'calendar.manageOwn')
  const isOwn = next.authorityId === actor.id

  if (!(canManageAny || (canManageOwn && isOwn))) {
    throw new ServiceError('forbidden', 'You do not have permission to change this availability.')
  }
  if (next.slotMinutes <= 0) {
    throw new ServiceError('illegal_transition', 'Slot length must be greater than zero.')
  }

  const idx = AVAILABILITY_STORE.findIndex(a => a.authorityId === next.authorityId)
  const copy: Availability = {
    ...next,
    workingHours: next.workingHours.map(w => ({ ...w })),
    holidays:     next.holidays.map(h => ({ ...h })),
  }
  if (idx === -1) AVAILABILITY_STORE.push(copy)
  else AVAILABILITY_STORE[idx] = copy

  return {
    ...copy,
    workingHours: copy.workingHours.map(w => ({ ...w })),
    holidays:     copy.holidays.map(h => ({ ...h })),
  }
}

// ─── Reports ──────────────────────────────────────────────────────────────────
/**
 * Compute an analytics report over the appointments the actor may see.
 * reports.viewAll -> every appointment; reports.view -> records assigned to the
 * actor's role (own scope). Requesters have no reporting permission.
 */
export async function fetchReport(actor: Actor, filters: ReportFilters): Promise<ReportSummary> {
  if (DATA_SOURCE === 'supabase' && getToken()) {
    const q = new URLSearchParams({ from: filters.from, to: filters.to })
    if (filters.dateBasis)   q.set('dateBasis', filters.dateBasis)
    if (filters.department)  q.set('department', filters.department)
    if (filters.authorityId) q.set('authorityId', filters.authorityId)
    if (filters.typeId)      q.set('typeId', filters.typeId)
    if (filters.status) {
      const s = Array.isArray(filters.status) ? filters.status.join(',') : filters.status
      if (s) q.set('status', s)
    }
    if (filters.search)      q.set('search', filters.search)
    const res = await api.get<{ report: ReportSummary }>(`/api/reports/overview?${q.toString()}`)
    return res.report
  }
  await delay(250)

  const canAll = hasPermission(actor.role, 'reports.viewAll')
  const canOwn = hasPermission(actor.role, 'reports.view')
  if (!(canAll || canOwn)) {
    throw new ServiceError('forbidden', 'You do not have permission to view reports.')
  }

  const scope = canAll
    ? STORE
    : STORE.filter(rec => visibleTo(actor, rec))

  return computeReport(scope.map(r => ({ ...r })), getAllEvents(), filters)
}

function formatDurationHours(hours: number): string {
  if (!hours || hours <= 0) return '0 min'
  if (hours >= 24) {
    const d = Math.floor(hours / 24)
    const remH = Math.round(hours % 24)
    return remH > 0 ? `${d} d ${remH} h` : `${d} d`
  }
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

function mockRegisterReport(
  records: ApprovalRecord[],
  filters: ReportFilters,
  page = 1,
  pageSize = 10,
  sortBy = 'submittedAt',
  sortOrder: 'asc' | 'desc' = 'desc',
): TableReportResult<RegisterRow> {
  const filtered = applyFilters(records, filters)
  const rows: RegisterRow[] = filtered.map(r => ({
    id: r.id,
    requester: r.requester,
    requesterCategory: r.requesterCategory || 'Staff',
    department: r.department || 'Unspecified',
    authorityName: r.authorityName || 'Unspecified',
    typeName: (r.typeName && r.typeName.trim()) ? r.typeName.trim() : 'Unspecified',
    date: r.date || '',
    time: r.time || '',
    status: r.status,
    submittedAt: r.submittedAt,
  }))

  rows.sort((a, b) => {
    let cmp = 0
    if (sortBy === 'id') cmp = a.id.localeCompare(b.id)
    else if (sortBy === 'requester') cmp = a.requester.localeCompare(b.requester)
    else if (sortBy === 'department') cmp = a.department.localeCompare(b.department)
    else if (sortBy === 'authorityName') cmp = a.authorityName.localeCompare(b.authorityName)
    else if (sortBy === 'typeName') cmp = a.typeName.localeCompare(b.typeName)
    else if (sortBy === 'date') cmp = (a.date || '').localeCompare(b.date || '')
    else if (sortBy === 'status') cmp = a.status.localeCompare(b.status)
    else cmp = a.submittedAt.localeCompare(b.submittedAt)
    if (cmp === 0) cmp = a.id.localeCompare(b.id)
    return sortOrder === 'desc' ? -cmp : cmp
  })

  const start = (page - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
  }
}

function mockPendingReport(
  records: ApprovalRecord[],
  filters: ReportFilters,
  page = 1,
  pageSize = 10,
  sortBy = 'waitingTime',
  sortOrder: 'asc' | 'desc' = 'desc',
): TableReportResult<PendingRow> {
  const filtered = applyFilters(records, filters).filter(r =>
    ['submitted', 'additional-info'].includes(r.status),
  )
  const now = Date.now()
  const rows: PendingRow[] = filtered.map(r => {
    const subTime = new Date(r.submittedAt).getTime()
    const diffHours = Math.max(0, (now - subTime) / (1000 * 60 * 60))
    return {
      id: r.id,
      requester: r.requester,
      typeName: (r.typeName && r.typeName.trim()) ? r.typeName.trim() : 'Unspecified',
      authorityName: r.authorityName || 'Unspecified',
      submittedAt: r.submittedAt,
      waitingTimeHours: diffHours,
      waitingTime: formatDurationHours(diffHours),
      status: r.status,
    }
  })
  rows.sort((a, b) => {
    let cmp = 0
    if (sortBy === 'submittedAt') cmp = a.submittedAt.localeCompare(b.submittedAt)
    else if (sortBy === 'requester') cmp = a.requester.localeCompare(b.requester)
    else if (sortBy === 'typeName') cmp = a.typeName.localeCompare(b.typeName)
    else cmp = a.waitingTimeHours - b.waitingTimeHours
    if (cmp === 0) cmp = a.id.localeCompare(b.id)
    return sortOrder === 'desc' ? -cmp : cmp
  })
  const start = (page - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
  }
}

function mockTurnaroundReport(
  records: ApprovalRecord[],
  events: AuditEvent[],
  filters: ReportFilters,
  page = 1,
  pageSize = 10,
  sortBy = 'decidedAt',
  sortOrder: 'asc' | 'desc' = 'desc',
): TableReportResult<TurnaroundRow> {
  const filtered = applyFilters(records, filters)
  const DECISION = new Set(['approved', 'rejected'])
  const byAppt = new Map<string, AuditEvent[]>()
  for (const e of events) {
    const list = byAppt.get(e.appointmentId) ?? []
    list.push(e)
    byAppt.set(e.appointmentId, list)
  }
  const rows: TurnaroundRow[] = []
  const hoursList: number[] = []

  for (const r of filtered) {
    const evs = (byAppt.get(r.id) ?? [])
      .filter(e => DECISION.has(e.action))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    const first = evs[0]
    if (!first) continue
    const start = new Date(r.submittedAt).getTime()
    const end = new Date(first.timestamp).getTime()
    const durationHours = Math.max(0, (end - start) / (1000 * 60 * 60))
    hoursList.push(durationHours)
    rows.push({
      id: r.id,
      typeName: (r.typeName && r.typeName.trim()) ? r.typeName.trim() : 'Unspecified',
      authorityName: r.authorityName || 'Unspecified',
      submittedAt: r.submittedAt,
      decidedAt: first.timestamp,
      decision: first.action as 'approved' | 'rejected',
      durationHours,
      timeToDecide: formatDurationHours(durationHours),
      decidedBy: first.actorName || 'Authority',
    })
  }

  rows.sort((a, b) => {
    let cmp = 0
    if (sortBy === 'durationHours' || sortBy === 'timeToDecide') cmp = a.durationHours - b.durationHours
    else if (sortBy === 'submittedAt') cmp = a.submittedAt.localeCompare(b.submittedAt)
    else if (sortBy === 'decision') cmp = a.decision.localeCompare(b.decision)
    else if (sortBy === 'typeName') cmp = a.typeName.localeCompare(b.typeName)
    else cmp = a.decidedAt.localeCompare(b.decidedAt)
    if (cmp === 0) cmp = a.id.localeCompare(b.id)
    return sortOrder === 'desc' ? -cmp : cmp
  })

  const n = hoursList.length
  let avgHours = 0
  let medianHours = 0
  let maxHours = 0
  if (n > 0) {
    avgHours = hoursList.reduce((acc, h) => acc + h, 0) / n
    maxHours = Math.max(...hoursList)
    const sorted = [...hoursList].sort((a, b) => a - b)
    const mid = Math.floor(n / 2)
    medianHours = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  }

  const start = (page - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
    summary: {
      average: formatDurationHours(avgHours),
      median: formatDurationHours(medianHours),
      longest: formatDurationHours(maxHours),
      decidedRequests: n,
    },
  }
}

function mockChangesReport(
  records: ApprovalRecord[],
  events: AuditEvent[],
  filters: ReportFilters,
  page = 1,
  pageSize = 10,
  sortBy = 'changedOn',
  sortOrder: 'asc' | 'desc' = 'desc',
): TableReportResult<ChangeRow> {
  const filtered = applyFilters(records, filters)
  const CHANGE_ACTIONS = new Set(['reschedule-proposed', 'reschedule-accepted', 'cancelled'])
  const byAppt = new Map<string, AuditEvent[]>()
  for (const e of events) {
    const list = byAppt.get(e.appointmentId) ?? []
    list.push(e)
    byAppt.set(e.appointmentId, list)
  }
  const rows: ChangeRow[] = []
  for (const r of filtered) {
    const evs = (byAppt.get(r.id) ?? [])
      .filter(e => CHANGE_ACTIONS.has(e.action))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    if (evs.length > 0) {
      for (const ev of evs) {
        const isCancel = ev.action === 'cancelled'
        rows.push({
          id: r.id,
          typeName: (r.typeName && r.typeName.trim()) ? r.typeName.trim() : 'Unspecified',
          change: isCancel ? 'Cancelled' : 'Rescheduled',
          initiatedBy: ev.actorName || 'Staff',
          originalTime: r.date && r.time ? `${r.date} ${r.time}` : 'Not scheduled',
          newTime: isCancel ? '—' : (r.proposedDate && r.proposedTime ? `${r.proposedDate} ${r.proposedTime}` : (r.date && r.time ? `${r.date} ${r.time}` : '—')),
          reason: ev.detail || '—',
          changedOn: ev.timestamp,
        })
      }
    } else if (r.status === 'rescheduled' || r.status === 'cancelled') {
      rows.push({
        id: r.id,
        typeName: (r.typeName && r.typeName.trim()) ? r.typeName.trim() : 'Unspecified',
        change: r.status === 'cancelled' ? 'Cancelled' : 'Rescheduled',
        initiatedBy: 'Staff',
        originalTime: r.date && r.time ? `${r.date} ${r.time}` : 'Not scheduled',
        newTime: r.status === 'cancelled' ? '—' : (r.proposedDate && r.proposedTime ? `${r.proposedDate} ${r.proposedTime}` : '—'),
        reason: '—',
        changedOn: r.updatedAt || r.submittedAt,
      })
    }
  }

  rows.sort((a, b) => {
    let cmp = 0
    if (sortBy === 'change') cmp = a.change.localeCompare(b.change)
    else if (sortBy === 'typeName') cmp = a.typeName.localeCompare(b.typeName)
    else cmp = a.changedOn.localeCompare(b.changedOn)
    if (cmp === 0) cmp = a.id.localeCompare(b.id)
    return sortOrder === 'desc' ? -cmp : cmp
  })

  const start = (page - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
  }
}

export async function fetchReportTable<T>(
  actor: Actor,
  type: 'register' | 'pending' | 'turnaround' | 'changes',
  filters: ReportFilters,
  pagination: { page?: number; pageSize?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' } = {},
): Promise<TableReportResult<T>> {
  if (DATA_SOURCE === 'supabase' && getToken()) {
    const q = new URLSearchParams({ from: filters.from, to: filters.to })
    if (filters.dateBasis)   q.set('dateBasis', filters.dateBasis)
    if (filters.department)  q.set('department', filters.department)
    if (filters.authorityId) q.set('authorityId', filters.authorityId)
    if (filters.typeId)      q.set('typeId', filters.typeId)
    if (filters.status) {
      const s = Array.isArray(filters.status) ? filters.status.join(',') : filters.status
      if (s) q.set('status', s)
    }
    if (filters.search)      q.set('search', filters.search)
    if (pagination.page)     q.set('page', String(pagination.page))
    if (pagination.pageSize) q.set('pageSize', String(pagination.pageSize))
    if (pagination.sortBy)   q.set('sortBy', pagination.sortBy)
    if (pagination.sortOrder) q.set('sortOrder', pagination.sortOrder)

    const res = await api.get<{ report: TableReportResult<T> }>(`/api/reports/${type}?${q.toString()}`)
    return res.report
  }

  await delay(250)
  const canAll = hasPermission(actor.role, 'reports.viewAll')
  const canOwn = hasPermission(actor.role, 'reports.view')
  if (!(canAll || canOwn)) {
    throw new ServiceError('forbidden', 'You do not have permission to view reports.')
  }
  const scope = canAll ? STORE : STORE.filter(rec => visibleTo(actor, rec))

  if (type === 'register') {
    return mockRegisterReport(
      scope,
      filters,
      pagination.page,
      pagination.pageSize,
      pagination.sortBy,
      pagination.sortOrder,
    ) as unknown as TableReportResult<T>
  }

  if (type === 'pending') {
    return mockPendingReport(
      scope,
      filters,
      pagination.page,
      pagination.pageSize,
      pagination.sortBy,
      pagination.sortOrder,
    ) as unknown as TableReportResult<T>
  }

  if (type === 'turnaround') {
    return mockTurnaroundReport(
      scope,
      getAllEvents(),
      filters,
      pagination.page,
      pagination.pageSize,
      pagination.sortBy,
      pagination.sortOrder,
    ) as unknown as TableReportResult<T>
  }

  if (type === 'changes') {
    return mockChangesReport(
      scope,
      getAllEvents(),
      filters,
      pagination.page,
      pagination.pageSize,
      pagination.sortBy,
      pagination.sortOrder,
    ) as unknown as TableReportResult<T>
  }

  return { rows: [], total: 0, page: 1, pageSize: 10 } as unknown as TableReportResult<T>
}

export async function downloadReportCsv(
  actor: Actor,
  type: string,
  filters: ReportFilters,
): Promise<void> {
  const q = new URLSearchParams({ from: filters.from, to: filters.to })
  if (filters.dateBasis)   q.set('dateBasis', filters.dateBasis)
  if (filters.department)  q.set('department', filters.department)
  if (filters.authorityId) q.set('authorityId', filters.authorityId)
  if (filters.typeId)      q.set('typeId', filters.typeId)
  if (filters.status) {
    const s = Array.isArray(filters.status) ? filters.status.join(',') : filters.status
    if (s) q.set('status', s)
  }
  if (filters.search)      q.set('search', filters.search)

  if (DATA_SOURCE === 'supabase') {
    const token = getToken()
    const url = `${baseUrl()}/api/reports/${type}/export.csv?${q.toString()}`
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new ServiceError('validation', err?.error?.message || 'Export failed')
    }
    const cd = res.headers.get('Content-Disposition')
    let filename = `${type}_${filters.from}_to_${filters.to}.csv`
    if (cd) {
      const match = cd.match(/filename="?([^"]+)"?/)
      if (match && match[1]) filename = match[1]
    }
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
    return
  }

  // Offline mock fallback
  const filename = `${type}_${filters.from}_to_${filters.to}.csv`
  const blob = new Blob(['\uFEFFAppointment ID,Status\r\nAPT-1,Submitted'], { type: 'text/csv;charset=utf-8' })
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}

// ─── Master data (super admin) ────────────────────────────────────────────────
let masterSeq = 1000
function nextMasterId(prefix: string): string {
  return `${prefix}-${++masterSeq}`
}

function requireMaster(actor: Actor) {
  requirePermission(actor, 'master.manage')
}

function cloneMaster(): MasterData {
  return {
    departments: MASTER.departments.map(d => ({ ...d })),
    types:       MASTER.types.map(t => ({ ...t })),
    authorities: MASTER.authorities.map(a => ({ ...a, typeIds: [...a.typeIds] })),
  }
}

/** Read all master data. Requires master.manage. */
export async function fetchMasterData(actor: Actor): Promise<MasterData> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.get<{ master: MasterData }>('/master')
    return res.master
  }
  await delay(200)
  requireMaster(actor)
  return cloneMaster()
}

// Non-gated reference reads for the booking flow: which master-data entries are
// currently active. The booking flow already surfaces reference data to every
// role, so these carry no permission gate — they simply let admin "active"
// toggles flow through to what a requester can book. Synchronous (no network
// simulation) so booking's reference queries can consult them inline.
export function activeTypeIds(): Set<string> {
  return new Set(MASTER.types.filter(t => t.active).map(t => t.id))
}
export function activeAuthorityIds(): Set<string> {
  return new Set(MASTER.authorities.filter(a => a.active).map(a => a.id))
}

// ── Departments ──
export async function createDepartment(actor: Actor, input: Omit<Department, 'id'>): Promise<Department> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ department: Department }>('/master/departments', input)
    return res.department
  }
  await delay(200)
  requireMaster(actor)
  if (!isNonEmpty(input.name)) throw new ServiceError('validation', 'Department name is required.')
  if (!isNonEmpty(input.code)) throw new ServiceError('validation', 'Department code is required.')
  if (MASTER.departments.some(d => sameName(d.name, input.name))) {
    throw new ServiceError('duplicate', 'A department with this name already exists.')
  }
  const dept: Department = { ...input, name: input.name.trim(), code: input.code.trim(), id: nextMasterId('dept') }
  MASTER.departments.push(dept)
  return { ...dept }
}

export async function updateDepartment(actor: Actor, dept: Department): Promise<Department> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.put<{ department: Department }>(`/master/departments/${encodeURIComponent(dept.id)}`, dept)
    return res.department
  }
  await delay(200)
  requireMaster(actor)
  if (!isNonEmpty(dept.name)) throw new ServiceError('validation', 'Department name is required.')
  const idx = MASTER.departments.findIndex(d => d.id === dept.id)
  if (idx === -1) throw new ServiceError('not_found', 'Department not found.')
  if (MASTER.departments.some(d => d.id !== dept.id && sameName(d.name, dept.name))) {
    throw new ServiceError('duplicate', 'A department with this name already exists.')
  }
  MASTER.departments[idx] = { ...dept, name: dept.name.trim(), code: dept.code.trim() }
  return { ...MASTER.departments[idx] }
}

export async function deleteDepartment(actor: Actor, id: string): Promise<void> {
  if (DATA_SOURCE === 'supabase') {
    await api.del<void>(`/master/departments/${encodeURIComponent(id)}`)
    return
  }
  await delay(200)
  requireMaster(actor)
  const dept = MASTER.departments.find(d => d.id === id)
  if (!dept) throw new ServiceError('not_found', 'Department not found.')
  // Guard: block if an authority still belongs to this department.
  if (MASTER.authorities.some(a => a.department === dept.name)) {
    throw new ServiceError('in_use', 'This department is assigned to one or more authorities.')
  }
  MASTER.departments = MASTER.departments.filter(d => d.id !== id)
}

// ── Appointment types ──
export async function createAppointmentType(actor: Actor, input: Omit<MasterAppointmentType, 'id'>): Promise<MasterAppointmentType> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ type: MasterAppointmentType }>('/master/types', input)
    return res.type
  }
  await delay(200)
  requireMaster(actor)
  if (!isNonEmpty(input.name)) throw new ServiceError('validation', 'Type name is required.')
  if (input.defaultDurationMinutes <= 0) throw new ServiceError('validation', 'Duration must be greater than zero.')
  if (MASTER.types.some(t => sameName(t.name, input.name))) {
    throw new ServiceError('duplicate', 'An appointment type with this name already exists.')
  }
  const type: MasterAppointmentType = { ...input, name: input.name.trim(), id: nextMasterId('type') }
  MASTER.types.push(type)
  return { ...type }
}

export async function updateAppointmentType(actor: Actor, type: MasterAppointmentType): Promise<MasterAppointmentType> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.put<{ type: MasterAppointmentType }>(`/master/types/${encodeURIComponent(type.id)}`, type)
    return res.type
  }
  await delay(200)
  requireMaster(actor)
  if (!isNonEmpty(type.name)) throw new ServiceError('validation', 'Type name is required.')
  if (type.defaultDurationMinutes <= 0) throw new ServiceError('validation', 'Duration must be greater than zero.')
  const idx = MASTER.types.findIndex(t => t.id === type.id)
  if (idx === -1) throw new ServiceError('not_found', 'Appointment type not found.')
  if (MASTER.types.some(t => t.id !== type.id && sameName(t.name, type.name))) {
    throw new ServiceError('duplicate', 'An appointment type with this name already exists.')
  }
  MASTER.types[idx] = { ...type, name: type.name.trim() }
  return { ...MASTER.types[idx] }
}

export async function deleteAppointmentType(actor: Actor, id: string): Promise<void> {
  if (DATA_SOURCE === 'supabase') {
    await api.del<void>(`/master/types/${encodeURIComponent(id)}`)
    return
  }
  await delay(200)
  requireMaster(actor)
  const type = MASTER.types.find(t => t.id === id)
  if (!type) throw new ServiceError('not_found', 'Appointment type not found.')
  // Guard: block if an authority still handles this type.
  if (MASTER.authorities.some(a => a.typeIds.includes(id))) {
    throw new ServiceError('in_use', 'This type is handled by one or more authorities.')
  }
  MASTER.types = MASTER.types.filter(t => t.id !== id)
}

// ── Authorities ──
export async function createAuthority(actor: Actor, input: Omit<MasterAuthority, 'id'>): Promise<MasterAuthority> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ authority: MasterAuthority }>('/master/authorities', input)
    return res.authority
  }
  await delay(200)
  requireMaster(actor)
  if (!isNonEmpty(input.name)) throw new ServiceError('validation', 'Authority name is required.')
  if (!isNonEmpty(input.department)) throw new ServiceError('validation', 'Department is required.')
  if (MASTER.authorities.some(a => sameName(a.name, input.name))) {
    throw new ServiceError('duplicate', 'An authority with this name already exists.')
  }
  const auth: MasterAuthority = { ...input, name: input.name.trim(), typeIds: [...input.typeIds], id: nextMasterId('auth') }
  MASTER.authorities.push(auth)
  return { ...auth, typeIds: [...auth.typeIds] }
}

export async function updateAuthority(actor: Actor, auth: MasterAuthority): Promise<MasterAuthority> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.put<{ authority: MasterAuthority }>(`/master/authorities/${encodeURIComponent(auth.id)}`, auth)
    return res.authority
  }
  await delay(200)
  requireMaster(actor)
  if (!isNonEmpty(auth.name)) throw new ServiceError('validation', 'Authority name is required.')
  if (!isNonEmpty(auth.department)) throw new ServiceError('validation', 'Department is required.')
  const idx = MASTER.authorities.findIndex(a => a.id === auth.id)
  if (idx === -1) throw new ServiceError('not_found', 'Authority not found.')
  if (MASTER.authorities.some(a => a.id !== auth.id && sameName(a.name, auth.name))) {
    throw new ServiceError('duplicate', 'An authority with this name already exists.')
  }
  MASTER.authorities[idx] = { ...auth, name: auth.name.trim(), typeIds: [...auth.typeIds] }
  return { ...MASTER.authorities[idx], typeIds: [...MASTER.authorities[idx].typeIds] }
}

export async function deleteAuthority(actor: Actor, id: string): Promise<void> {
  if (DATA_SOURCE === 'supabase') {
    await api.del<void>(`/master/authorities/${encodeURIComponent(id)}`)
    return
  }
  await delay(200)
  requireMaster(actor)
  const auth = MASTER.authorities.find(a => a.id === id)
  if (!auth) throw new ServiceError('not_found', 'Authority not found.')
  // Guard: block if the authority still has appointments assigned to them.
  if (STORE.some(rec => rec.authorityId === id && !['completed', 'cancelled', 'rejected', 'not-reported'].includes(rec.status))) {
    throw new ServiceError('in_use', 'This authority has active appointments assigned.')
  }
  MASTER.authorities = MASTER.authorities.filter(a => a.id !== id)
}

// ─── User management (super admin) ────────────────────────────────────────────
function requireUserAdmin(actor: Actor) {
  requirePermission(actor, 'user.manage')
}

function countActiveSuperAdmins(excludeId?: string): number {
  return USERS.filter(u => u.role === 'super_admin' && u.active && u.id !== excludeId).length
}

/** Read all user accounts. Requires user.manage. */
export async function fetchUsers(actor: Actor): Promise<ManagedUser[]> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.get<{ users: ManagedUser[] }>('/users')
    return res.users
  }
  await delay(200)
  requireUserAdmin(actor)
  return USERS.map(u => ({ ...u }))
}

function validateUser(input: Omit<ManagedUser, 'id'>, excludeId?: string) {
  if (!isNonEmptyUser(input.name)) throw new ServiceError('validation', 'Name is required.')
  if (!isValidEmail(input.email))  throw new ServiceError('validation', 'A valid email is required.')
  if (!ROLES.includes(input.role)) throw new ServiceError('validation', 'A valid role is required.')
  if (USERS.some(u => u.id !== excludeId && sameEmail(u.email, input.email))) {
    throw new ServiceError('duplicate', 'A user with this email already exists.')
  }
}

export async function createUser(actor: Actor, input: Omit<ManagedUser, 'id'>): Promise<ManagedUser> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.post<{ user: ManagedUser }>('/users', input)
    return res.user
  }
  await delay(250)
  requireUserAdmin(actor)
  validateUser(input)
  const user: ManagedUser = {
    ...input,
    name:  input.name.trim(),
    email: input.email.trim(),
    id:    `u-${++userSeq}`,
  }
  USERS.push(user)
  return { ...user }
}

export async function updateUser(actor: Actor, user: ManagedUser): Promise<ManagedUser> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.put<{ user: ManagedUser }>(`/users/${encodeURIComponent(user.id)}`, user)
    return res.user
  }
  await delay(250)
  requireUserAdmin(actor)
  const idx = USERS.findIndex(u => u.id === user.id)
  if (idx === -1) throw new ServiceError('not_found', 'User not found.')
  validateUser(user, user.id)
  // Guard: do not strip the role or deactivate the last active super admin.
  const was = USERS[idx]
  const losesLastSuperAdmin =
    was.role === 'super_admin' && was.active &&
    (user.role !== 'super_admin' || !user.active) &&
    countActiveSuperAdmins(user.id) === 0
  if (losesLastSuperAdmin) {
    throw new ServiceError('in_use', 'At least one active super admin is required.')
  }
  USERS[idx] = { ...user, name: user.name.trim(), email: user.email.trim() }
  return { ...USERS[idx] }
}

export async function setUserActive(actor: Actor, id: string, active: boolean): Promise<ManagedUser> {
  if (DATA_SOURCE === 'supabase') {
    const res = await api.patch<{ user: ManagedUser }>(`/users/${encodeURIComponent(id)}/active`, { active })
    return res.user
  }
  await delay(200)
  requireUserAdmin(actor)
  const user = USERS.find(u => u.id === id)
  if (!user) throw new ServiceError('not_found', 'User not found.')
  if (!active && id === actor.id) {
    throw new ServiceError('in_use', 'You cannot deactivate your own account.')
  }
  if (!active && user.role === 'super_admin' && countActiveSuperAdmins(id) === 0) {
    throw new ServiceError('in_use', 'At least one active super admin is required.')
  }
  user.active = active
  return { ...user }
}

export async function deleteUser(actor: Actor, id: string): Promise<void> {
  if (DATA_SOURCE === 'supabase') {
    await api.del<void>(`/users/${encodeURIComponent(id)}`)
    return
  }
  await delay(250)
  requireUserAdmin(actor)
  const user = USERS.find(u => u.id === id)
  if (!user) throw new ServiceError('not_found', 'User not found.')
  if (id === actor.id) {
    throw new ServiceError('in_use', 'You cannot delete your own account.')
  }
  if (user.role === 'super_admin' && user.active && countActiveSuperAdmins(id) === 0) {
    throw new ServiceError('in_use', 'At least one active super admin is required.')
  }
  USERS = USERS.filter(u => u.id !== id)
}

// ─── Test helpers ─────────────────────────────────────────────────────────────
export function __resetApprovals() {
  STORE.length = 0
  SEED_APPROVALS.forEach(r => STORE.push({ ...r }))
}

export function __resetAvailability() {
  AVAILABILITY_STORE.length = 0
  SEED_AVAILABILITY.forEach(a => AVAILABILITY_STORE.push({
    ...a,
    workingHours: a.workingHours.map(w => ({ ...w })),
    holidays:     a.holidays.map(h => ({ ...h })),
  }))
}

export function __resetMasterData() {
  MASTER = seedMasterData()
  masterSeq = 1000
}

export function __resetUsers() {
  USERS = seedUsers()
  userSeq = 2000
}
