// ─── Audit log helper ─────────────────────────────────────────────────────────
// Appends events to the append-only audit_events table and maps rows to the
// frontend AuditEvent contract (src/data/auditLog.ts). Every workflow action
// records exactly one audit row so the appointment timeline and reports can
// read a complete history.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppointmentStatus } from '../domain/statusMachine.js'

// The 18 audit actions — mirrors the frontend AuditAction union and the
// audit_action enum (migration 0001).
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

// What a caller supplies to record an event. actorRole is plain text because
// 'system' is a valid actor (e.g. the confirmation notification).
export interface AppendEventInput {
  appointmentId:       string
  action:              AuditAction
  actorId:             string
  actorName:           string
  actorRole:           string
  summary:             string
  detail?:             string
  fromStatus?:         AppointmentStatus
  toStatus?:           AppointmentStatus
  visibleToRequester?: boolean
}

// The DB row shape as selected from audit_events.
export interface AuditRow {
  id:                   string
  appointment_id:       string
  action:               AuditAction
  actor_id:             string
  actor_name:           string
  actor_role:           string
  summary:              string
  detail:               string | null
  from_status:          AppointmentStatus | null
  to_status:            AppointmentStatus | null
  visible_to_requester: boolean
  timestamp:            string
}

// The camelCase contract the frontend timeline reads.
export interface AuditEventDto {
  id:                 string
  appointmentId:      string
  action:             AuditAction
  actorId:            string
  actorName:          string
  actorRole:          string
  summary:            string
  detail?:            string
  fromStatus?:        AppointmentStatus
  toStatus?:          AppointmentStatus
  visibleToRequester: boolean
  timestamp:          string
}

export const AUDIT_COLUMNS =
  'id, appointment_id, action, actor_id, actor_name, actor_role, summary, ' +
  'detail, from_status, to_status, visible_to_requester, timestamp'

import { recordAuditEvent } from '../lib/auditTrail.js'

/** Append one audit event. Returns the created row id (or throws on error). */
export async function appendEvent(supabase: SupabaseClient, input: AppendEventInput): Promise<void> {
  const { error } = await supabase.from('audit_events').insert({
    appointment_id:       input.appointmentId,
    action:               input.action,
    actor_id:             input.actorId,
    actor_name:           input.actorName,
    actor_role:           input.actorRole,
    summary:              input.summary,
    detail:               input.detail ?? null,
    from_status:          input.fromStatus ?? null,
    to_status:            input.toStatus ?? null,
    visible_to_requester: input.visibleToRequester ?? true,
  })
  if (error) throw new Error(`audit append failed: ${error.message}`)

  // Record cryptographic audit trail entry with hash chaining
  await recordAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    entityType: 'appointment',
    entityId: input.appointmentId,
    outcome: 'success',
    before: input.fromStatus ? { status: input.fromStatus } : null,
    after: input.toStatus ? { status: input.toStatus, summary: input.summary } : { summary: input.summary },
  }).catch(() => {})
}

/** Map a DB row to the frontend AuditEvent contract. */
export function toTimelineDto(row: AuditRow): AuditEventDto {
  const dto: AuditEventDto = {
    id:                 row.id,
    appointmentId:      row.appointment_id,
    action:             row.action,
    actorId:            row.actor_id,
    actorName:          row.actor_name,
    actorRole:          row.actor_role,
    summary:            row.summary,
    visibleToRequester: row.visible_to_requester,
    timestamp:          row.timestamp,
  }
  if (row.detail)      dto.detail     = row.detail
  if (row.from_status) dto.fromStatus = row.from_status
  if (row.to_status)   dto.toStatus   = row.to_status
  return dto
}
