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
  from:         string          // ISO yyyy-mm-dd (inclusive)
  to:           string          // ISO yyyy-mm-dd (inclusive)
  dateBasis?:   'appointment' | 'submitted'
  department?:  string          // exact match, optional
  authorityId?: string         // exact match, optional
  typeId?:      string
  status?:      AppointmentStatus | AppointmentStatus[]
  search?:      string
}

export interface RegisterRow {
  id:                 string
  requester:          string
  requesterCategory:  string
  department:         string
  authorityName:      string
  typeName:           string
  date:               string
  time:               string
  status:             AppointmentStatus
  submittedAt:        string
}

export interface PendingRow {
  id:                 string
  requester:          string
  typeName:           string
  authorityName:      string
  submittedAt:        string
  waitingTimeHours:   number
  waitingTime:        string
  status:             AppointmentStatus
}

export interface TurnaroundRow {
  id:                 string
  typeName:           string
  authorityName:      string
  submittedAt:        string
  decidedAt:          string
  decision:           'approved' | 'rejected'
  durationHours:      number
  timeToDecide:       string
  decidedBy:          string
}

export interface ChangeRow {
  id:                 string
  typeName:           string
  change:             'Rescheduled' | 'Cancelled'
  initiatedBy:        string
  originalTime:       string
  newTime:            string
  reason:             string
  changedOn:          string
}

