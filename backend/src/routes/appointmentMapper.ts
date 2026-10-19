// ─── Appointment row mapper ───────────────────────────────────────────────────
// The DB stores columns in snake_case; the frontend reads the camelCase
// ApprovalRecord contract (src/data/approvalData.ts). This module is the single
// place that translates one to the other, so every read endpoint returns the
// exact shape the UI already consumes — no UI change needed when the data
// source flips from mock to supabase.

import type { AppointmentStatus } from '../domain/statusMachine.js'
import type { Role } from '../types.js'

// The row shape as selected from the `appointments` table. Columns that are
// nullable in SQL are nullable here.
export interface AppointmentRow {
  id: string
  requester: string
  requester_id: string | null
  requester_initials: string
  requester_category: string
  type_id: string | null
  type_name: string
  purpose_label: string
  department: string
  authority_id: string | null
  authority_name: string
  date: string | null
  time: string | null
  subject: string
  description: string
  mode: 'physical' | 'online' | 'phone'
  location_label: string
  documents_count: number
  status: AppointmentStatus
  submitted_at: string
  assigned_stage: string
  assigned_role: Role | null
  assigned_to_id: string | null
  proposed_date: string | null
  proposed_time: string | null
  checked_in_at: string | null
  checked_out_at: string | null
  updated_at: string
}

// The camelCase contract the frontend reads. Mirrors ApprovalRecord exactly.
export interface AppointmentDto {
  id: string
  requester: string
  requesterInitials: string
  requesterCategory: string
  typeId: string
  typeName: string
  purposeLabel: string
  department: string
  authorityId: string
  authorityName: string
  date: string
  time: string
  subject: string
  description: string
  mode: 'physical' | 'online' | 'phone'
  locationLabel: string
  documentsCount: number
  status: AppointmentStatus
  submittedAt: string
  assignedStage: string
  assignedRole: Role
  assignedToId: string
  updatedAt: string
  proposedDate?: string
  proposedTime?: string
  checkedInAt?: string
  checkedOutAt?: string
}

// The columns every read endpoint selects. Keep in sync with AppointmentRow.
export const APPOINTMENT_COLUMNS =
  'id, requester, requester_id, requester_initials, requester_category, ' +
  'type_id, type_name, purpose_label, department, authority_id, authority_name, ' +
  'date, time, subject, description, mode, location_label, documents_count, ' +
  'status, submitted_at, assigned_stage, assigned_role, assigned_to_id, ' +
  'proposed_date, proposed_time, checked_in_at, checked_out_at, updated_at'

/**
 * Map a DB row to the frontend contract. A null date/time becomes '' because
 * the UI's ApprovalRecord uses empty strings for an open slot (not null). An
 * optional camelCase field is omitted when its column is null.
 */
export function toAppointmentDto(row: AppointmentRow): AppointmentDto {
  const dto: AppointmentDto = {
    id:                row.id,
    requester:         row.requester,
    requesterInitials: row.requester_initials ?? '',
    requesterCategory: row.requester_category ?? '',
    typeId:            row.type_id ?? '',
    typeName:          row.type_name ?? '',
    purposeLabel:      row.purpose_label ?? '',
    department:        row.department ?? '',
    authorityId:       row.authority_id ?? '',
    authorityName:     row.authority_name ?? '',
    date:              row.date ?? '',
    time:              row.time ?? '',
    subject:           row.subject ?? '',
    description:       row.description ?? '',
    mode:              row.mode,
    locationLabel:     row.location_label ?? '',
    documentsCount:    row.documents_count ?? 0,
    status:            row.status,
    submittedAt:       row.submitted_at,
    assignedStage:     row.assigned_stage ?? '',
    // The contract's assignedRole is non-optional; fall back to
    // 'coordinator_authority' (the default queue owner) when a row has no
    // explicit assignment.
    assignedRole:      (row.assigned_role ?? 'coordinator_authority') as Role,
    assignedToId:      row.assigned_to_id ?? '',
    updatedAt:         row.updated_at,
  }
  if (row.proposed_date)  dto.proposedDate  = row.proposed_date
  if (row.proposed_time)  dto.proposedTime  = row.proposed_time
  if (row.checked_in_at)  dto.checkedInAt   = row.checked_in_at
  if (row.checked_out_at) dto.checkedOutAt  = row.checked_out_at
  return dto
}
