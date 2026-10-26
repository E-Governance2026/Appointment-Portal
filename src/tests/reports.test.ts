import { describe, it, expect, beforeEach } from 'vitest'
import {
  fetchReport,
  approveAppointment,
  rejectAppointment,
  __resetApprovals,
  type Actor,
} from '../services/appointmentsService'
import { __clearAudit } from '../data/auditLog'
import { computeReport, applyFilters, type ReportFilters } from '../data/reportTypes'
import { SEED_APPROVALS } from '../data/approvalData'
import { toCsv, csvCell } from '../utils/csv'

// ─── Stub actors ──────────────────────────────────────────────────────────────
const superAdmin: Actor  = { id: 'u-sup', name: 'Super Admin',       role: 'super_admin' }
const authority: Actor   = { id: 'u-aut', name: 'Prof. Sneha Shah',   role: 'coordinator_authority' }
const requester: Actor    = { id: 'u-req', name: 'Requester',         role: 'requester' }

const WIDE: ReportFilters = { from: '2000-01-01', to: '2100-12-31' }

beforeEach(() => {
  __resetApprovals()
  __clearAudit()
})

// ─── Pure aggregation ───────────────────────────────────────────────────────────
describe('reports — computeReport (pure)', () => {
  it('totals every record in range', () => {
    const r = computeReport(SEED_APPROVALS, [], WIDE)
    expect(r.total).toBe(SEED_APPROVALS.length)
  })

  it('status breakdown counts sum to the total', () => {
    const r = computeReport(SEED_APPROVALS, [], WIDE)
    const sum = r.statusBreakdown.reduce((acc, s) => acc + s.count, 0)
    expect(sum).toBe(r.total)
  })

  it('groups by department, authority and type', () => {
    const r = computeReport(SEED_APPROVALS, [], WIDE)
    expect(r.byDepartment.length).toBeGreaterThan(0)
    expect(r.byAuthority.length).toBeGreaterThan(0)
    expect(r.byType.length).toBeGreaterThan(0)
    // Group counts also sum to the total.
    expect(r.byDepartment.reduce((a, g) => a + g.count, 0)).toBe(r.total)
  })

  it('rates are fractions of total', () => {
    const r = computeReport(SEED_APPROVALS, [], WIDE)
    const rejected = r.statusBreakdown.find(s => s.status === 'rejected')?.count ?? 0
    expect(r.rejectionRate).toBeCloseTo(rejected / r.total, 5)
  })

  it('computes average and median turnaround from the audit log', () => {
    const submittedAt = '2026-05-01T09:00:00.000Z'
    const decidedAt   = '2026-05-01T13:00:00.000Z'   // 4 hours later
    const records = [{ ...SEED_APPROVALS[0], id: 'X', submittedAt, date: '2026-05-01' }]
    const events = [{
      id: 'e1', appointmentId: 'X', action: 'approved' as const,
      actorId: 'a', actorName: 'A', actorRole: 'coordinator_authority',
      summary: '', visibleToRequester: true, timestamp: decidedAt,
    }]
    const r = computeReport(records, events, WIDE)
    expect(r.avgTurnaroundHours).toBe(4)
    expect(r.medianTurnaroundHours).toBe(4)
    expect(r.decidedCount).toBe(1)
  })

  it('displays "Unspecified" when typeId or typeName is missing or null', () => {
    const records = [
      { ...SEED_APPROVALS[0], id: 'U1', typeId: '', typeName: '' },
      { ...SEED_APPROVALS[1], id: 'U2', typeId: 'academic', typeName: 'Academic Consultation' },
    ]
    const r = computeReport(records, [], WIDE)
    const unspec = r.byType.find(t => t.label === 'Unspecified')
    expect(unspec).toBeDefined()
    expect(unspec?.count).toBe(1)
  })

  it('breakdown sums equal the total appointments count', () => {
    const r = computeReport(SEED_APPROVALS, [], WIDE)
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

// ─── Filters ─────────────────────────────────────────────────────────────────
describe('reports — applyFilters (pure)', () => {
  it('filters by date range (not-yet-scheduled records with no date are retained)', () => {
    const narrow = applyFilters(SEED_APPROVALS, { from: '2026-10-10', to: '2026-10-12' })
    narrow.forEach(r => {
      // Scheduled records must fall in range; slot-less records (no date) pass through.
      if (r.date) expect(r.date >= '2026-10-10' && r.date <= '2026-10-12').toBe(true)
    })
  })

  it('filters by department', () => {
    const fin = applyFilters(SEED_APPROVALS, { ...WIDE, department: 'Finance' })
    fin.forEach(r => expect(r.department).toBe('Finance'))
  })

  it('filters by status', () => {
    const rej = applyFilters(SEED_APPROVALS, { ...WIDE, status: 'rejected' })
    rej.forEach(r => expect(r.status).toBe('rejected'))
  })
})

// ─── Service: scope + permissions ───────────────────────────────────────────────
describe('reports — service', () => {
  it('super_admin (viewAll) sees every appointment', async () => {
    const r = await fetchReport(superAdmin, WIDE)
    expect(r.total).toBe(SEED_APPROVALS.length)
  })

  it('a requester cannot view reports', async () => {
    await expect(fetchReport(requester, WIDE)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('coordinator_authority (reports.view) is scoped to records assigned to their role', async () => {
    const r = await fetchReport(authority, WIDE)
    // Scoping is by assigned_role: the report total equals the records assigned
    // to coordinator_authority. (In the current seed every staff-assigned record
    // belongs to this merged role, so the scope covers them all.)
    const expected = SEED_APPROVALS.filter(rec => rec.assignedRole === 'coordinator_authority').length
    expect(r.total).toBe(expected)
  })

  it('reflects a decision made during the session in the turnaround', async () => {
    // APT-2026-2001 is slot-less; the authority provides a time at approval.
    await approveAppointment('APT-2026-2001', superAdmin, { slot: { date: '2026-12-01', time: '09:30' } })
    const r = await fetchReport(superAdmin, WIDE)
    expect(r.avgTurnaroundHours).toBeGreaterThanOrEqual(0)
  })

  it('rejection raises the rejected count', async () => {
    const before = await fetchReport(superAdmin, WIDE)
    const beforeRej = before.statusBreakdown.find(s => s.status === 'rejected')?.count ?? 0
    await rejectAppointment('APT-2026-2001', superAdmin, 'Out of scope.')
    const after = await fetchReport(superAdmin, WIDE)
    const afterRej = after.statusBreakdown.find(s => s.status === 'rejected')?.count ?? 0
    expect(afterRej).toBe(beforeRej + 1)
  })
})

// ─── CSV util ───────────────────────────────────────────────────────────────────
describe('reports — csv util', () => {
  it('escapes cells containing commas, quotes and newlines', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('builds rows joined by CRLF with a header', () => {
    const csv = toCsv(['Name', 'Count'], [['Finance', 3], ['HR', 2]])
    expect(csv).toBe('Name,Count\r\nFinance,3\r\nHR,2')
  })
})
