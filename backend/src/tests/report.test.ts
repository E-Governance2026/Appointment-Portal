import { describe, it, expect } from 'vitest'
import { computeReport, applyFilters, type ReportFilters } from '../domain/report.js'
import type { AppointmentDto } from '../routes/appointmentMapper.js'
import type { AuditEventDto } from '../routes/auditLog.js'

// A minimal AppointmentDto factory for report fixtures.
function appt(overrides: Partial<AppointmentDto> = {}): AppointmentDto {
  return {
    id: 'APT-1',
    requester: 'Rohan Mehta',
    requesterInitials: 'RM',
    requesterCategory: 'Staff',
    typeId: 'academic',
    typeName: 'Academic',
    purposeLabel: '',
    department: 'Academic Affairs',
    authorityId: 'auth-ss',
    authorityName: 'Shivendra sir',
    date: '2026-10-14',
    time: '10:00',
    subject: 's',
    description: 'd',
    mode: 'physical',
    locationLabel: '',
    documentsCount: 0,
    status: 'submitted',
    submittedAt: '2026-10-14T08:00:00',
    assignedStage: 'Authority review',
    assignedRole: 'coordinator_authority',
    assignedToId: 'auth-ss',
    updatedAt: '2026-10-14T08:00:00',
    ...overrides,
  }
}

const WIDE: ReportFilters = { from: '2026-01-01', to: '2026-12-31' }

describe('report — applyFilters', () => {
  it('keeps a slot-less (no date) record regardless of the date range', () => {
    const r = appt({ id: 'A', date: '' })
    expect(applyFilters([r], { from: '2026-10-01', to: '2026-10-02' })).toHaveLength(1)
  })

  it('excludes a dated record outside the range', () => {
    const r = appt({ id: 'A', date: '2026-11-20' })
    expect(applyFilters([r], { from: '2026-10-01', to: '2026-10-31' })).toHaveLength(0)
  })

  it('filters by department, authority and status', () => {
    const rows = [
      appt({ id: 'A', department: 'Finance', authorityId: 'auth-pd', status: 'approved' }),
      appt({ id: 'B', department: 'Academic Affairs', authorityId: 'auth-ss', status: 'submitted' }),
    ]
    expect(applyFilters(rows, { ...WIDE, department: 'Finance' })).toHaveLength(1)
    expect(applyFilters(rows, { ...WIDE, authorityId: 'auth-ss' })).toHaveLength(1)
    expect(applyFilters(rows, { ...WIDE, status: 'approved' })).toHaveLength(1)
  })
})

describe('report — computeReport', () => {
  const rows = [
    appt({ id: 'A', status: 'completed',    department: 'Academic Affairs', authorityId: 'auth-ss', typeId: 'academic', typeName: 'Academic' }),
    appt({ id: 'B', status: 'completed',    department: 'Academic Affairs', authorityId: 'auth-ss', typeId: 'academic', typeName: 'Academic' }),
    appt({ id: 'C', status: 'rejected',     department: 'Finance',          authorityId: 'auth-pd', typeId: 'finance',  typeName: 'Finance' }),
    appt({ id: 'D', status: 'not-reported', department: 'Finance',          authorityId: 'auth-pd', typeId: 'finance',  typeName: 'Finance' }),
  ]

  it('counts total and rates (completion/rejection/no-show)', () => {
    const r = computeReport(rows, [], WIDE)
    expect(r.total).toBe(4)
    expect(r.completionRate).toBe(0.5)   // 2/4
    expect(r.rejectionRate).toBe(0.25)   // 1/4
    expect(r.noShowRate).toBe(0.25)      // 1/4
  })

  it('breaks down by status in the canonical order', () => {
    const r = computeReport(rows, [], WIDE)
    const statuses = r.statusBreakdown.map(s => s.status)
    expect(statuses).toEqual(['completed', 'rejected', 'not-reported'])
    expect(r.statusBreakdown.find(s => s.status === 'completed')!.count).toBe(2)
  })

  it('groups by department / authority / type, highest first', () => {
    const r = computeReport(rows, [], WIDE)
    expect(r.byDepartment[0]).toMatchObject({ label: 'Academic Affairs', count: 2 })
    expect(r.byAuthority[0]).toMatchObject({ label: 'Shivendra sir', count: 2 })
    expect(r.byType[0]).toMatchObject({ label: 'Academic', count: 2 })
  })

  it('computes average turnaround from submittedAt to the first decision', () => {
    const one = [appt({ id: 'X', submittedAt: '2026-10-14T08:00:00' })]
    const events: AuditEventDto[] = [{
      id: 'e1', appointmentId: 'X', action: 'approved',
      actorId: 'a', actorName: 'A', actorRole: 'coordinator_authority',
      summary: '', visibleToRequester: true, timestamp: '2026-10-14T12:00:00',
    }]
    const r = computeReport(one, events, WIDE)
    expect(r.avgTurnaroundHours).toBe(4)
  })

  it('returns zeroed rates and turnaround for an empty set', () => {
    const r = computeReport([], [], WIDE)
    expect(r.total).toBe(0)
    expect(r.completionRate).toBe(0)
    expect(r.avgTurnaroundHours).toBe(0)
  })
})
