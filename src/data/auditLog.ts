// ─── Audit Log ────────────────────────────────────────────────────────────────
// In-memory audit trail (PRD §10: "Record critical actions and approval
// decisions in audit logs"). Every approval decision, status change,
// reschedule, cancellation, check-in/out, and info request appends here.
//
// In a real system this is a server table. Here it persists for the browser
// session so the appointment timeline and reports can read it.

import type { AppointmentStatus } from './mockAppointments'

// ─── Audit action types ────────────────────────────────────────────────────────
export type AuditAction =
  | 'submitted'
  | 'reviewed'
  | 'info-requested'
  | 'info-provided'
  | 'approved'
  | 'rejected'
  | 'confirmed'
  | 'reschedule-proposed'
  | 'reschedule-accepted'
  | 'reschedule-declined'
  | 'cancelled'
  | 'forwarded'
  | 'internal-remark'
  | 'checked-in'
  | 'checked-out'
  | 'completed'
  | 'not-reported'
  | 'notification-sent'

export interface AuditEvent {
  id:            string
  appointmentId: string
  action:        AuditAction
  actorId:       string
  actorName:     string
  actorRole:     string
  /** Human-readable summary shown in the timeline. */
  summary:       string
  /** Optional free text — reason, remark, message. */
  detail?:       string
  /** Optional status transition captured with this event. */
  fromStatus?:   AppointmentStatus
  toStatus?:     AppointmentStatus
  /** Whether this event is visible to the requester (internal remarks are not). */
  visibleToRequester: boolean
  timestamp:     string   // ISO
}

// ─── In-memory store ────────────────────────────────────────────────────────────
const AUDIT_EVENTS: AuditEvent[] = []

let seq = 1
function nextId(): string {
  return `AUD-${seq++}`
}

// ─── recordEvent ────────────────────────────────────────────────────────────────
export interface RecordEventInput {
  appointmentId: string
  action:        AuditAction
  actorId:       string
  actorName:     string
  actorRole:     string
  summary:       string
  detail?:       string
  fromStatus?:   AppointmentStatus
  toStatus?:     AppointmentStatus
  visibleToRequester?: boolean
}

export function recordEvent(input: RecordEventInput): AuditEvent {
  const event: AuditEvent = {
    id:                 nextId(),
    appointmentId:      input.appointmentId,
    action:             input.action,
    actorId:            input.actorId,
    actorName:          input.actorName,
    actorRole:          input.actorRole,
    summary:            input.summary,
    detail:             input.detail,
    fromStatus:         input.fromStatus,
    toStatus:           input.toStatus,
    // Internal remarks default to hidden; everything else visible unless set.
    visibleToRequester: input.visibleToRequester ?? (input.action !== 'internal-remark'),
    timestamp:          new Date().toISOString(),
  }
  AUDIT_EVENTS.push(event)
  return event
}

// ─── Queries ──────────────────────────────────────────────────────────────────
/** All events for one appointment, oldest first. */
export function getTimeline(appointmentId: string): AuditEvent[] {
  return AUDIT_EVENTS
    .filter(e => e.appointmentId === appointmentId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

/** Timeline filtered to events the requester may see (hides internal remarks). */
export function getRequesterTimeline(appointmentId: string): AuditEvent[] {
  return getTimeline(appointmentId).filter(e => e.visibleToRequester)
}

/** Every event in the system (for reports / admin). */
export function getAllEvents(): AuditEvent[] {
  return [...AUDIT_EVENTS].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

// ─── Test helper ────────────────────────────────────────────────────────────────
export function __clearAudit() {
  AUDIT_EVENTS.length = 0
  seq = 1
}
