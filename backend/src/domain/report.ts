// ─── Report aggregation & table processing (server domain) ───────────────────
// Operating on AppointmentDto + AuditEventDto shapes with Asia/Kolkata (IST) timezone
// awareness, role scoping, pure aggregations, and CSV export formatting.

import type { AppointmentStatus } from './statusMachine.js'
import type { AppointmentDto } from '../routes/appointmentMapper.js'
import type { AuditEventDto } from '../routes/auditLog.js'

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  'draft':           'Draft',
  'submitted':       'Submitted',
  'additional-info': 'Additional information required',
  'approved':        'Approved',
  'confirmed':       'Confirmed',
  'rescheduled':     'Rescheduled',
  'completed':       'Completed',
  'cancelled':       'Cancelled',
  'rejected':        'Rejected',
  'not-reported':    'Not reported',
}

export interface ReportFilters {
  from:         string            // ISO yyyy-mm-dd (inclusive)
  to:           string            // ISO yyyy-mm-dd (inclusive)
  dateBasis?:   'appointment' | 'submitted'
  department?:  string
  authorityId?: string
  typeId?:      string
  status?:      AppointmentStatus | AppointmentStatus[]
  search?:      string
}

export interface StatusBreakdown { status: AppointmentStatus; label: string; count: number }
export interface GroupCount { key: string; label: string; count: number }
export interface DailyVolume { date: string; count: number }

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
  completionRate:        number
  rejectionRate:         number
  noShowRate:            number
  avgTurnaroundHours:    number
  medianTurnaroundHours: number
  decidedCount:          number
}

