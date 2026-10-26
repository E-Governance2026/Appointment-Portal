import { useMemo, useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, Printer, AlertCircle } from 'lucide-react'
import SummaryCards from '../components/reports/SummaryCards'
import BreakdownBars from '../components/reports/BreakdownBars'
import ReportFiltersBar from '../components/reports/ReportFilters'
import ReportTable from '../components/reports/ReportTable'
import Skeleton from '../components/ui/Skeleton'
import { useReportOverview, useReportTable } from '../hooks/useReports'
import { useMasterData } from '../hooks/useMasterData'
import { useAuthStore } from '../store/authStore'
import { hasPermission } from '../config/permissions'
import type {
  ReportFilters,
  RegisterRow,
  PendingRow,
  TurnaroundRow,
  ChangeRow,
} from '../data/reportTypes'
import { downloadReportCsv } from '../services/appointmentsService'

type ReportTab = 'overview' | 'register' | 'pending' | 'turnaround' | 'changes'

const TABS: { key: ReportTab; label: string }[] = [
  { key: 'overview',   label: 'Overview' },
  { key: 'register',   label: 'Appointment register' },
  { key: 'pending',    label: 'Pending approvals' },
  { key: 'turnaround', label: 'Approval turnaround' },
  { key: 'changes',    label: 'Rescheduled and cancelled' },
]

