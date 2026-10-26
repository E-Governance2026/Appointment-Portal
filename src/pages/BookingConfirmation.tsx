import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, RefreshCw } from 'lucide-react'
import { fetchSubmittedAppointment } from '../data/bookingApi'
import { useBookingStore } from '../store/bookingStore'
import StatusChip from '../components/common/StatusChip'

// ─── Row helper ───────────────────────────────────────────────────────────────
function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:'8px',
      paddingBottom:'10px', marginBottom:'10px', borderBottom:'1px solid var(--color-sage)' }}>
      <span style={{ fontFamily:'var(--font-sans)', fontSize:'13px', color:'var(--color-text-secondary)' }}>
        {label}
      </span>
      <span style={{ fontFamily:'var(--font-sans)', fontSize:'14px', color:'var(--color-charcoal)', fontWeight:500 }}>
        {value}
      </span>
    </div>
  )
}

// ─── Format time ──────────────────────────────────────────────────────────────
function fmt(hhmm: string): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const suf = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2,'0')} ${suf}`
}

// ─── BookingConfirmation ──────────────────────────────────────────────────────
// Route: /book/confirmation/:id
// Spec: page persists across refresh (loads from API on mount).
// Never uses "confirmed" or "booked" as nouns on this page.

export default function BookingConfirmation() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const reset    = useBookingStore(s => s.reset)

  const { data: record, isLoading, isError, refetch } = useQuery({
    queryKey: ['booking-confirmation', id],
    queryFn:  () => fetchSubmittedAppointment(id!),
    enabled:  !!id,
    // Keep data across re-mounts so refreshing works
    staleTime: Infinity,
  })

  if (isLoading) {
    return (
      <div style={{ display:'flex', justifyContent:'center', paddingTop:'4rem' }}>
        <p style={{ fontFamily:'var(--font-sans)', fontSize:'14px', color:'var(--color-text-secondary)' }}>
          Loading your appointment...
        </p>
      </div>
    )
  }

  if (isError || !record) {
    return (
      <div style={{ textAlign:'center', paddingTop:'4rem' }}>
        <p style={{ fontFamily:'var(--font-sans)', fontSize:'14px', color:'var(--color-danger)', marginBottom:'1rem' }}>
          Could not load the appointment record.
        </p>
        <button type="button" className="btn-secondary"
          onClick={() => refetch()}
          style={{ display:'inline-flex', alignItems:'center', gap:'6px' }}>
          <RefreshCw size={14} aria-hidden="true" /> Retry
        </button>
      </div>
    )
  }

  const dateDisplay = record.date
    ? new Date(record.date + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday:'long', day:'numeric', month:'long', year:'numeric',
      })
    : ''

  const submittedAt = record.submittedAt
    ? new Date(record.submittedAt).toLocaleString('en-IN', {
        day:'numeric', month:'short', year:'numeric',
        hour:'2-digit', minute:'2-digit',
      })
    : ''

  return (
    <div style={{ maxWidth:'640px', margin:'0 auto' }}>

      {/* Success header */}
      <div style={{ textAlign:'center', marginBottom:'2rem' }}>
        <div style={{ width:'64px', height:'64px', borderRadius:'50%',
          backgroundColor:'rgba(15,128,107,0.1)', display:'flex',
          alignItems:'center', justifyContent:'center', margin:'0 auto 1rem' }}>
          <CheckCircle2 size={32} style={{ color:'var(--color-emerald)' }} aria-hidden="true" />
        </div>

        <h1 style={{ fontFamily:'var(--font-serif)', fontWeight:600, fontSize:'26px',
          color:'var(--color-charcoal)', margin:'0 0 0.5rem 0' }}>
          Request submitted
        </h1>

        <p style={{ fontFamily:'var(--font-sans)', fontSize:'15px',
          color:'var(--color-text-secondary)', margin:0, lineHeight:1.6 }}>
          Your appointment ID is below.
        </p>
      </div>

      {/* Appointment ID card */}
      <div style={{ backgroundColor:'var(--color-forest)', borderRadius:'12px',
        padding:'1.5rem', textAlign:'center', marginBottom:'1.5rem' }}>
        <p style={{ fontFamily:'var(--font-sans)', fontSize:'13px',
          color:'rgba(255,255,255,0.65)', margin:'0 0 6px 0' }}>
          Appointment ID
        </p>
        <p style={{ fontFamily:'var(--font-serif)', fontWeight:600, fontSize:'28px',
          letterSpacing:'0.05em', color:'#ffffff', margin:0 }}>
          {record.id}
        </p>
      </div>

      {/* Summary card */}
      <div className="card" style={{ marginBottom:'1.5rem' }}>

        {/* Status */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          marginBottom:'1.25rem', paddingBottom:'1rem', borderBottom:'1px solid var(--color-sage)' }}>
          <p style={{ fontFamily:'var(--font-sans)', fontSize:'13px',
            color:'var(--color-text-secondary)', margin:0 }}>
            Status
          </p>
          <StatusChip status="submitted" size="md" />
        </div>

        <Row label="Purpose"       value={record.purposeLabel}   />
        <Row label="Department"    value={record.department}      />
        <Row label="Authority"     value={record.authorityName}   />
        {record.date && record.time ? (
          <>
            <Row label="Requested date" value={dateDisplay}      />
            <Row label="Requested time" value={fmt(record.time)} />
          </>
        ) : (
          <Row label="Schedule" value="To be proposed by the authority" />
        )}
        <Row label="Meeting mode"   value={record.mode.charAt(0).toUpperCase() + record.mode.slice(1)} />
        {record.mode === 'physical' && <Row label="Location" value={record.locationLabel} />}
        <Row label="Subject"        value={record.subject}       />

        {/* Submitted at — last row, no border */}
        <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:'8px' }}>
          <span style={{ fontFamily:'var(--font-sans)', fontSize:'13px', color:'var(--color-text-secondary)' }}>
            Submitted
          </span>
          <span style={{ fontFamily:'var(--font-sans)', fontSize:'14px', color:'var(--color-charcoal)', fontWeight:500 }}>
            {submittedAt}
          </span>
        </div>
      </div>

      {/* Next-step message */}
      <div style={{ padding:'14px 16px', backgroundColor:'rgba(31,95,166,0.07)',
        border:'1px solid rgba(31,95,166,0.15)', borderRadius:'8px', marginBottom:'1.5rem' }}>
        <p style={{ fontFamily:'var(--font-sans)', fontSize:'14px', color:'var(--color-charcoal)',
          margin:0, lineHeight:1.6 }}>
          Your request is waiting for approval from {record.authorityName}. You will be
          notified in the app when the status changes.
        </p>
        {record.mode === 'online' && (
          <p style={{ fontFamily:'var(--font-sans)', fontSize:'13px', color:'#166534',
            margin:'6px 0 0 0', fontWeight: 500 }}>
            📹 Online consultation: Your Google Meet link will be automatically generated and linked to your selected time slot once approved.
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'12px', alignItems:'center', justifyContent:'center' }}>
        <button type="button" className="btn-primary"
          onClick={() => navigate(`/my-appointments/${record.id}`)}>
          View appointment
        </button>

        <button type="button" className="btn-secondary"
          onClick={() => { reset(); navigate('/book') }}>
          Book another appointment
        </button>

        <button type="button"
          onClick={() => navigate('/dashboard')}
          style={{ fontFamily:'var(--font-sans)', fontWeight:600, fontSize:'14px',
            color:'var(--color-forest)', background:'none', border:'none', cursor:'pointer',
            padding:'0.5rem' }}
          onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
          onBlur={e  => (e.currentTarget.style.outline = 'none')}>
          Back to dashboard
        </button>
      </div>
    </div>
  )
}