// ─── Asia/Kolkata (IST) Timezone Helpers ─────────────────────────────────────
export function toISTDateString(isoTimestamp: string): string {
  if (!isoTimestamp) return ''
  const d = new Date(isoTimestamp)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function toISTDateTime(isoTimestamp: string): { date: string; time: string } {
  if (!isoTimestamp) return { date: '', time: '' }
  const d = new Date(isoTimestamp)
  if (isNaN(d.getTime())) return { date: '', time: '' }
  const date = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
  return { date, time }
}

export function formatDurationHours(hours: number): string {
  if (!hours || hours <= 0) return '0 min'
  if (hours >= 24) {
    const d = Math.floor(hours / 24)
    const remH = Math.round(hours % 24)
    return remH > 0 ? `${d} d ${remH} h` : `${d} d`
  }
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

// ─── Filter Application ───────────────────────────────────────────────────────
export function applyFilters(records: AppointmentDto[], f: ReportFilters): AppointmentDto[] {
  const dateBasis = f.dateBasis ?? 'appointment'
  const statuses = f.status
    ? (Array.isArray(f.status) ? f.status : [f.status])
    : []

  const search = (f.search ?? '').trim().toLowerCase()

  return records.filter(r => {
    // Date filter depending on dateBasis:
    if (dateBasis === 'submitted') {
      const subISTDate = toISTDateString(r.submittedAt)
      if (subISTDate < f.from || subISTDate > f.to) return false
    } else {
      // 'appointment' basis: slot-less records with no date pass through
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
  records: AppointmentDto[],
  keyOf: (r: AppointmentDto) => { key: string; label: string },
): GroupCount[] {
  const map = new Map<string, GroupCount>()
  for (const r of records) {
    const { key, label } = keyOf(r)
    const existing = map.get(key)
    if (existing) existing.count++
    else map.set(key, { key, label, count: 1 })
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function turnaroundStats(records: AppointmentDto[], events: AuditEventDto[]): {
  avgHours: number
  medianHours: number
  maxHours: number
  decidedCount: number
} {
  const DECISION = new Set(['approved', 'rejected'])
  const byAppt = new Map<string, AuditEventDto[]>()
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
  if (n === 0) return { avgHours: 0, medianHours: 0, maxHours: 0, decidedCount: 0 }

  const totalHours = hoursList.reduce((acc, h) => acc + h, 0)
  const avgHours = Math.round((totalHours / n) * 10) / 10
  const maxHours = Math.round(Math.max(...hoursList) * 10) / 10

  hoursList.sort((a, b) => a - b)
  const mid = Math.floor(n / 2)
  const medianHours = n % 2 === 0
    ? Math.round(((hoursList[mid - 1] + hoursList[mid]) / 2) * 10) / 10
    : Math.round(hoursList[mid] * 10) / 10

  return { avgHours, medianHours, maxHours, decidedCount: n }
}

export function computeReport(
  records: AppointmentDto[],
  events: AuditEventDto[],
  filters: ReportFilters,
): ReportSummary {
  const scoped = applyFilters(records, filters)
  const total = scoped.length

  const STATUS_ORDER: AppointmentStatus[] = [
    'draft', 'submitted', 'additional-info', 'approved', 'confirmed',
    'rescheduled', 'completed', 'cancelled', 'rejected', 'not-reported',
  ]
  const statusCount = new Map<AppointmentStatus, number>()
  for (const r of scoped) statusCount.set(r.status, (statusCount.get(r.status) ?? 0) + 1)
  const statusBreakdown: StatusBreakdown[] = STATUS_ORDER
    .filter(s => statusCount.has(s))
    .map(s => ({ status: s, label: STATUS_LABELS[s], count: statusCount.get(s)! }))

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
    const day = (filters.dateBasis === 'submitted') ? toISTDateString(r.submittedAt) : r.date
    if (!day) continue
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1)
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

  const completed   = statusCount.get('completed')    ?? 0
  const rejected    = statusCount.get('rejected')     ?? 0
  const notReported = statusCount.get('not-reported') ?? 0
  const rate = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 1000)

  const { avgHours, medianHours, decidedCount } = turnaroundStats(scoped, events)

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

// ─── Table Report Row Shapes ─────────────────────────────────────────────────
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

// ─── Table Builders ──────────────────────────────────────────────────────────
export function buildRegisterReport(
  records: AppointmentDto[],
  filters: ReportFilters,
  page = 1,
  pageSize = 10,
  sortBy = 'submittedAt',
  sortOrder: 'asc' | 'desc' = 'desc',
): TableReportResult<RegisterRow> {
  const filtered = applyFilters(records, filters)

  const rows: RegisterRow[] = filtered.map(r => ({
    id: r.id,
    requester: r.requester,
    requesterCategory: r.requesterCategory || 'Staff',
    department: r.department || 'Unspecified',
    authorityName: r.authorityName || 'Unspecified',
    typeName: (r.typeName && r.typeName.trim()) ? r.typeName.trim() : 'Unspecified',
    date: r.date || '',
    time: r.time || '',
    status: r.status,
    submittedAt: r.submittedAt,
  }))

  rows.sort((a, b) => {
    let cmp = 0
    if (sortBy === 'id') cmp = a.id.localeCompare(b.id)
    else if (sortBy === 'requester') cmp = a.requester.localeCompare(b.requester)
    else if (sortBy === 'department') cmp = a.department.localeCompare(b.department)
    else if (sortBy === 'authorityName') cmp = a.authorityName.localeCompare(b.authorityName)
    else if (sortBy === 'typeName') cmp = a.typeName.localeCompare(b.typeName)
    else if (sortBy === 'date') cmp = (a.date || '').localeCompare(b.date || '')
    else if (sortBy === 'status') cmp = a.status.localeCompare(b.status)
    else cmp = a.submittedAt.localeCompare(b.submittedAt)
    if (cmp === 0) cmp = a.id.localeCompare(b.id)
    return sortOrder === 'desc' ? -cmp : cmp
  })

  const start = (page - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
  }
}

export function buildPendingReport(
  records: AppointmentDto[],
  filters: ReportFilters,
  page = 1,
  pageSize = 10,
  sortBy = 'waitingTime',
  sortOrder: 'asc' | 'desc' = 'desc',
): TableReportResult<PendingRow> {
  const filtered = applyFilters(records, filters).filter(r =>
    ['submitted', 'additional-info'].includes(r.status),
  )

  const now = Date.now()
  const rows: PendingRow[] = filtered.map(r => {
    const subTime = new Date(r.submittedAt).getTime()
    const diffHours = Math.max(0, (now - subTime) / (1000 * 60 * 60))
    return {
      id: r.id,
      requester: r.requester,
      typeName: (r.typeName && r.typeName.trim()) ? r.typeName.trim() : 'Unspecified',
      authorityName: r.authorityName || 'Unspecified',
      submittedAt: r.submittedAt,
      waitingTimeHours: diffHours,
      waitingTime: formatDurationHours(diffHours),
      status: r.status,
    }
  })

  // Default: longest waiting first (descending waiting time)
  rows.sort((a, b) => {
    let cmp = 0
    if (sortBy === 'submittedAt') cmp = a.submittedAt.localeCompare(b.submittedAt)
    else if (sortBy === 'waitingTime') cmp = a.waitingTimeHours - b.waitingTimeHours
    else if (sortBy === 'requester') cmp = a.requester.localeCompare(b.requester)
    else if (sortBy === 'typeName') cmp = a.typeName.localeCompare(b.typeName)
    else cmp = a.waitingTimeHours - b.waitingTimeHours
    if (cmp === 0) cmp = a.id.localeCompare(b.id)
    return sortOrder === 'desc' ? -cmp : cmp
  })

  const start = (page - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
  }
}

export function buildTurnaroundReport(
  records: AppointmentDto[],
  events: AuditEventDto[],
  filters: ReportFilters,
  page = 1,
  pageSize = 10,
  sortBy = 'decidedAt',
  sortOrder: 'asc' | 'desc' = 'desc',
): TableReportResult<TurnaroundRow> {
  const filtered = applyFilters(records, filters)
  const DECISION = new Set(['approved', 'rejected'])

  const byAppt = new Map<string, AuditEventDto[]>()
  for (const e of events) {
    const list = byAppt.get(e.appointmentId) ?? []
    list.push(e)
    byAppt.set(e.appointmentId, list)
  }

  const rows: TurnaroundRow[] = []
  for (const r of filtered) {
    const evs = (byAppt.get(r.id) ?? [])
      .filter(e => DECISION.has(e.action))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    const first = evs[0]
    if (!first) continue

    const start = new Date(r.submittedAt).getTime()
    const end = new Date(first.timestamp).getTime()
    const durationHours = Math.max(0, (end - start) / (1000 * 60 * 60))

    rows.push({
      id: r.id,
      typeName: (r.typeName && r.typeName.trim()) ? r.typeName.trim() : 'Unspecified',
      authorityName: r.authorityName || 'Unspecified',
      submittedAt: r.submittedAt,
      decidedAt: first.timestamp,
      decision: first.action as 'approved' | 'rejected',
      durationHours,
      timeToDecide: formatDurationHours(durationHours),
      decidedBy: first.actorName || 'Authority',
    })
  }

  rows.sort((a, b) => {
    let cmp = 0
    if (sortBy === 'durationHours' || sortBy === 'timeToDecide') cmp = a.durationHours - b.durationHours
    else if (sortBy === 'submittedAt') cmp = a.submittedAt.localeCompare(b.submittedAt)
    else if (sortBy === 'decision') cmp = a.decision.localeCompare(b.decision)
    else if (sortBy === 'typeName') cmp = a.typeName.localeCompare(b.typeName)
    else cmp = a.decidedAt.localeCompare(b.decidedAt)
    if (cmp === 0) cmp = a.id.localeCompare(b.id)
    return sortOrder === 'desc' ? -cmp : cmp
  })

  const { avgHours, medianHours, maxHours, decidedCount } = turnaroundStats(filtered, events)
  const start = (page - 1) * pageSize

  return {
    rows: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
    summary: {
      average: formatDurationHours(avgHours),
      median: formatDurationHours(medianHours),
      longest: formatDurationHours(maxHours),
      decidedRequests: decidedCount,
    },
  }
}

export function buildChangesReport(
  records: AppointmentDto[],
  events: AuditEventDto[],
  filters: ReportFilters,
  page = 1,
  pageSize = 10,
  sortBy = 'changedOn',
  sortOrder: 'asc' | 'desc' = 'desc',
): TableReportResult<ChangeRow> {
  const filtered = applyFilters(records, filters)
  const CHANGE_ACTIONS = new Set(['reschedule-proposed', 'reschedule-accepted', 'cancelled'])

  const byAppt = new Map<string, AuditEventDto[]>()
  for (const e of events) {
    const list = byAppt.get(e.appointmentId) ?? []
    list.push(e)
    byAppt.set(e.appointmentId, list)
  }

  const rows: ChangeRow[] = []
  for (const r of filtered) {
    const evs = (byAppt.get(r.id) ?? [])
      .filter(e => CHANGE_ACTIONS.has(e.action))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    if (evs.length > 0) {
      for (const ev of evs) {
        const isCancel = ev.action === 'cancelled'
        rows.push({
          id: r.id,
          typeName: (r.typeName && r.typeName.trim()) ? r.typeName.trim() : 'Unspecified',
          change: isCancel ? 'Cancelled' : 'Rescheduled',
          initiatedBy: ev.actorName || 'Staff',
          originalTime: r.date && r.time ? `${r.date} ${r.time}` : 'Not scheduled',
          newTime: isCancel ? '—' : (r.proposedDate && r.proposedTime ? `${r.proposedDate} ${r.proposedTime}` : (r.date && r.time ? `${r.date} ${r.time}` : '—')),
          reason: ev.detail || '—',
          changedOn: ev.timestamp,
        })
      }
    } else if (r.status === 'rescheduled' || r.status === 'cancelled') {
      rows.push({
        id: r.id,
        typeName: (r.typeName && r.typeName.trim()) ? r.typeName.trim() : 'Unspecified',
        change: r.status === 'cancelled' ? 'Cancelled' : 'Rescheduled',
        initiatedBy: 'Staff',
        originalTime: r.date && r.time ? `${r.date} ${r.time}` : 'Not scheduled',
        newTime: r.status === 'cancelled' ? '—' : (r.proposedDate && r.proposedTime ? `${r.proposedDate} ${r.proposedTime}` : '—'),
        reason: '—',
        changedOn: r.updatedAt || r.submittedAt,
      })
    }
  }

  rows.sort((a, b) => {
    let cmp = 0
    if (sortBy === 'change') cmp = a.change.localeCompare(b.change)
    else if (sortBy === 'typeName') cmp = a.typeName.localeCompare(b.typeName)
    else cmp = a.changedOn.localeCompare(b.changedOn)
    if (cmp === 0) cmp = a.id.localeCompare(b.id)
    return sortOrder === 'desc' ? -cmp : cmp
  })

  const start = (page - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
  }
}

// ─── CSV Injection Defense & Export Streaming ─────────────────────────────────
export function sanitizeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return ''
  let str = String(val).trim()
  // Prefix cells starting with =, +, -, @ with a single quote to prevent injection
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`
  }
  // If contains commas, quotes, or newlines, escape quotes and wrap in quotes
  if (/[",\r\n]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCsvRow(cells: unknown[]): string {
  return cells.map(sanitizeCsvCell).join(',') + '\r\n'
}

export interface ExportAuditRecord {
  id:         string
  action:     'report_exported'
  reportName: string
  actorId:    string
  actorRole:  string
  filters:    ReportFilters
  rowCount:   number
  timestamp:  string
}

const exportAudits: ExportAuditRecord[] = []

export function recordExportAudit(record: Omit<ExportAuditRecord, 'id' | 'timestamp' | 'action'> & { action?: 'report_exported' }): ExportAuditRecord {
  const full: ExportAuditRecord = {
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action: 'report_exported',
    ...record,
    timestamp: new Date().toISOString(),
  }
  exportAudits.push(full)
  return full
}

export function getExportAudits(): ExportAuditRecord[] {
  return [...exportAudits]
}

export function __clearExportAudits(): void {
  exportAudits.length = 0
}

export function generateCsvStream(
  type: string,
  records: AppointmentDto[],
  events: AuditEventDto[],
  filters: ReportFilters,
): { filename: string; csv: string; rowCount: number } {
  const MAX_ROWS = 50000
  const BOM = '\uFEFF'
  let rowsContent = ''
  let rowCount = 0

  if (type === 'register') {
    const data = buildRegisterReport(records, filters, 1, MAX_ROWS + 1).rows
    if (data.length > MAX_ROWS) {
      throw new Error('The export is limited to 50,000 rows. Narrow the date range.')
    }
    rowCount = data.length
    rowsContent += toCsvRow([
      'Appointment ID', 'Requester', 'Requester category', 'Department',
      'Authority', 'Type', 'Appointment date', 'Appointment time', 'Status',
      'Submitted date', 'Submitted time',
    ])
    for (const r of data) {
      const sub = toISTDateTime(r.submittedAt)
      rowsContent += toCsvRow([
        r.id, r.requester, r.requesterCategory, r.department,
        r.authorityName, r.typeName, r.date, r.time, STATUS_LABELS[r.status] || r.status,
        sub.date, sub.time,
      ])
    }
  } else if (type === 'pending') {
    const data = buildPendingReport(records, filters, 1, MAX_ROWS + 1).rows
    if (data.length > MAX_ROWS) {
      throw new Error('The export is limited to 50,000 rows. Narrow the date range.')
    }
    rowCount = data.length
    rowsContent += toCsvRow([
      'Appointment ID', 'Requester', 'Type', 'Authority',
      'Submitted date', 'Submitted time', 'Waiting time', 'Status',
    ])
    for (const r of data) {
      const sub = toISTDateTime(r.submittedAt)
      rowsContent += toCsvRow([
        r.id, r.requester, r.typeName, r.authorityName,
        sub.date, sub.time, r.waitingTime, STATUS_LABELS[r.status] || r.status,
      ])
    }
  } else if (type === 'turnaround') {
    const data = buildTurnaroundReport(records, events, filters, 1, MAX_ROWS + 1).rows
    if (data.length > MAX_ROWS) {
      throw new Error('The export is limited to 50,000 rows. Narrow the date range.')
    }
    rowCount = data.length
    rowsContent += toCsvRow([
      'Appointment ID', 'Type', 'Authority',
      'Submitted date', 'Submitted time', 'Decided date', 'Decided time',
      'Decision', 'Time to decide', 'Decided by',
    ])
    for (const r of data) {
      const sub = toISTDateTime(r.submittedAt)
      const dec = toISTDateTime(r.decidedAt)
      rowsContent += toCsvRow([
        r.id, r.typeName, r.authorityName,
        sub.date, sub.time, dec.date, dec.time,
        r.decision === 'approved' ? 'Approved' : 'Rejected',
        r.timeToDecide, r.decidedBy,
      ])
    }
  } else if (type === 'changes') {
    const data = buildChangesReport(records, events, filters, 1, MAX_ROWS + 1).rows
    if (data.length > MAX_ROWS) {
      throw new Error('The export is limited to 50,000 rows. Narrow the date range.')
    }
    rowCount = data.length
    rowsContent += toCsvRow([
      'Appointment ID', 'Type', 'Change', 'Initiated by',
      'Original time', 'New time', 'Reason', 'Changed date', 'Changed time',
    ])
    for (const r of data) {
      const chg = toISTDateTime(r.changedOn)
      rowsContent += toCsvRow([
        r.id, r.typeName, r.change, r.initiatedBy,
        r.originalTime, r.newTime, r.reason, chg.date, chg.time,
      ])
    }
  } else {
    // overview export
    const summary = computeReport(records, events, filters)
    rowCount = summary.total
    rowsContent += toCsvRow(['Metric', 'Value'])
    rowsContent += toCsvRow(['Total appointments', summary.total])
    rowsContent += toCsvRow(['Completed', `${summary.completedCount} (${((summary.completionRate || 0) * 100).toFixed(1)}%)`])
    rowsContent += toCsvRow(['Rejected', `${summary.rejectedCount} (${((summary.rejectionRate || 0) * 100).toFixed(1)}%)`])
    rowsContent += toCsvRow(['Not reported', `${summary.notReportedCount} (${((summary.noShowRate || 0) * 100).toFixed(1)}%)`])
    rowsContent += toCsvRow(['Average turnaround', formatDurationHours(summary.avgTurnaroundHours)])
    rowsContent += toCsvRow(['Median turnaround', formatDurationHours(summary.medianTurnaroundHours)])
    rowsContent += toCsvRow(['Decided requests', summary.decidedCount])
    rowsContent += '\r\n'
    rowsContent += toCsvRow(['By status', 'Count'])
    for (const s of summary.statusBreakdown) rowsContent += toCsvRow([s.label, s.count])
    rowsContent += '\r\n'
    rowsContent += toCsvRow(['By department', 'Count'])
    for (const d of summary.byDepartment) rowsContent += toCsvRow([d.label, d.count])
    rowsContent += '\r\n'
    rowsContent += toCsvRow(['By authority', 'Count'])
    for (const a of summary.byAuthority) rowsContent += toCsvRow([a.label, a.count])
    rowsContent += '\r\n'
    rowsContent += toCsvRow(['By type', 'Count'])
    for (const t of summary.byType) rowsContent += toCsvRow([t.label, t.count])
    rowsContent += '\r\n'
    rowsContent += toCsvRow(['Daily volume', 'Count'])
    for (const v of summary.dailyVolume) rowsContent += toCsvRow([v.date, v.count])
  }

  const cleanName = type.replace(/[^a-zA-Z0-9_-]/g, '_')
  const filename = `${cleanName}_${filters.from}_to_${filters.to}.csv`
  return { filename, csv: BOM + rowsContent, rowCount }
}
