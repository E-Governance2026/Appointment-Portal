import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, CalendarPlus, Eye, XCircle,
  Calendar, Clock, Building2, User, SlidersHorizontal, Upload,
} from 'lucide-react'
import StatusBadge from '../components/common/StatusBadge'
import { SEED_APPOINTMENTS, type AppointmentRecord, type AppointmentStatus } from '../data/mockAppointments'

// ─── Filter tabs ──────────────────────────────────────────────────────────────
type FilterTab = 'all' | 'submitted' | 'approved' | 'confirmed' | 'completed' | 'cancelled'

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',       label: 'All'       },
  { key: 'submitted', label: 'Submitted' },
  { key: 'approved',  label: 'Approved'  },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

const TAB_STATUSES: Record<FilterTab, AppointmentStatus[]> = {
  all:       [],
  submitted: ['submitted', 'additional-info'],
  approved:  ['approved'],
  confirmed: ['confirmed', 'rescheduled'],
  completed: ['completed'],
  cancelled: ['cancelled', 'rejected'],
}

// ─── Appointment card ─────────────────────────────────────────────────────────
function AppointmentCard({
  appt,
  onView,
  onCancel,
  onProvideInfo,
}: {
  appt: AppointmentRecord
  onView: () => void
  onCancel: () => void
  onProvideInfo: () => void
}) {
  const canCancel = ['submitted', 'approved', 'confirmed', 'additional-info'].includes(appt.status)
  const needsInfo = appt.status === 'additional-info'

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div
      className="card"
      style={{
        padding: '1rem',
        transition: 'border-color 0.15s ease',
        cursor: 'pointer',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-emerald)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-sage)')}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '14px', color: 'var(--color-charcoal)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {appt.purpose}
          </p>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
            {appt.id}
          </p>
        </div>
        <StatusBadge status={appt.status} size="md" />
      </div>

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem 1rem', marginBottom: '0.875rem' }}>
        {[
          { icon: <Building2 size={12} />, label: appt.department  },
          { icon: <User      size={12} />, label: appt.authority   },
          { icon: <Calendar  size={12} />, label: formatDate(appt.date) },
          { icon: <Clock     size={12} />, label: appt.time        },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }}>{item.icon}</span>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Type tag */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.875rem' }}>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            padding: '0.15rem 0.5rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-sage)',
            color: 'var(--color-charcoal)',
          }}
        >
          {appt.appointmentType}
        </span>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--color-sage)', marginBottom: '0.75rem' }} />

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          onClick={onView}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px',
            color: 'var(--color-charcoal)',
            backgroundColor: 'var(--color-bg)',
            border: '1px solid var(--color-sage)',
            borderRadius: 'var(--radius-md)',
            padding: '0.3rem 0.75rem',
            cursor: 'pointer',
          }}
          onFocus={e  => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
          onBlur={e   => (e.currentTarget.style.outline = 'none')}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-sage)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-bg)')}
        >
          <Eye size={12} aria-hidden="true" /> View
        </button>

        {needsInfo && (
          <button
            onClick={onProvideInfo}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px',
              color: 'var(--color-emerald)',
              backgroundColor: 'transparent',
              border: '1px solid var(--color-emerald)',
              borderRadius: 'var(--radius-md)',
              padding: '0.3rem 0.75rem',
              cursor: 'pointer',
            }}
            onFocus={e  => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
            onBlur={e   => (e.currentTarget.style.outline = 'none')}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(15,128,107,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Upload size={12} aria-hidden="true" /> Provide information
          </button>
        )}

        {canCancel && (
          <button
            onClick={onCancel}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px',
              color: 'var(--color-danger)',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '0.3rem 0.75rem',
              cursor: 'pointer',
              marginLeft: 'auto',
            }}
            onFocus={e  => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
            onBlur={e   => (e.currentTarget.style.outline = 'none')}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fce8e6')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <XCircle size={12} aria-hidden="true" /> Cancel
          </button>
        )}
      </div>
    </div>
  )
}

