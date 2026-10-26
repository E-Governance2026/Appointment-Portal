import { describe, it, expect } from 'vitest'
import {
  computeReport,
  applyFilters,
  generateCsvStream,
  sanitizeCsvCell,
  recordExportAudit,
  getExportAudits,
  __clearExportAudits,
  buildRegisterReport,
  type ReportFilters,
} from '../domain/report.js'
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
    expect(r.medianTurnaroundHours).toBe(0)
    expect(r.decidedCount).toBe(0)
  })

  it('displays "Unspecified" for a missing or null appointment type name', () => {
    const withNullType = [
      appt({ id: 'N1', typeId: '', typeName: '' }),
      appt({ id: 'N2', typeId: 'academic', typeName: 'Academic' }),
    ]
    const r = computeReport(withNullType, [], WIDE)
    const unspec = r.byType.find(t => t.label === 'Unspecified')
    expect(unspec).toBeDefined()
    expect(unspec?.count).toBe(1)
  })

  it('computes median and average turnaround with multiple decided requests', () => {
    const records = [
      appt({ id: 'T1', submittedAt: '2026-10-14T08:00:00' }),
      appt({ id: 'T2', submittedAt: '2026-10-14T08:00:00' }),
      appt({ id: 'T3', submittedAt: '2026-10-14T08:00:00' }),
    ]
    const events: AuditEventDto[] = [
      { id: 'e1', appointmentId: 'T1', action: 'approved', actorId: 'a', actorName: 'A', actorRole: 'coordinator_authority', summary: '', visibleToRequester: true, timestamp: '2026-10-14T10:00:00' }, // 2h
      { id: 'e2', appointmentId: 'T2', action: 'approved', actorId: 'a', actorName: 'A', actorRole: 'coordinator_authority', summary: '', visibleToRequester: true, timestamp: '2026-10-14T12:00:00' }, // 4h
      { id: 'e3', appointmentId: 'T3', action: 'rejected', actorId: 'a', actorName: 'A', actorRole: 'coordinator_authority', summary: '', visibleToRequester: true, timestamp: '2026-10-14T17:00:00' }, // 9h
    ]
    const r = computeReport(records, events, WIDE)
    expect(r.decidedCount).toBe(3)
    expect(r.avgTurnaroundHours).toBe(5) // (2+4+9)/3 = 5
    expect(r.medianTurnaroundHours).toBe(4) // median of [2, 4, 9] is 4
  })

  it('breakdown sums equal the total appointments count', () => {
    const r = computeReport(rows, [], WIDE)
    const statusSum = r.statusBreakdown.reduce((sum, s) => sum + s.count, 0)
    const deptSum = r.byDepartment.reduce((sum, d) => sum + d.count, 0)
    const authSum = r.byAuthority.reduce((sum, a) => sum + a.count, 0)
    const typeSum = r.byType.reduce((sum, t) => sum + t.count, 0)

    expect(statusSum).toBe(r.total)
    expect(deptSum).toBe(r.total)
    expect(authSum).toBe(r.total)
    expect(typeSum).toBe(r.total)
  })
})

