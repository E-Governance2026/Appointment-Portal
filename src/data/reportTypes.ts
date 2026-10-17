// ─── Report Types & Aggregation ───────────────────────────────────────────────
// Pure, dependency-free aggregation over appointment records + audit events.
// The service layer calls computeReport(); this module has no I/O so it is
// fully unit-testable. Mirrors what the backend would compute in SQL / a view.

import type { ApprovalRecord } from './approvalData'
import type { AppointmentStatus } from './mockAppointments'
import { STATUS_CONFIG } from './mockAppointments'
import type { AuditEvent } from './auditLog'

// ─── Filters ──────────────────────────────────────────────────────────────────
export interface ReportFilters {
  from:        string          // ISO yyyy-mm-dd (inclusive)
  to:          string          // ISO yyyy-mm-dd (inclusive)
  department?: string          // exact match, optional
  authorityId?: string         // exact match, optional
  status?:     AppointmentStatus // exact match, optional
}

// ─── Result shapes ──────────────────────────────────────────────────────────────
export interface StatusBreakdown {
  status: AppointmentStatus
  label:  string
  count:  number
}

export interface GroupCount {
  key:   string
  label: string
  count: number
}

export interface DailyVolume {
  date:  string   // ISO yyyy-mm-dd
  count: number
}

export interface ReportSummary {
  total:            number
  statusBreakdown:  StatusBreakdown[]
  byDepartment:     GroupCount[]
  byAuthority:      GroupCount[]
  byType:           GroupCount[]
  dailyVolume:      DailyVolume[]
  // Rates as a fraction 0..1 of total.
  completionRate:   number
  rejectionRate:    number
  noShowRate:       number   // not-reported / total
  // Average hours from submittedAt to first decision (approved/rejected/
  // additional-info) derived from the audit log. 0 when no decisions.
  avgTurnaroundHours: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function applyFilters(records: ApprovalRecord[], f: ReportFilters): ApprovalRecord[] {
  return records.filter(r => {
    // A not-yet-scheduled request (no date) has no slot to place on the
    // calendar, so the date range does not exclude it; other filters still do.
    if (r.date) {
      if (r.date < f.from || r.date > f.to) return false
    }
    if (f.department && r.department !== f.department) return false
    if (f.authorityId && r.authorityId !== f.authorityId) return false
    if (f.status && r.status !== f.status) return false
    return true
  })
}

function groupCounts(
  records: ApprovalRecord[],
  keyOf: (r: ApprovalRecord) => { key: string; label: string },
): GroupCount[] {
  const map = new Map<string, GroupCount>()
  for (const r of records) {
    const { key, label } = keyOf(r)
    const existing = map.get(key)
    if (existing) existing.count++
    else map.set(key, { key, label, count: 1 })
  }
  // Highest count first; stable by label for ties.
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/**
 * Average turnaround in hours: from each record's submittedAt to its first
 * decision event (approved / rejected / info-requested) in the audit log.
 * Records with no decision are skipped. Returns 0 when there are none.
 */
function avgTurnaround(records: ApprovalRecord[], events: AuditEvent[]): number {
  const DECISION = new Set(['approved', 'rejected', 'info-requested'])
  const byAppt = new Map<string, AuditEvent[]>()
  for (const e of events) {
    const list = byAppt.get(e.appointmentId) ?? []
    list.push(e)
    byAppt.set(e.appointmentId, list)
  }

  let totalHours = 0
  let n = 0
  for (const r of records) {
    const evs = (byAppt.get(r.id) ?? [])
      .filter(e => DECISION.has(e.action))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    const first = evs[0]
    if (!first) continue
    const start = new Date(r.submittedAt).getTime()
    const end   = new Date(first.timestamp).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue
    totalHours += (end - start) / (1000 * 60 * 60)
    n++
  }
  return n === 0 ? 0 : Math.round((totalHours / n) * 10) / 10
}

// ─── computeReport ──────────────────────────────────────────────────────────────
export function computeReport(
  records: ApprovalRecord[],
  events: AuditEvent[],
  filters: ReportFilters,
): ReportSummary {
  const scoped = applyFilters(records, filters)
  const total = scoped.length

  // Status breakdown — include every status present, ordered by the union.
  const STATUS_ORDER: AppointmentStatus[] = [
    'draft', 'submitted', 'additional-info', 'approved', 'confirmed',
    'rescheduled', 'completed', 'cancelled', 'rejected', 'not-reported',
  ]
  const statusCount = new Map<AppointmentStatus, number>()
  for (const r of scoped) statusCount.set(r.status, (statusCount.get(r.status) ?? 0) + 1)
  const statusBreakdown: StatusBreakdown[] = STATUS_ORDER
    .filter(s => statusCount.has(s))
    .map(s => ({ status: s, label: STATUS_CONFIG[s].label, count: statusCount.get(s)! }))

  const byDepartment = groupCounts(scoped, r => ({ key: r.department, label: r.department }))
  const byAuthority  = groupCounts(scoped, r => ({ key: r.authorityId, label: r.authorityName }))
  const byType       = groupCounts(scoped, r => ({ key: r.typeId, label: r.typeName }))

  // Daily volume by requested date, ascending. Not-yet-scheduled requests have
  // no date and are omitted from the by-day chart.
  const dayMap = new Map<string, number>()
  for (const r of scoped) {
    if (!r.date) continue
    dayMap.set(r.date, (dayMap.get(r.date) ?? 0) + 1)
  }
  const dailyVolume: DailyVolume[] = [...dayMap.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const completed    = statusCount.get('completed')    ?? 0
  const rejected     = statusCount.get('rejected')     ?? 0
  const notReported  = statusCount.get('not-reported') ?? 0

  const rate = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 1000)

  return {
    total,
    statusBreakdown,
    byDepartment,
    byAuthority,
    byType,
    dailyVolume,
    completionRate: rate(completed),
    rejectionRate:  rate(rejected),
    noShowRate:     rate(notReported),
    avgTurnaroundHours: avgTurnaround(scoped, events),
  }
}