// ─── My Appointments page ─────────────────────────────────────────────────────
export default function MyAppointments() {
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState<AppointmentRecord[]>(SEED_APPOINTMENTS)
  const [activeTab, setActiveTab]       = useState<FilterTab>('all')
  const [search, setSearch]             = useState('')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [showFilters, setShowFilters]   = useState(false)
  const [cancelId, setCancelId]         = useState<string | null>(null)
  const [infoId, setInfoId]             = useState<string | null>(null)
  const [infoText, setInfoText]         = useState('')

  // Filter
  const filtered = appointments.filter(appt => {
    const matchesTab =
      activeTab === 'all' || TAB_STATUSES[activeTab].includes(appt.status)
    const matchesSearch =
      !search ||
      appt.id.toLowerCase().includes(search.toLowerCase()) ||
      appt.purpose.toLowerCase().includes(search.toLowerCase()) ||
      appt.authority.toLowerCase().includes(search.toLowerCase()) ||
      appt.department.toLowerCase().includes(search.toLowerCase())
    const matchesFrom = !dateFrom || appt.date >= dateFrom
    const matchesTo   = !dateTo   || appt.date <= dateTo
    return matchesTab && matchesSearch && matchesFrom && matchesTo
  })

  // Tab counts
  const counts: Record<FilterTab, number> = {
    all:       appointments.length,
    submitted: appointments.filter(a => TAB_STATUSES.submitted.includes(a.status)).length,
    approved:  appointments.filter(a => TAB_STATUSES.approved.includes(a.status)).length,
    confirmed: appointments.filter(a => TAB_STATUSES.confirmed.includes(a.status)).length,
    completed: appointments.filter(a => TAB_STATUSES.completed.includes(a.status)).length,
    cancelled: appointments.filter(a => TAB_STATUSES.cancelled.includes(a.status)).length,
  }

  function handleCancel(id: string) {
    setAppointments((prev: AppointmentRecord[]) =>
      prev.map((a: AppointmentRecord) =>
        a.id === id ? { ...a, status: 'cancelled' as const } : a
      )
    )
    setCancelId(null)
  }

  // Requester provides the requested information: additional-info -> submitted,
  // mirroring provideAdditionalInfo() in the service layer.
  function handleProvideInfo(id: string) {
    if (!infoText.trim()) return
    setAppointments((prev: AppointmentRecord[]) =>
      prev.map((a: AppointmentRecord) =>
        a.id === id ? { ...a, status: 'submitted' as const } : a
      )
    )
    setInfoId(null)
    setInfoText('')
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 className="page-title">My appointments</h1>
          <p className="page-subtitle">{appointments.length} total</p>
        </div>
        <button onClick={() => navigate('/book-appointment')} className="btn-primary" style={{ fontSize: '13px' }}>
          <CalendarPlus size={14} aria-hidden="true" />
          New appointment
        </button>
      </div>

      {/* Search + filter toggle */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.875rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
          <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by ID, purpose, authority or department"
            className="input"
            style={{ paddingLeft: '2.25rem', fontSize: '13px' }}
          />
        </div>
        <button
          onClick={() => setShowFilters(p => !p)}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px',
            color: showFilters ? 'var(--color-emerald)' : 'var(--color-text-secondary)',
            backgroundColor: showFilters ? 'rgba(15,128,107,0.06)' : 'var(--color-ivory)',
            border: `1px solid ${showFilters ? 'var(--color-emerald)' : 'var(--color-sage)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '0.5rem 0.75rem',
            cursor: 'pointer',
          }}
          onFocus={e  => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
          onBlur={e   => (e.currentTarget.style.outline = 'none')}
        >
          <SlidersHorizontal size={13} aria-hidden="true" /> Filters
        </button>
      </div>

      {/* Date range */}
      {showFilters && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', padding: '0.875rem', backgroundColor: 'var(--color-ivory)', border: '1px solid var(--color-sage)', borderRadius: 'var(--radius-lg)', marginBottom: '0.875rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" style={{ width: 'auto', fontSize: '13px', padding: '0.375rem 0.5rem' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" style={{ width: 'auto', fontSize: '13px', padding: '0.375rem 0.5rem' }} />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }} style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-danger)', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div
        style={{ display: 'flex', gap: '4px', padding: '4px', backgroundColor: 'var(--color-ivory)', border: '1px solid var(--color-sage)', borderRadius: 'var(--radius-lg)', overflowX: 'auto', marginBottom: '1.25rem' }}
        role="tablist"
        aria-label="Filter appointments"
      >
        {TABS.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px',
              padding: '0.375rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              backgroundColor: activeTab === tab.key ? 'var(--color-forest)' : 'transparent',
              color: activeTab === tab.key ? '#ffffff' : 'var(--color-text-secondary)',
            }}
            onFocus={e  => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
            onBlur={e   => (e.currentTarget.style.outline = 'none')}
          >
            {tab.label}
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: 700,
                padding: '0 5px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: activeTab === tab.key ? 'rgba(255,255,255,0.2)' : 'var(--color-sage)',
                color: activeTab === tab.key ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Result count */}
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        Showing <strong style={{ color: 'var(--color-charcoal)' }}>{filtered.length}</strong> appointment{filtered.length !== 1 ? 's' : ''}
        {search && ` matching "${search}"`}
      </p>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', backgroundColor: 'var(--color-ivory)', border: '1px dashed var(--color-sage)', borderRadius: 'var(--radius-xl)' }}>
          <p style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '16px', color: 'var(--color-charcoal)', marginBottom: '0.5rem' }}>
            No appointments found
          </p>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
            {search ? 'Try a different search or filter.' : 'No appointments have been booked yet.'}
          </p>
          <button onClick={() => navigate('/book-appointment')} className="btn-primary" style={{ fontSize: '13px' }}>
            <CalendarPlus size={13} aria-hidden="true" /> Book now
          </button>
        </div>
      ) : (
        <div
          style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}
        >
          {filtered.map(appt => (
            <AppointmentCard
              key={appt.id}
              appt={appt}
              onView={() => navigate(`/my-appointments/${appt.id}`)}
              onCancel={() => setCancelId(appt.id)}
              onProvideInfo={() => { setInfoId(appt.id); setInfoText('') }}
            />
          ))}
        </div>
      )}

      {/* Cancel confirmation modal */}
      {cancelId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(23,37,34,0.4)' }}
          onClick={() => setCancelId(null)}
        >
          <div className="card" style={{ maxWidth: '380px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '18px', color: 'var(--color-charcoal)', marginBottom: '0.75rem' }}>
              Cancel appointment
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
              Appointment: <strong>{cancelId}</strong>
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
              This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setCancelId(null)} className="btn-secondary" style={{ fontSize: '13px' }}>Keep appointment</button>
              <button onClick={() => handleCancel(cancelId)} className="btn-danger" style={{ fontSize: '13px' }}>Cancel appointment</button>
            </div>
          </div>
        </div>
      )}

      {/* Provide information modal */}
      {infoId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(23,37,34,0.4)' }}
          onClick={() => { setInfoId(null); setInfoText('') }}
        >
          <div className="card" style={{ maxWidth: '440px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '18px', color: 'var(--color-charcoal)', marginBottom: '0.5rem' }}>
              Provide information
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Appointment <strong>{infoId}</strong> needs more detail. Your response sends the request back for review.
            </p>
            <label
              htmlFor="provide-info-field"
              style={{ display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: '14px', color: 'var(--color-charcoal)', marginBottom: '0.3rem' }}
            >
              Your response<span style={{ color: 'var(--color-danger)' }}> *</span>
            </label>
            <textarea
              id="provide-info-field"
              value={infoText}
              onChange={e => setInfoText(e.target.value)}
              rows={4}
              placeholder="Add the requested information or documents detail..."
              className="input"
              style={{ resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={() => { setInfoId(null); setInfoText('') }} className="btn-secondary" style={{ fontSize: '13px' }}>Cancel</button>
              <button
                onClick={() => handleProvideInfo(infoId)}
                className="btn-primary"
                disabled={!infoText.trim()}
                style={{ fontSize: '13px', opacity: !infoText.trim() ? 0.6 : 1, cursor: !infoText.trim() ? 'not-allowed' : 'pointer' }}
              >
                Send response
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
