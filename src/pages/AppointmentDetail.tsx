import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Calendar, Clock, Building2, User,
  FileText, CheckCircle2, XCircle, Video, MapPin, CalendarPlus,
} from 'lucide-react'
import StatusBadge from '../components/common/StatusBadge'
import { SEED_APPOINTMENTS, getStatusTimeline, dtoToRecord, type AppointmentRecord } from '../data/mockAppointments'
import { fetchApproval } from '../services/appointmentsService'
import GoogleMeetCard from '../components/common/GoogleMeetCard'
import { getAppointmentMeetLink } from '../utils/googleMeet'
import { googleCalendarUrl } from '../utils/calendar'

// Under the real backend a single appointment is read from GET /appointments/:id.
const USE_BACKEND = import.meta.env.VITE_DATA_SOURCE === 'supabase'

// ─── Info row helper ──────────────────────────────────────────────────────────
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  if (!value) return null
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        gap: '0.5rem',
        padding: '0.625rem 0',
        borderBottom: '1px solid var(--color-sage)',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
        {icon}
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          {label}
        </span>
      </div>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500, color: 'var(--color-charcoal)' }}>
        {value}
      </span>
    </div>
  )
}

// ─── AppointmentDetail Page ───────────────────────────────────────────────────
export default function AppointmentDetail() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [appointments, setAppointments] = useState<AppointmentRecord[]>(USE_BACKEND ? [] : SEED_APPOINTMENTS)
  const [showCancel, setShowCancel]     = useState(false)
  const [loading, setLoading]           = useState(USE_BACKEND)

  // Under the real backend, load this one appointment by id.
  useEffect(() => {
    if (!USE_BACKEND || !id) return
    let active = true
    setLoading(true)
    fetchApproval(id)
      .then(dto => { if (active) setAppointments([dtoToRecord(dto)]) })
      .catch(() => { if (active) setAppointments([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id])

  const appt = appointments.find((a: AppointmentRecord) => a.id === id)

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
        <p className="page-subtitle">Loading appointment…</p>
      </div>
    )
  }

  if (!appt) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
        <h2 className="page-title" style={{ marginBottom: '0.75rem' }}>Appointment not found</h2>
        <p className="page-subtitle" style={{ marginBottom: '1.5rem' }}>
          No appointment found with ID: <strong>{id}</strong>
        </p>
        <button onClick={() => navigate('/my-appointments')} className="btn-primary">
          Back to my appointments
        </button>
      </div>
    )
  }

  const timeline   = getStatusTimeline(appt.status, appt.createdAt)
  const canCancel  = ['submitted', 'approved', 'confirmed'].includes(appt.status)

  function handleCancel() {
    setAppointments((prev: AppointmentRecord[]) =>
      prev.map((a: AppointmentRecord) =>
        a.id === id ? { ...a, status: 'cancelled' as const } : a
      )
    )
    setShowCancel(false)
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <button
          onClick={() => navigate('/my-appointments')}
          style={{
            padding: '0.5rem',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            backgroundColor: 'transparent',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-sage)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          onFocus={e  => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
          onBlur={e   => (e.currentTarget.style.outline = 'none')}
          aria-label="Back to my appointments"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title">{appt.purpose}</h1>
          <p className="page-subtitle">{appt.id}</p>
        </div>
        <StatusBadge status={appt.status} size="md" />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '1.25rem',
        }}
        className="detail-grid"
      >
        {/* ── Left: Details ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} className="detail-left">

          {/* Authority card */}
          <div className="card">
            <h3
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                
                marginBottom: '0.875rem',
              }}
            >
              Authority
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {/* Sage/charcoal avatar */}
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-sage)',
                  color: 'var(--color-charcoal)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
                aria-hidden="true"
              >
                {appt.authorityInitials}
              </div>
              <div>
                <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '14px', color: 'var(--color-charcoal)', margin: 0 }}>
                  {appt.authority}
                </p>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
                  {appt.department}
                </p>
              </div>
            </div>
          </div>

          {/* Appointment info */}
          <div className="card">
            <h3
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                
                marginBottom: '0.25rem',
              }}
            >
              Appointment information
            </h3>
            <InfoRow icon={<FileText  size={13} />} label="Type"       value={appt.appointmentType} />
            <InfoRow icon={<Calendar  size={13} />} label="Date"       value={formatDate(appt.date)} />
            <InfoRow icon={<Clock     size={13} />} label="Time"       value={appt.time} />
            <InfoRow icon={<Video     size={13} />} label="Method"     value={appt.mode ? (appt.mode === 'online' ? 'Online' : 'Offline / In-Person') : 'Offline / In-Person'} />
            {appt.mode !== 'online' && appt.locationLabel && (
              <InfoRow icon={<MapPin   size={13} />} label="Location"   value={appt.locationLabel} />
            )}
            <InfoRow icon={<Building2 size={13} />} label="Department" value={appt.department} />
            <InfoRow icon={<User      size={13} />} label="Requested by" value={appt.requester} />
            <InfoRow icon={<FileText  size={13} />} label="Purpose"    value={appt.purpose} />

            {appt.mode === 'online' && (
              <GoogleMeetCard
                appointmentId={appt.id}
                meetUrl={getAppointmentMeetLink(appt) || ''}
                date={appt.date ? formatDate(appt.date) : undefined}
                time={appt.time || undefined}
                rawDate={appt.date}
                rawTime={appt.time}
                subject={appt.purpose}
                authorityName={appt.authority}
                department={appt.department}
                requesterName={appt.requester}
                status={appt.status}
                showCalendarButton={['approved', 'confirmed'].includes(appt.status)}
              />
            )}

            {appt.mode !== 'online' && ['approved', 'confirmed'].includes(appt.status) && appt.date && appt.time && (() => {
              const url = googleCalendarUrl({
                title: `Appointment: ${appt.purpose}`,
                date: appt.date,
                time: appt.time,
                details: `With ${appt.authority}. Department: ${appt.department}.`,
                location: appt.locationLabel || undefined,
              })
              if (!url) return null
              return (
                <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-sage)' }}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      textDecoration: 'none',
                      fontSize: '13px',
                      padding: '0.5rem 0.875rem',
                    }}
                  >
                    <CalendarPlus size={14} aria-hidden="true" />
                    Add to Google Calendar
                  </a>
                </div>
              )
            })()}
          </div>

          {/* Actions */}
          {canCancel && (
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowCancel(true)}
                className="btn-danger"
                style={{ fontSize: '13px', padding: '0.4rem 1rem' }}
              >
                <XCircle size={13} aria-hidden="true" />
                Cancel appointment
              </button>
            </div>
          )}
        </div>

        {/* ── Right: Status Timeline ── */}
        <div className="card detail-right" style={{ height: 'fit-content' }}>
          <h3
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              
              marginBottom: '1.25rem',
            }}
          >
            Status timeline
          </h3>

          <div style={{ position: 'relative' }}>
            {/* Vertical connector line */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '13px',
                top: '14px',
                bottom: '14px',
                width: '2px',
                backgroundColor: 'var(--color-sage)',
                transform: 'translateX(-50%)',
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {timeline.map((step, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', position: 'relative' }}>
                  {/* Step circle */}
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      backgroundColor: step.done
                        ? 'var(--color-emerald)'
                        : step.active
                        ? 'var(--color-amber)'
                        : 'var(--color-sage)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      zIndex: 1,
                      position: 'relative',
                    }}
                  >
                    {step.done ? (
                      <CheckCircle2 size={13} color="#fff" aria-hidden="true" />
                    ) : step.active ? (
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#fff' }} aria-hidden="true" />
                    ) : (
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-text-secondary)' }} aria-hidden="true" />
                    )}
                  </div>

                  {/* Step content */}
                  <div style={{ flex: 1, paddingBottom: '0.25rem' }}>
                    <p
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: step.done
                          ? 'var(--color-charcoal)'
                          : step.active
                          ? 'var(--color-amber)'
                          : 'var(--color-text-secondary)',
                        margin: 0,
                      }}
                    >
                      {step.label}
                    </p>
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
                      {step.description}
                    </p>
                    {step.timestamp && (
                      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
                        {step.timestamp}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel modal */}
      {showCancel && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(23,37,34,0.4)' }}
          onClick={() => setShowCancel(false)}
        >
          <div
            className="card"
            style={{ maxWidth: '400px', width: '100%' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '18px', color: 'var(--color-charcoal)', marginBottom: '0.75rem' }}>
              Cancel appointment
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
              This cannot be undone. The authority will be notified.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCancel(false)} className="btn-secondary" style={{ fontSize: '13px' }}>
                Keep appointment
              </button>
              <button onClick={handleCancel} className="btn-danger" style={{ fontSize: '13px' }}>
                Cancel appointment
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (min-width: 1024px) {
          .detail-grid { grid-template-columns: 1fr 380px !important; }
        }
      `}</style>
    </div>
  )
}