describe('report — CSV export', () => {
  const records = [
    appt({
      id: 'APT-101',
      requester: '=CmdInjection',
      typeName: '+TypeFormula',
      department: '-FinanceDept',
      authorityName: '@DeanOffice',
      description: 'SECRET_DESCRIPTION_SHOULD_NEVER_APPEAR',
      status: 'submitted',
      submittedAt: '2026-10-14T08:00:00',
    }),
    appt({
      id: 'APT-102',
      requester: 'Standard "User", with comma',
      typeName: 'Academic',
      department: 'Academic Affairs',
      authorityName: 'Dr. Patel',
      description: 'INTERNAL_CONFIDENTIAL_NOTE',
      status: 'approved',
      submittedAt: '2026-10-14T09:00:00',
    }),
  ]

  const events: AuditEventDto[] = [
    {
      id: 'e1',
      appointmentId: 'APT-102',
      action: 'approved',
      actorId: 'a1',
      actorName: 'Dr. Patel',
      actorRole: 'coordinator_authority',
      summary: 'Approved appointment',
      detail: 'INTERNAL_REMARK_CONFIDENTIAL',
      visibleToRequester: false,
      timestamp: '2026-10-14T11:00:00',
    },
  ]

  it('includes UTF-8 BOM at the beginning of the file', () => {
    const { csv } = generateCsvStream('register', records, events, WIDE)
    expect(csv.startsWith('\uFEFF')).toBe(true)
  })

  it('escapes cells containing commas, quotes, and newlines', () => {
    expect(sanitizeCsvCell('normal text')).toBe('normal text')
    expect(sanitizeCsvCell('has, comma')).toBe('"has, comma"')
    expect(sanitizeCsvCell('has "quote"')).toBe('"has ""quote"""')
    expect(sanitizeCsvCell("line1\nline2")).toBe('"line1\nline2"')
  })

  it('prefixes cells starting with =, +, -, or @ with a single quote to prevent CSV injection', () => {
    expect(sanitizeCsvCell('=1+1')).toBe("'=1+1")
    expect(sanitizeCsvCell('+SUM(A1:A10)')).toBe("'+SUM(A1:A10)")
    expect(sanitizeCsvCell('-100')).toBe("'-100")
    expect(sanitizeCsvCell('@admin')).toBe("'@admin")

    const { csv } = generateCsvStream('register', records, events, WIDE)
    expect(csv).toContain("'=CmdInjection")
    expect(csv).toContain("'+TypeFormula")
    expect(csv).toContain("'-FinanceDept")
    expect(csv).toContain("'@DeanOffice")
  })

  it('never includes sensitive fields: descriptions, internal remarks, document names, or meeting links', () => {
    const { csv } = generateCsvStream('register', records, events, WIDE)
    expect(csv).not.toContain('SECRET_DESCRIPTION_SHOULD_NEVER_APPEAR')
    expect(csv).not.toContain('INTERNAL_CONFIDENTIAL_NOTE')
    expect(csv).not.toContain('INTERNAL_REMARK_CONFIDENTIAL')
    expect(csv).not.toContain('meet.google.com')
    expect(csv).not.toContain('documents')

    const turnaroundExport = generateCsvStream('turnaround', records, events, WIDE)
    expect(turnaroundExport.csv).not.toContain('INTERNAL_REMARK_CONFIDENTIAL')
  })

  it('enforces a 50,000 row cap and throws exact required message', () => {
    // Generate over 50,000 dummy records
    const hugeRecords: AppointmentDto[] = []
    for (let i = 0; i < 50001; i++) {
      hugeRecords.push(appt({ id: `APT-${i}`, date: '2026-10-14' }))
    }

    expect(() => generateCsvStream('register', hugeRecords, [], WIDE)).toThrow(
      'The export is limited to 50,000 rows. Narrow the date range.',
    )
  })

  it('writes an audit record with report_exported, report name, filters and row count', () => {
    __clearExportAudits()
    const { rowCount } = generateCsvStream('register', records, events, WIDE)
    const audit = recordExportAudit({
      action: 'report_exported',
      reportName: 'register',
      actorId: 'admin-1',
      actorRole: 'super_admin',
      filters: WIDE,
      rowCount,
    })

    expect(audit.action).toBe('report_exported')
    expect(audit.reportName).toBe('register')
    expect(audit.rowCount).toBe(2)
    expect(audit.actorRole).toBe('super_admin')
    expect(getExportAudits()).toHaveLength(1)
  })

  it('exported rows equal the rows the table shows for the same filters', () => {
    const tableResult = buildRegisterReport(records, WIDE, 1, 100)
    const { rowCount } = generateCsvStream('register', records, events, WIDE)
    expect(rowCount).toBe(tableResult.total)
    expect(rowCount).toBe(tableResult.rows.length)
  })
})

