import { describe, it, expect } from 'vitest'
import { approveSchema, reasonSchema, messageSchema } from '../routes/appointments.js'
import { toTimelineDto, type AuditRow } from '../routes/auditLog.js'
import { canTransition } from '../domain/statusMachine.js'

// ─── Approve schema ───────────────────────────────────────────────────────────
describe('workflow — approve schema', () => {
  it('accepts an empty body (slot comes from the existing appointment)', () => {
    expect(approveSchema.safeParse({}).success).toBe(true)
  })

  it('accepts a note and a slot', () => {
    const parsed = approveSchema.safeParse({ note: 'See you then', slot: { date: '2026-12-01', time: '10:00' } })
    expect(parsed.success).toBe(true)
  })

  it('rejects a slot missing the time', () => {
    const parsed = approveSchema.safeParse({ slot: { date: '2026-12-01', time: '' } })
    expect(parsed.success).toBe(false)
  })
})

// ─── Reject / request-info schemas ────────────────────────────────────────────
describe('workflow — reason / message schemas', () => {
  it('reject requires a non-empty reason', () => {
    expect(reasonSchema.safeParse({ reason: 'Out of scope' }).success).toBe(true)
    expect(reasonSchema.safeParse({ reason: '   ' }).success).toBe(false)
    expect(reasonSchema.safeParse({}).success).toBe(false)
  })

  it('request-info requires a non-empty message', () => {
    expect(messageSchema.safeParse({ message: 'Attach your ID proof' }).success).toBe(true)
    expect(messageSchema.safeParse({ message: '' }).success).toBe(false)
  })
})

// ─── Transition guards the endpoints rely on ──────────────────────────────────
describe('workflow — legal transitions', () => {
  it('submitted can be approved, rejected or sent to additional-info', () => {
    expect(canTransition('submitted', 'approved')).toBe(true)
    expect(canTransition('submitted', 'rejected')).toBe(true)
    expect(canTransition('submitted', 'additional-info')).toBe(true)
  })

  it('approved can be confirmed but not directly completed', () => {
    expect(canTransition('approved', 'confirmed')).toBe(true)
    expect(canTransition('approved', 'completed')).toBe(false)
  })

  it('a rejected appointment is terminal', () => {
    expect(canTransition('rejected', 'approved')).toBe(false)
    expect(canTransition('rejected', 'confirmed')).toBe(false)
  })
})

// ─── Audit timeline mapper ────────────────────────────────────────────────────
function auditRow(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    id: 'AUD-1',
    appointment_id: 'APT-2026-3001',
    action: 'approved',
    actor_id: 'u-ca',
    actor_name: 'Dr. Amit Patel',
    actor_role: 'coordinator_authority',
    summary: 'Approved by Dr. Amit Patel.',
    detail: 'Scheduled for 2026-12-01 at 10:00.',
    from_status: 'submitted',
    to_status: 'approved',
    visible_to_requester: true,
    timestamp: '2026-10-14T10:00:00',
    ...overrides,
  }
}

describe('workflow — audit timeline mapper', () => {
  it('maps snake_case audit columns to the camelCase contract', () => {
    const dto = toTimelineDto(auditRow())
    expect(dto.appointmentId).toBe('APT-2026-3001')
    expect(dto.actorRole).toBe('coordinator_authority')
    expect(dto.fromStatus).toBe('submitted')
    expect(dto.toStatus).toBe('approved')
    expect(dto.visibleToRequester).toBe(true)
  })

  it('omits optional fields when null', () => {
    const dto = toTimelineDto(auditRow({ detail: null, from_status: null, to_status: null }))
    expect(dto.detail).toBeUndefined()
    expect(dto.fromStatus).toBeUndefined()
    expect(dto.toStatus).toBeUndefined()
  })

  it('carries the internal-remark visibility flag through', () => {
    const dto = toTimelineDto(auditRow({ action: 'internal-remark', visible_to_requester: false }))
    expect(dto.visibleToRequester).toBe(false)
  })
})
