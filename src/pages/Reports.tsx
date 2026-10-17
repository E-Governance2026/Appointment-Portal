import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import SummaryCards from '../components/reports/SummaryCards'
import BreakdownBars from '../components/reports/BreakdownBars'
import ReportFiltersBar from '../components/reports/ReportFilters'
import { useReport } from '../hooks/useReports'
import { useAuthStore } from '../store/authStore'
import { hasPermission } from '../config/permissions'
import { localISODate } from '../data/mockAppointments'
import type { ReportFilters, ReportSummary } from '../data/reportTypes'
import { toCsv, downloadTextFile } from '../utils/csv'

// Static option lists mirroring the approval seed data. In the real system
// these come from the master-data tables.
const DEPARTMENTS = [
  'Academic Affairs', 'Finance', 'Human Resources',
  'Examination Cell', 'Registrar',
].map(d => ({ value: d, label: d }))

const AUTHORITIES = [
  { value: 'auth-ss', label: 'Prof. Sneha Shah' },
  { value: 'auth-nj', label: 'Prof. Neha Joshi' },
  { value: 'auth-vm', label: 'Mr. Vivek Mehta' },
  { value: 'auth-ap', label: 'Dr. Amit Patel' },
  { value: 'auth-pd', label: 'Ms. Priya Desai' },
]

// First and last day of the current month as the default range.
function defaultRange(): { from: string; to: string } {
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(y, m + 1, 0).getDate()
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(lastDay)}` }
}

// Build a CSV of the summary (status + group breakdowns) for export.
function summaryToCsv(summary: ReportSummary, filters: ReportFilters): string {
  const rows: (string | number)[][] = []
  rows.push(['Report generated', localISODate()])
  rows.push(['Range', `${filters.from} to ${filters.to}`])
  if (filters.department)  rows.push(['Department', filters.department])
  if (filters.authorityId) rows.push(['Authority', filters.authorityId])
  if (filters.status)      rows.push(['Status', filters.status])
  rows.push([])
  rows.push(['Metric', 'Value'])
  rows.push(['Total appointments', summary.total])
  rows.push(['Completion rate', `${Math.round(summary.completionRate * 100)}%`])
  rows.push(['Rejection rate', `${Math.round(summary.rejectionRate * 100)}%`])
  rows.push(['Not reported rate', `${Math.round(summary.noShowRate * 100)}%`])
  rows.push(['Average turnaround (hours)', summary.avgTurnaroundHours])
  rows.push([])
  rows.push(['By status', 'Count'])
  summary.statusBreakdown.forEach(s => rows.push([s.label, s.count]))
  rows.push([])
  rows.push(['By department', 'Count'])
  summary.byDepartment.forEach(g => rows.push([g.label, g.count]))
  rows.push([])
  rows.push(['By authority', 'Count'])
  summary.byAuthority.forEach(g => rows.push([g.label, g.count]))
  rows.push([])
  rows.push(['By type', 'Count'])
  summary.byType.forEach(g => rows.push([g.label, g.count]))
  rows.push([])
  rows.push(['Daily volume', 'Count'])
  summary.dailyVolume.forEach(v => rows.push([v.date, v.count]))
  return toCsv(['Appointment report', ''], rows)
}

// ─── Reports page ─────────────────────────────────────────────────────────────
export default function Reports() {
  const role = useAuthStore(s => s.user?.role ?? 'requester')
  const canViewAll = hasPermission(role, 'reports.viewAll')

  const [filters, setFilters] = useState<ReportFilters>(() => defaultRange())
  const { data: summary, isLoading, isError } = useReport(filters)

  const scopeNote = canViewAll ? 'Showing all appointments.' : 'Showing appointments assigned to your role.'

  const canExport = useMemo(() => !!summary && summary.total > 0, [summary])

  function handleExport() {
    if (!summary) return
    const csv = summaryToCsv(summary, filters)
    downloadTextFile(`appointment-report-${filters.from}-to-${filters.to}.csv`, csv)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">{scopeNote}</p>
        </div>
        <button
          onClick={handleExport}
          disabled={!canExport}
          className="btn-primary"
          style={{ fontSize: '13px', opacity: canExport ? 1 : 0.6, cursor: canExport ? 'pointer' : 'not-allowed' }}
        >
          <Download size={14} aria-hidden="true" /> Export CSV
        </button>
      </div>

      <ReportFiltersBar
        filters={filters}
        departments={DEPARTMENTS}
        authorities={AUTHORITIES}
        onChange={setFilters}
        onClear={() => setFilters(f => ({ from: f.from, to: f.to }))}
      />

      {isLoading ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center',
          fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          Building the report...
        </div>
      ) : isError ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center',
          fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          Could not load the report.
        </div>
      ) : summary ? (
        summary.total === 0 ? (
          <div className="card" style={{ padding: '2.5rem', textAlign: 'center',
            fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
            No appointments match the selected filters.
          </div>
        ) : (
          <>
            <SummaryCards summary={summary} />
            <BreakdownBars summary={summary} />
          </>
        )
      ) : null}
    </div>
  )
}