function defaultRange(): { from: string; to: string } {
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(y, m + 1, 0).getDate()
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(lastDay)}` }
}

function formatHeaderDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const day = String(d).padStart(2, '0')
  const mon = dt.toLocaleString('en-GB', { month: 'short', timeZone: 'Asia/Kolkata' })
  return `${day} ${mon} ${y}`
}

function formatHeaderTime(d: Date = new Date()): string {
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })
}

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams()
  const user = useAuthStore(s => s.user)
  const role = user?.role ?? 'requester'
  const canViewAll = hasPermission(role, 'reports.viewAll')

  // Master data for filters
  const { data: masterData } = useMasterData()
  const departments = useMemo(() => {
    if (!masterData?.departments) {
      return [
        'Academic Affairs', 'Finance', 'Human Resources',
        'Examination Cell', 'Registrar',
      ].map(d => ({ value: d, label: d }))
    }
    return masterData.departments.map(d => ({ value: d.name, label: d.name }))
  }, [masterData])

  const authorities = useMemo(() => {
    if (!masterData?.authorities) {
      return [
        { value: 'auth-ss', label: 'Prof. Sneha Shah', department: 'Academic Affairs' },
        { value: 'auth-nj', label: 'Prof. Neha Joshi', department: 'Academic Affairs' },
        { value: 'auth-vm', label: 'Mr. Vivek Mehta', department: 'Finance' },
        { value: 'auth-ap', label: 'Dr. Amit Patel', department: 'Human Resources' },
        { value: 'auth-pd', label: 'Ms. Priya Desai', department: 'Examination Cell' },
      ]
    }
    return masterData.authorities.map(a => ({
      value: a.id,
      label: a.name,
      department: a.department,
    }))
  }, [masterData])

  const appointmentTypes = useMemo(() => {
    return masterData?.types?.map(t => ({ id: t.id, name: t.name })) ?? []
  }, [masterData])

  // Active tab from URL query param (?report=)
  const activeTab = (searchParams.get('report') as ReportTab) || 'overview'

  // Initialize filters from URL or default range
  const [filters, setFilters] = useState<ReportFilters>(() => {
    const from = searchParams.get('from') || defaultRange().from
    const to = searchParams.get('to') || defaultRange().to
    const dateBasis = (searchParams.get('dateBasis') as 'appointment' | 'submitted') || 'appointment'
    const department = searchParams.get('department') || undefined
    const authorityId = searchParams.get('authorityId') || undefined
    const typeId = searchParams.get('typeId') || undefined
    const statusParam = searchParams.get('status')
    const status = statusParam ? (statusParam.includes(',') ? statusParam.split(',') : statusParam) as any : undefined
    const search = searchParams.get('search') || undefined

    return { from, to, dateBasis, department, authorityId, typeId, status, search }
  })

  // Table pagination and sorting state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sortBy, setSortBy] = useState(() => (activeTab === 'pending' ? 'waitingTime' : activeTab === 'turnaround' ? 'decidedAt' : 'submittedAt'))
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Reset page to 1 when filters or tab change
  function handleFiltersChange(next: ReportFilters) {
    setFilters(next)
    setPage(1)
  }

  // Synchronize state with URL searchParams
  useEffect(() => {
    const p = new URLSearchParams()
    if (activeTab !== 'overview') p.set('report', activeTab)
    p.set('from', filters.from)
    p.set('to', filters.to)
    if (filters.dateBasis && filters.dateBasis !== 'appointment') p.set('dateBasis', filters.dateBasis)
    if (filters.department) p.set('department', filters.department)
    if (filters.authorityId) p.set('authorityId', filters.authorityId)
    if (filters.typeId) p.set('typeId', filters.typeId)
    if (filters.status) {
      const s = Array.isArray(filters.status) ? filters.status.join(',') : filters.status
      if (s) p.set('status', s)
    }
    if (filters.search) p.set('search', filters.search)
    setSearchParams(p, { replace: true })
  }, [activeTab, filters])

  // Data fetching
  const {
    data: overviewSummary,
    isLoading: isOverviewLoading,
    isError: isOverviewError,
    refetch: refetchOverview,
  } = useReportOverview(filters)

  const isTableActive = activeTab !== 'overview'
  const {
    data: tableData,
    isLoading: isTableLoading,
    isError: isTableError,
    refetch: refetchTable,
  } = useReportTable<RegisterRow | PendingRow | TurnaroundRow | ChangeRow>(
    activeTab === 'overview' ? 'register' : activeTab,
    filters,
    { page, pageSize, sortBy, sortOrder },
  )

  // Last updated timestamp in Asia/Kolkata
  const [lastUpdatedTime, setLastUpdatedTime] = useState(() => formatHeaderTime())
  useEffect(() => {
    if (overviewSummary || tableData) {
      setLastUpdatedTime(formatHeaderTime())
    }
  }, [overviewSummary, tableData])

  // aria-live announcement
  const [liveMessage, setLiveMessage] = useState('')
  const prevCountRef = useRef<number | null>(null)
  useEffect(() => {
    if (overviewSummary) {
      const count = overviewSummary.total
      if (prevCountRef.current !== null && prevCountRef.current !== count) {
        setLiveMessage(`Report updated, ${count} appointments`)
      }
      prevCountRef.current = count
    }
  }, [overviewSummary])

  // Tab change handler with accessible keyboard navigation
  function handleTabChange(tabKey: ReportTab) {
    const p = new URLSearchParams(searchParams)
    p.set('report', tabKey)
    setSearchParams(p)
    setPage(1)
    if (tabKey === 'pending') setSortBy('waitingTime')
    else if (tabKey === 'turnaround') setSortBy('decidedAt')
    else if (tabKey === 'changes') setSortBy('changedOn')
    else setSortBy('submittedAt')
    setSortOrder('desc')
  }

  // Row counts and export enablement
  const totalRows = isTableActive ? (tableData?.total ?? 0) : (overviewSummary?.total ?? 0)
  const canExport = totalRows > 0
  const [isExporting, setIsExporting] = useState(false)

  async function handleExport() {
    if (!canExport || isExporting) return
    try {
      setIsExporting(true)
      await downloadReportCsv(
        { id: user?.id ?? 'anon', name: user?.name ?? 'User', role },
        activeTab,
        filters,
      )
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  // Active filter description string for print layout
  const filterDescriptionText = useMemo(() => {
    const parts = [
      `Date range: ${formatHeaderDate(filters.from)} to ${formatHeaderDate(filters.to)} (${filters.dateBasis === 'submitted' ? 'Submitted date' : 'Appointment date'})`,
      `Department: ${filters.department || 'All'}`,
      `Authority: ${authorities.find(a => a.value === filters.authorityId)?.label || filters.authorityId || 'All'}`,
      `Type: ${appointmentTypes.find(t => t.id === filters.typeId)?.name || filters.typeId || 'All'}`,
    ]
    if (filters.status) {
      const st = Array.isArray(filters.status) ? filters.status.join(', ') : filters.status
      parts.push(`Status: ${st}`)
    }
    if (filters.search) parts.push(`Search: "${filters.search}"`)
    return parts.join(' | ')
  }, [filters, authorities, appointmentTypes])

  const activeTabLabel = TABS.find(t => t.key === activeTab)?.label || 'Overview'

  return (
    <div>
      {/* Screen Reader aria-live Region */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        style={{ position: 'absolute', width: 1, height: 1, padding: 0, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }}
      >
        {liveMessage}
      </div>

      {/* ── Print-only Header (Appears only on printed output) ── */}
      <div className="print-only" style={{ display: 'none', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '20pt', fontWeight: 700, margin: '0 0 4px 0', color: '#000000' }}>
          Appointment Tracker report
        </h1>
        <h2 style={{ fontSize: '14pt', fontWeight: 600, margin: '0 0 8px 0', color: '#222222' }}>
          {activeTabLabel}
        </h2>
        <p style={{ fontSize: '10pt', color: '#444444', margin: '0 0 4px 0' }}>
          {filterDescriptionText}
        </p>
        <p style={{ fontSize: '9pt', color: '#666666', margin: 0 }}>
          Generated on {formatHeaderDate(new Date().toISOString().slice(0, 10))} at {lastUpdatedTime} (Asia/Kolkata)
        </p>
        <hr style={{ border: 'none', borderTop: '1px solid #cccccc', margin: '12px 0 16px 0' }} />
      </div>

      {/* ── Screen Header ── */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Reports</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>
            Showing {totalRows} appointments from {formatHeaderDate(filters.from)} to {formatHeaderDate(filters.to)}. Last updated {lastUpdatedTime}.
          </p>
        </div>

        {/* Action Buttons: Print (secondary) next to Export CSV (primary) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-secondary"
            style={{
              fontSize: '13px',
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 14px',
              cursor: 'pointer',
            }}
          >
            <Printer size={15} aria-hidden="true" />
            <span>Print</span>
          </button>

          <div
            title={!canExport ? 'No rows to export' : undefined}
            style={{ display: 'inline-block' }}
          >
            <button
              type="button"
              onClick={handleExport}
              disabled={!canExport || isExporting}
              className="btn-primary"
              style={{
                fontSize: '13px',
                minHeight: '44px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 16px',
                opacity: canExport ? 1 : 0.6,
                cursor: canExport && !isExporting ? 'pointer' : 'not-allowed',
              }}
            >
              <Download size={15} aria-hidden="true" />
              <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <ReportFiltersBar
        filters={filters}
        departments={departments}
        authorities={authorities}
        appointmentTypes={appointmentTypes}
        isFixedScope={!canViewAll}
        fixedDepartment={!canViewAll ? user?.department : undefined}
        fixedAuthorityName={!canViewAll ? user?.name : undefined}
        onChange={handleFiltersChange}
        onReset={() => handleFiltersChange({ ...defaultRange(), dateBasis: 'appointment' })}
      />

      {/* ── Navigation Tabs ── */}
      <div
        role="tablist"
        aria-label="Report views"
        className="no-print"
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '1.25rem',
          borderBottom: '1px solid var(--color-sage)',
          overflowX: 'auto',
          paddingBottom: '2px',
        }}
      >
        {TABS.map(t => {
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              id={`tab-${t.key}`}
              aria-controls={`tabpanel-${t.key}`}
              onClick={() => handleTabChange(t.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 14px',
                minHeight: '44px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--color-forest)' : 'var(--color-text-secondary)',
                borderBottom: active ? '2px solid var(--color-forest)' : '2px solid transparent',
                marginBottom: '-1px',
                whiteSpace: 'nowrap',
              }}
              onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
              onBlur={e => (e.currentTarget.style.outline = 'none')}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Active Tab Panel Content ── */}
      <div role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'overview' ? (
          <div>
            {isOverviewLoading ? (
              <div>
                {/* Skeletons matching final layout */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="card" style={{ padding: '1.25rem' }}>
                      <Skeleton width="40%" height={14} style={{ marginBottom: '8px' }} />
                      <Skeleton width="60%" height={28} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="card" style={{ padding: '1.25rem', minHeight: '260px' }}>
                      <Skeleton width="50%" height={16} style={{ marginBottom: '16px' }} />
                      <Skeleton width="100%" height={160} />
                    </div>
                  ))}
                </div>
              </div>
            ) : isOverviewError ? (
              <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
                <AlertCircle size={28} style={{ color: 'var(--color-status-rejected)', margin: '0 auto 12px' }} />
                <p style={{ fontSize: '14px', color: 'var(--color-charcoal)', fontWeight: 600, marginBottom: '8px' }}>
                  Could not load overview report.
                </p>
                <button type="button" onClick={() => refetchOverview()} className="btn-secondary" style={{ fontSize: '13px' }}>
                  Retry
                </button>
              </div>
            ) : overviewSummary ? (
              overviewSummary.total === 0 ? (
                <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                  No appointments match the selected filters.
                </div>
              ) : (
                <>
                  <SummaryCards summary={overviewSummary} />
                  <BreakdownBars summary={overviewSummary} />
                </>
              )
            ) : null}
          </div>
        ) : (
          <ReportTable
            type={activeTab}
            data={tableData}
            isLoading={isTableLoading}
            isError={isTableError}
            onRetry={() => refetchTable()}
            page={page}
            pageSize={pageSize}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onPageChange={setPage}
            onPageSizeChange={sz => { setPageSize(sz); setPage(1); }}
            onSortChange={field => {
              if (sortBy === field) {
                setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
              } else {
                setSortBy(field)
                setSortOrder('desc')
              }
            }}
          />
        )}
      </div>
    </div>
  )
}
