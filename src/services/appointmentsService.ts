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
import { computeReport, type ReportFilters, type ReportSummary } from '../data/reportTypes'
import {
  seedMasterData, sameName, isNonEmpty,
  type MasterData, type Department, type MasterAppointmentType, type MasterAuthority,
} from '../data/masterData'
import {
  seedUsers, isValidEmail, sameEmail, isNonEmpty as isNonEmptyUser,
  type ManagedUser,
} from '../data/userData'
import { ROLES } from '../config/permissions'

// ─── Config: which implementation backs this service ─────────────────────────
// Flip to 'supabase' when the backend is wired. Only this module reads it.
const DATA_SOURCE: 'mock' | 'supabase' =
  (import.meta.env.VITE_DATA_SOURCE as 'mock' | 'supabase') ?? 'mock'

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
export type ServiceErrorCode = 'forbidden' | 'illegal_transition' | 'duplicate' | 'not_found' | 'validation' | 'in_use'

export class ServiceError extends Error {
  constructor(public code: ServiceErrorCode, message: string) {
    super(message)
  }
}

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
    // TODO(backend): GET /appointments?assignedRole=... with RLS
    throw new Error('Supabase implementation not wired yet.')
  }
  await delay(250)
  // super_admin + admin_dispatcher see everything; others see items assigned to
  // their role (and, for authority/coordinator, their own id).
  return STORE.filter(rec => {
    if (actor.role === 'super_admin' || actor.role === 'admin_dispatcher') return true
    if (rec.assignedRole !== actor.role) return false
    // authority/coordinator only their own assignments
    if (actor.role === 'authority' || actor.role === 'coordinator') {
      return rec.assignedToId === actor.id || true // demo: show all of the role
    }
    return true
  })
}

export async function fetchApproval(id: string): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
  await delay(150)
  return { ...find(id) }
}

export async function fetchAppointmentTimeline(id: string): Promise<AuditEvent[]> {
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
}

export async function approveAppointment(
  id: string, actor: Actor, opts: ApproveOptions | string = {},
): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
  await delay(300)
  requirePermission(actor, 'appointment.approve')
  // Backward compatible: a bare string is treated as the note.
  const { note, slot } = typeof opts === 'string' ? { note: opts, slot: undefined } : opts

  const rec = find(id)
  if (rec.status === 'approved') {
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

  const slotDetail = `Scheduled for ${rec.date} at ${rec.time}.`
  const detail = note ? `${slotDetail} ${note}` : slotDetail
  applyTransition(rec, 'approved', actor, 'approved', `Approved by ${actor.name}.`, detail)
  rec.assignedStage = 'Confirmation pending'
  return { ...rec }
}

/** Reject a request. Reason is required (PRD §6.12). */
export async function rejectAppointment(id: string, actor: Actor, reason: string): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
  await delay(300)
  requirePermission(actor, 'appointment.confirm')
  const rec = find(id)
  if (rec.status === 'confirmed') {
    throw new ServiceError('duplicate', 'This appointment is already confirmed.')
  }
  if (!rec.date || !rec.time) {
    throw new ServiceError('illegal_transition', 'A date and time must be set before confirming.')
  }
  applyTransition(rec, 'confirmed', actor, 'confirmed', `Confirmed by ${actor.name}.`)
  rec.assignedStage = 'Confirmed'
  // Record the confirmation notification (website + email).
  recordEvent({
    appointmentId: rec.id, action: 'notification-sent',
    actorId: 'system', actorName: 'System', actorRole: 'system',
    summary: 'Confirmation sent to the requester by website and email.',
    detail: `Appointment confirmed for ${rec.date} at ${rec.time}.`,
  })
  return { ...rec }
}

/** Forward to another role for approval (coordinator escalation). */
export async function forwardForApproval(id: string, actor: Actor, toRole: Role): Promise<ApprovalRecord> {
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
// the approval queue: super_admin/admin_dispatcher see all; authority/
// coordinator/reception see those assigned to their role.
function visibleTo(actor: Actor, rec: ApprovalRecord): boolean {
  if (actor.role === 'super_admin' || actor.role === 'admin_dispatcher') return true
  if (actor.role === 'authority' || actor.role === 'coordinator') {
    return rec.assignedRole === actor.role
  }
  if (actor.role === 'reception') return true // reception sees all for the desk
  // requester: only their own
  return rec.requester === actor.name
}

/** Appointments within [from, to] inclusive (ISO yyyy-mm-dd) the actor may see. */
export async function fetchCalendarAppointments(
  actor: Actor, range: { from: string; to: string },
): Promise<ApprovalRecord[]> {
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
  await delay(200)
  return STORE
    .filter(rec => visibleTo(actor, rec))
    .filter(rec => rec.date >= range.from && rec.date <= range.to)
    .map(rec => ({ ...rec }))
}

/** Appointments on a single day, ordered by time. */
export async function fetchDayAppointments(actor: Actor, date: string): Promise<ApprovalRecord[]> {
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
  if (DATA_SOURCE === 'supabase') throw new Error('Supabase implementation not wired yet.')
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