export interface TableReportResult<T> {
  rows:     T[]
  total:    number
  page:     number
  pageSize: number
  summary?: Record<string, unknown>
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
  total:                 number
  completedCount:        number
  rejectedCount:         number
  notReportedCount:      number
  statusBreakdown:       StatusBreakdown[]
  byDepartment:          GroupCount[]
  byAuthority:           GroupCount[]
  byType:                GroupCount[]
  dailyVolume:           DailyVolume[]
  // Rates as a fraction 0..1 of total.
  completionRate:        number
  rejectionRate:         number
  noShowRate:            number   // not-reported / total
  avgTurnaroundHours:    number
  medianTurnaroundHours: number
  decidedCount:          number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function applyFilters(records: ApprovalRecord[], f: ReportFilters): ApprovalRecord[] {
  const statuses = f.status
    ? (Array.isArray(f.status) ? f.status : [f.status])
    : []
  const search = (f.search ?? '').trim().toLowerCase()

  return records.filter(r => {
    if (f.dateBasis === 'submitted') {
      const subDate = r.submittedAt ? r.submittedAt.slice(0, 10) : ''
      if (subDate < f.from || subDate > f.to) return false
    } else {
      // A not-yet-scheduled request (no date) has no slot to place on the
      // calendar, so the date range does not exclude it; other filters still do.
      if (r.date) {
        if (r.date < f.from || r.date > f.to) return false
      }
    }
    if (f.department && r.department !== f.department) return false
    if (f.authorityId && r.authorityId !== f.authorityId) return false
    if (f.typeId && r.typeId !== f.typeId) return false
    if (statuses.length > 0 && !statuses.includes(r.status)) return false
    if (search.length > 0) {
      const idMatch = r.id.toLowerCase().includes(search)
      const reqMatch = r.requester.toLowerCase().includes(search)
      if (!idMatch && !reqMatch) return false
    }
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
 * Average, median and count for turnaround: from each record's submittedAt to
 * its first decision event (approved / rejected / info-requested).
 */
export function turnaroundStats(records: ApprovalRecord[], events: AuditEvent[]): {
  avgHours: number
  medianHours: number
  decidedCount: number
} {
  const DECISION = new Set(['approved', 'rejected', 'info-requested'])
  const byAppt = new Map<string, AuditEvent[]>()
  for (const e of events) {
    const list = byAppt.get(e.appointmentId) ?? []
    list.push(e)
    byAppt.set(e.appointmentId, list)
  }

  const hoursList: number[] = []
  for (const r of records) {
    const evs = (byAppt.get(r.id) ?? [])
      .filter(e => DECISION.has(e.action))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    const first = evs[0]
    if (!first) continue
    const start = new Date(r.submittedAt).getTime()
    const end   = new Date(first.timestamp).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue
    hoursList.push((end - start) / (1000 * 60 * 60))
  }

  const n = hoursList.length
  if (n === 0) return { avgHours: 0, medianHours: 0, decidedCount: 0 }

  const totalHours = hoursList.reduce((acc, h) => acc + h, 0)
  const avgHours = Math.round((totalHours / n) * 10) / 10

  hoursList.sort((a, b) => a - b)
  const mid = Math.floor(n / 2)
  const medianHours = n % 2 === 0
    ? Math.round(((hoursList[mid - 1] + hoursList[mid]) / 2) * 10) / 10
    : Math.round(hoursList[mid] * 10) / 10

  return { avgHours, medianHours, decidedCount: n }
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

  const byDepartment = groupCounts(scoped, r => ({
    key: r.department || 'unspecified',
    label: (r.department && r.department.trim()) ? r.department.trim() : 'Unspecified',
  }))
  const byAuthority  = groupCounts(scoped, r => ({
    key: r.authorityId || 'unspecified',
    label: (r.authorityName && r.authorityName.trim()) ? r.authorityName.trim() : 'Unspecified',
  }))
  const byType       = groupCounts(scoped, r => ({
    key: r.typeId || 'unspecified',
    label: (r.typeName && r.typeName.trim()) ? r.typeName.trim() : 'Unspecified',
  }))

  const dayMap = new Map<string, number>()
  for (const r of scoped) {
    if (!r.date) continue
    dayMap.set(r.date, (dayMap.get(r.date) ?? 0) + 1)
  }

  const dailyVolume: DailyVolume[] = []
  if (filters.from && filters.to && filters.from <= filters.to) {
    const cur = new Date(filters.from + 'T00:00:00')
    const end = new Date(filters.to + 'T00:00:00')
    let count = 0
    while (cur <= end && count <= 366) {
      const y = cur.getFullYear()
      const m = String(cur.getMonth() + 1).padStart(2, '0')
      const d = String(cur.getDate()).padStart(2, '0')
      const iso = `${y}-${m}-${d}`
      dailyVolume.push({ date: iso, count: dayMap.get(iso) ?? 0 })
      cur.setDate(cur.getDate() + 1)
      count++
    }
  } else {
    for (const [date, count] of dayMap.entries()) {
      dailyVolume.push({ date, count })
    }
    dailyVolume.sort((a, b) => a.date.localeCompare(b.date))
  }

  const completed    = statusCount.get('completed')    ?? 0
  const rejected     = statusCount.get('rejected')     ?? 0
  const notReported  = statusCount.get('not-reported') ?? 0

  const rate = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 1000)

  const { avgHours, medianHours, decidedCount } = turnaroundStats(scoped, events)

  // Consistency guard: log error in dev if breakdown sums differ from total
  const statusSum = statusBreakdown.reduce((s, x) => s + x.count, 0)
  const deptSum = byDepartment.reduce((s, x) => s + x.count, 0)
  const authSum = byAuthority.reduce((s, x) => s + x.count, 0)
  const typeSum = byType.reduce((s, x) => s + x.count, 0)
  if (statusSum !== total || deptSum !== total || authSum !== total || typeSum !== total) {
    console.error(
      `[Report Consistency Error] Total (${total}) does not match breakdown sums: ` +
      `statusSum=${statusSum}, deptSum=${deptSum}, authSum=${authSum}, typeSum=${typeSum}`,
    )
  }

  return {
    total,
    completedCount: completed,
    rejectedCount: rejected,
    notReportedCount: notReported,
    statusBreakdown,
    byDepartment,
    byAuthority,
    byType,
    dailyVolume,
    completionRate: rate(completed),
    rejectionRate:  rate(rejected),
    noShowRate:     rate(notReported),
    avgTurnaroundHours: avgHours,
    medianTurnaroundHours: medianHours,
    decidedCount,
  }
}
