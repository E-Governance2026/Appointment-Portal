import { describe, it, expect } from 'vitest'
import { toAppointmentDto, type AppointmentRow } from '../routes/appointmentMapper.js'
import { resolveAuthority, submitSchema } from '../routes/appointments.js'

// A full DB row for the mapper tests. Matches the appointments table columns.
function row(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 'APT-2026-3001',
    requester: 'Rohan Mehta',
    requester_id: 'u-req',
    requester_initials: 'RM',
    requester_category: 'Staff',
    type_id: 'academic',
    type_name: '',
    purpose_label: '',
    department: 'Academic Affairs',
    authority_id: 'auth-ss',
    authority_name: 'Shivendra sir',
    date: null,
    time: null,
    subject: 'Project supervision request',
    description: 'Requesting supervision for my final-year project.',
    mode: 'physical',
    location_label: '',
    documents_count: 0,
    status: 'submitted',
    submitted_at: '2026-10-14T08:50:00',
    assigned_stage: 'Authority review',
    assigned_role: 'coordinator_authority',
    assigned_to_id: 'auth-ss',
    proposed_date: null,
    proposed_time: null,
    checked_in_at: null,
    checked_out_at: null,
    updated_at: '2026-10-14T08:50:00',
    ...overrides,
  }
}

// ─── Mapper ───────────────────────────────────────────────────────────────────
describe('appointments — row mapper', () => {
  it('maps snake_case columns to the camelCase contract', () => {
    const dto = toAppointmentDto(row())
    expect(dto.id).toBe('APT-2026-3001')
    expect(dto.requesterInitials).toBe('RM')
    expect(dto.authorityName).toBe('Shivendra sir')
    expect(dto.assignedStage).toBe('Authority review')
    expect(dto.assignedRole).toBe('coordinator_authority')
    expect(dto.assignedToId).toBe('auth-ss')
  })

  it('turns a null date/time into empty strings (open slot)', () => {
    const dto = toAppointmentDto(row({ date: null, time: null }))
    expect(dto.date).toBe('')
    expect(dto.time).toBe('')
  })

  it('keeps a real date/time as-is', () => {
    const dto = toAppointmentDto(row({ date: '2026-10-14', time: '11:00' }))
    expect(dto.date).toBe('2026-10-14')
    expect(dto.time).toBe('11:00')
  })

  it('omits optional fields when their columns are null', () => {
    const dto = toAppointmentDto(row())
    expect(dto.proposedDate).toBeUndefined()
    expect(dto.checkedInAt).toBeUndefined()
  })

  it('includes optional fields when present', () => {
    const dto = toAppointmentDto(row({ proposed_date: '2026-10-20', proposed_time: '09:30', checked_in_at: '2026-10-14T10:00:00' }))
    expect(dto.proposedDate).toBe('2026-10-20')
    expect(dto.proposedTime).toBe('09:30')
    expect(dto.checkedInAt).toBe('2026-10-14T10:00:00')
  })

  it('falls back assignedRole to coordinator_authority when the column is null', () => {
    const dto = toAppointmentDto(row({ assigned_role: null }))
    expect(dto.assignedRole).toBe('coordinator_authority')
  })
})

// ─── Book-with resolution (3-step flow, step 1) ─────────────────────────────
describe('appointments — resolveAuthority', () => {
  it('resolves the Department option to the registrar (auth-vm)', () => {
    const a = resolveAuthority('department')
    expect(a?.id).toBe('auth-vm')
  })

  it('resolves Shivendra sir and Jaimi sir', () => {
    expect(resolveAuthority('auth-ss')?.name).toBe('Shivendra sir')
    expect(resolveAuthority('auth-ap')?.name).toBe('Jaimi sir')
  })

  it('derives a type from the chosen authority (first handled type)', () => {
    const a = resolveAuthority('auth-ss')
    expect(a?.typeIds[0]).toBe('academic')
  })

  it('returns null for an unknown choice', () => {
    expect(resolveAuthority('nobody')).toBeNull()
  })
})

// ─── Submit validation (3-step flow) ────────────────────────────────────────
describe('appointments — submit schema', () => {
  it('accepts a booking with no date/time (slot left open)', () => {
    const parsed = submitSchema.safeParse({
      bookWith: 'auth-ss', subject: 'Guidance', description: 'Need help choosing electives.',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.date).toBe('')
      expect(parsed.data.time).toBe('')
    }
  })

  it('accepts a booking with a chosen date/time', () => {
    const parsed = submitSchema.safeParse({
      bookWith: 'auth-ap', date: '2026-10-20', time: '11:00',
      subject: 'Leave query', description: 'Carry-forward leave policy.',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a missing subject', () => {
    const parsed = submitSchema.safeParse({
      bookWith: 'auth-ss', subject: '   ', description: 'Reason here.',
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a missing reason/description', () => {
    const parsed = submitSchema.safeParse({
      bookWith: 'auth-ss', subject: 'A subject', description: '',
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a missing bookWith', () => {
    const parsed = submitSchema.safeParse({
      subject: 'A subject', description: 'A reason.',
    })
    expect(parsed.success).toBe(false)
  })
})
