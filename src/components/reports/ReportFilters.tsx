import { useState, useEffect, useRef } from 'react'
import { Calendar, Search, X, ChevronDown, Check } from 'lucide-react'
import type { ReportFilters as Filters } from '../../data/reportTypes'
import type { AppointmentStatus } from '../../data/mockAppointments'
import { STATUS_CONFIG } from '../../data/mockAppointments'

interface Option { value: string; label: string }

export interface MasterTypeOption { id: string; name: string }

interface ReportFiltersProps {
  filters:             Filters
  departments:         Option[]
  authorities:         (Option & { department?: string })[]
  appointmentTypes?:   MasterTypeOption[]
  isFixedScope?:       boolean
  fixedDepartment?:    string
  fixedAuthorityName?: string
  onChange:            (next: Filters) => void
  onReset:             () => void
}

const STATUS_OPTIONS: AppointmentStatus[] = [
  'submitted', 'additional-info', 'approved', 'confirmed',
  'rescheduled', 'completed', 'cancelled', 'rejected', 'not-reported',
]

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: '0.35rem',
  display: 'block',
}

const selectStyle: React.CSSProperties = {
  fontSize: '13px',
  height: '38px',
  minHeight: '38px',
  padding: '0 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-sage)',
  backgroundColor: '#ffffff',
  fontFamily: 'var(--font-sans)',
  color: 'var(--color-charcoal)',
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const day = String(d).padStart(2, '0')
  const mon = dt.toLocaleString('en-GB', { month: 'short', timeZone: 'Asia/Kolkata' })
  return `${day} ${mon} ${y}`
}

function getPresetRange(presetKey: string): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (presetKey === 'today') {
    const iso = toIso(now)
    return { from: iso, to: iso }
  }
  if (presetKey === 'last7') {
    const p = new Date(now)
    p.setDate(p.getDate() - 6)
    return { from: toIso(p), to: toIso(now) }
  }
  if (presetKey === 'last30') {
    const p = new Date(now)
    p.setDate(p.getDate() - 29)
    return { from: toIso(p), to: toIso(now) }
  }
  if (presetKey === 'thisMonth') {
    const lastDay = new Date(y, m + 1, 0).getDate()
    return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(lastDay)}` }
  }
  if (presetKey === 'lastMonth') {
    const prevLastDay = new Date(y, m, 0).getDate()
    const py = m === 0 ? y - 1 : y
    const pm = m === 0 ? 12 : m
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(prevLastDay)}` }
  }
  if (presetKey === 'thisYear') {
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}` }
}

function validateRange(from: string, to: string): string | null {
  if (!from || !to) return 'Please choose both dates.'
  if (from > to) return 'The start date must be on or before the end date.'
  const diffDays = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)) + 1
  if (diffDays > 366) return 'Choose a range of 366 days or fewer.'
  return null
}

export default function ReportFilters({
  filters,
  departments,
  authorities,
  appointmentTypes = [],
  isFixedScope = false,
  fixedDepartment,
  fixedAuthorityName,
  onChange,
  onReset,
}: ReportFiltersProps) {
  // Popover state for Date Range
  const [showDatePopover, setShowDatePopover] = useState(false)
  const [customFrom, setCustomFrom] = useState(filters.from)
  const [customTo, setCustomTo] = useState(filters.to)
  const [dateError, setDateError] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Popover state for Status multi-select
  const [showStatusPopover, setShowStatusPopover] = useState(false)
  const statusPopoverRef = useRef<HTMLDivElement>(null)

  // Search input debouncing
  const [searchTerm, setSearchTerm] = useState(filters.search ?? '')
  useEffect(() => {
    setSearchTerm(filters.search ?? '')
  }, [filters.search])

  useEffect(() => {
    const handler = setTimeout(() => {
      if ((filters.search ?? '') !== searchTerm) {
        onChange({ ...filters, search: searchTerm.trim() || undefined })
      }
    }, 300)
    return () => clearTimeout(handler)
  }, [searchTerm])

  // Close popovers on click outside or escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowDatePopover(false)
      }
      if (statusPopoverRef.current && !statusPopoverRef.current.contains(e.target as Node)) {
        setShowStatusPopover(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowDatePopover(false)
        setShowStatusPopover(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Filter authorities based on selected department
  const filteredAuthorities = filters.department
    ? authorities.filter(a => !a.department || a.department === filters.department)
    : authorities

  const activeStatuses: AppointmentStatus[] = Array.isArray(filters.status)
    ? filters.status
    : filters.status
    ? [filters.status]
    : []

  function toggleStatus(st: AppointmentStatus) {
    let next: AppointmentStatus[]
    if (activeStatuses.includes(st)) {
      next = activeStatuses.filter(s => s !== st)
    } else {
      next = [...activeStatuses, st]
    }
    onChange({
      ...filters,
      status: next.length === 0 ? undefined : next,
    })
  }

  function handleApplyPreset(presetKey: string) {
    const range = getPresetRange(presetKey)
    setDateError(null)
    setShowDatePopover(false)
    onChange({ ...filters, from: range.from, to: range.to })
  }

  function handleApplyCustom() {
    const err = validateRange(customFrom, customTo)
    if (err) {
      setDateError(err)
      return
    }
    setDateError(null)
    setShowDatePopover(false)
    onChange({ ...filters, from: customFrom, to: customTo })
  }

  // Active chips calculation
  const hasCustomBasis = filters.dateBasis && filters.dateBasis !== 'appointment'
  const hasDept = Boolean(filters.department)
  const hasAuth = Boolean(filters.authorityId)
  const hasType = Boolean(filters.typeId)
  const hasStatus = activeStatuses.length > 0
  const hasSearch = Boolean(filters.search && filters.search.trim())

  const hasAnyFilters = hasCustomBasis || hasDept || hasAuth || hasType || hasStatus || hasSearch

  return (
    <div className="card reports-filter-bar no-print" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          alignItems: 'flex-end',
        }}
      >
        {/* Date Basis */}
        <div>
          <label htmlFor="rep-date-basis" style={labelStyle}>Date basis</label>
          <select
            id="rep-date-basis"
            className="input"
            value={filters.dateBasis ?? 'appointment'}
            style={selectStyle}
            onChange={e => onChange({ ...filters, dateBasis: e.target.value as 'appointment' | 'submitted' })}
          >
            <option value="appointment">Appointment date</option>
            <option value="submitted">Submitted date</option>
          </select>
        </div>

        {/* Date Range Popover */}
        <div style={{ position: 'relative' }} ref={popoverRef}>
          <label id="rep-date-range-label" style={labelStyle}>Date range</label>
          <button
            type="button"
            aria-labelledby="rep-date-range-label rep-date-range-btn"
            id="rep-date-range-btn"
            className="btn-secondary"
            onClick={() => {
              setCustomFrom(filters.from)
              setCustomTo(filters.to)
              setDateError(null)
              setShowDatePopover(!showDatePopover)
            }}
            style={{
              ...selectStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <Calendar size={14} aria-hidden="true" style={{ color: 'var(--color-forest)', flexShrink: 0 }} />
              <span>{formatDate(filters.from)} - {formatDate(filters.to)}</span>
            </span>
            <ChevronDown size={14} aria-hidden="true" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
          </button>

          {showDatePopover && (
            <div
              role="dialog"
              aria-label="Choose date range"
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                zIndex: 50,
                backgroundColor: '#ffffff',
                border: '1px solid var(--color-sage)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.1))',
                padding: '1rem',
                minWidth: 'min(310px, calc(100vw - 32px))',
                maxWidth: 'calc(100vw - 32px)',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '1rem' }}>
                <button type="button" className="btn-secondary" style={{ fontSize: '12px', padding: '6px 8px' }} onClick={() => handleApplyPreset('today')}>Today</button>
                <button type="button" className="btn-secondary" style={{ fontSize: '12px', padding: '6px 8px' }} onClick={() => handleApplyPreset('last7')}>Last 7 days</button>
                <button type="button" className="btn-secondary" style={{ fontSize: '12px', padding: '6px 8px' }} onClick={() => handleApplyPreset('last30')}>Last 30 days</button>
                <button type="button" className="btn-secondary" style={{ fontSize: '12px', padding: '6px 8px', borderColor: 'var(--color-emerald)', fontWeight: 600 }} onClick={() => handleApplyPreset('thisMonth')}>This month</button>
                <button type="button" className="btn-secondary" style={{ fontSize: '12px', padding: '6px 8px' }} onClick={() => handleApplyPreset('lastMonth')}>Last month</button>
                <button type="button" className="btn-secondary" style={{ fontSize: '12px', padding: '6px 8px' }} onClick={() => handleApplyPreset('thisYear')}>This year</button>
              </div>

              <div style={{ borderTop: '1px solid var(--color-sage)', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-charcoal)', marginBottom: '0.5rem' }}>Custom range</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={e => { setCustomFrom(e.target.value); setDateError(null) }}
                    className="input"
                    aria-label="Start date"
                    style={{ fontSize: '12px', padding: '4px 6px', height: '32px' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>to</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={e => { setCustomTo(e.target.value); setDateError(null) }}
                    className="input"
                    aria-label="End date"
                    style={{ fontSize: '12px', padding: '4px 6px', height: '32px' }}
                  />
                </div>
                {dateError && (
                  <p role="alert" style={{ fontSize: '12px', color: 'var(--color-status-rejected)', marginTop: '0.4rem', marginBottom: 0 }}>
                    {dateError}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={() => setShowDatePopover(false)}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" style={{ fontSize: '12px', padding: '6px 14px' }} onClick={handleApplyCustom}>
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Department */}
        <div>
          <label htmlFor="rep-dept" style={labelStyle}>Department</label>
          {isFixedScope && fixedDepartment ? (
            <div
              id="rep-dept"
              tabIndex={0}
              style={{
                ...selectStyle,
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'var(--color-cream)',
                color: 'var(--color-text-secondary)',
                cursor: 'not-allowed',
              }}
            >
              {fixedDepartment}
            </div>
          ) : (
            <select
              id="rep-dept"
              className="input"
              value={filters.department ?? ''}
              style={selectStyle}
              onChange={e => {
                const nextDept = e.target.value || undefined
                onChange({ ...filters, department: nextDept, authorityId: undefined })
              }}
            >
              <option value="">All departments</option>
              {departments.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          )}
        </div>

        {/* Authority */}
        <div>
          <label htmlFor="rep-auth" style={labelStyle}>Authority</label>
          {isFixedScope && fixedAuthorityName ? (
            <div
              id="rep-auth"
              tabIndex={0}
              style={{
                ...selectStyle,
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'var(--color-cream)',
                color: 'var(--color-text-secondary)',
                cursor: 'not-allowed',
              }}
            >
              {fixedAuthorityName}
            </div>
          ) : (
            <select
              id="rep-auth"
              className="input"
              value={filters.authorityId ?? ''}
              style={selectStyle}
              onChange={e => onChange({ ...filters, authorityId: e.target.value || undefined })}
            >
              <option value="">All authorities</option>
              {filteredAuthorities.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          )}
        </div>

        {/* Appointment Type */}
        <div>
          <label htmlFor="rep-type" style={labelStyle}>Appointment type</label>
          <select
            id="rep-type"
            className="input"
            value={filters.typeId ?? ''}
            style={selectStyle}
            onChange={e => onChange({ ...filters, typeId: e.target.value || undefined })}
          >
            <option value="">All types</option>
            {appointmentTypes.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Status Multi-Select Popover */}
        <div style={{ position: 'relative' }} ref={statusPopoverRef}>
          <label id="rep-status-label" style={labelStyle}>Status</label>
          <button
            type="button"
            aria-labelledby="rep-status-label rep-status-btn"
            id="rep-status-btn"
            className="btn-secondary"
            onClick={() => setShowStatusPopover(!showStatusPopover)}
            style={{
              ...selectStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            <span>
              {activeStatuses.length === 0
                ? 'All statuses'
                : activeStatuses.length === 1
                ? STATUS_CONFIG[activeStatuses[0]]?.label || activeStatuses[0]
                : `Status (${activeStatuses.length})`}
            </span>
            <ChevronDown size={14} aria-hidden="true" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
          </button>

          {showStatusPopover && (
            <div
              role="dialog"
              aria-label="Filter by status"
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                zIndex: 50,
                backgroundColor: '#ffffff',
                border: '1px solid var(--color-sage)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.1))',
                padding: '0.75rem',
                minWidth: '220px',
                maxHeight: '280px',
                overflowY: 'auto',
              }}
            >
              {STATUS_OPTIONS.map(s => {
                const checked = activeStatuses.includes(s)
                return (
                  <label
                    key={s}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--color-charcoal)',
                      backgroundColor: checked ? 'var(--color-cream)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStatus(s)}
                      style={{ accentColor: 'var(--color-emerald)' }}
                    />
                    <span>{STATUS_CONFIG[s]?.label || s}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {/* Search */}
        <div>
          <label htmlFor="rep-search" style={labelStyle}>Search</label>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-secondary)',
              }}
            />
            <input
              id="rep-search"
              type="text"
              placeholder="ID or requester..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="input"
              style={{
                ...selectStyle,
                paddingLeft: '32px',
                width: '100%',
              }}
            />
          </div>
        </div>
      </div>

      {/* Active Filter Chips & Reset */}
      {hasAnyFilters && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px',
            marginTop: '1rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--color-sage)',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Active filters:</span>

          {hasCustomBasis && (
            <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '12px' }}>
              Basis: Submitted
              <button
                type="button"
                aria-label="Remove date basis filter"
                onClick={() => onChange({ ...filters, dateBasis: 'appointment' })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <X size={12} />
              </button>
            </span>
          )}

          {hasDept && (
            <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '12px' }}>
              Dept: {filters.department}
              <button
                type="button"
                aria-label="Remove department filter"
                onClick={() => onChange({ ...filters, department: undefined, authorityId: undefined })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <X size={12} />
              </button>
            </span>
          )}

          {hasAuth && (
            <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '12px' }}>
              Authority: {authorities.find(a => a.value === filters.authorityId)?.label || filters.authorityId}
              <button
                type="button"
                aria-label="Remove authority filter"
                onClick={() => onChange({ ...filters, authorityId: undefined })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <X size={12} />
              </button>
            </span>
          )}

          {hasType && (
            <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '12px' }}>
              Type: {appointmentTypes.find(t => t.id === filters.typeId)?.name || filters.typeId}
              <button
                type="button"
                aria-label="Remove appointment type filter"
                onClick={() => onChange({ ...filters, typeId: undefined })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <X size={12} />
              </button>
            </span>
          )}

          {activeStatuses.map(st => (
            <span key={st} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '12px' }}>
              Status: {STATUS_CONFIG[st]?.label || st}
              <button
                type="button"
                aria-label={`Remove ${STATUS_CONFIG[st]?.label || st} status filter`}
                onClick={() => toggleStatus(st)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <X size={12} />
              </button>
            </span>
          ))}

          {hasSearch && (
            <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '12px' }}>
              Search: "{filters.search}"
              <button
                type="button"
                aria-label="Remove search filter"
                onClick={() => {
                  setSearchTerm('')
                  onChange({ ...filters, search: undefined })
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <X size={12} />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={onReset}
            className="btn-text"
            style={{
              fontSize: '12px',
              color: 'var(--color-emerald)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: '4px',
            }}
          >
            Reset filters
          </button>
        </div>
      )}
    </div>
  )
}
