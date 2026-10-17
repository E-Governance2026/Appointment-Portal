import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowLeft, CheckCircle2, Calendar, Clock, Building2, User } from 'lucide-react'
import StatusBadge from '../components/common/StatusBadge'
import Logo from '../components/ui/Logo'
import { SEED_APPOINTMENTS, getStatusTimeline, type AppointmentRecord } from '../data/mockAppointments'

// ─── TrackAppointment Page ────────────────────────────────────────────────────
export default function TrackAppointment() {
  const navigate = useNavigate()
  const [inputId, setInputId] = useState('')
  const [searched, setSearched] = useState(false)
  const [result, setResult] = useState<AppointmentRecord | null>(null)

  function handleSearch() {
    if (!inputId.trim()) return
    const found = SEED_APPOINTMENTS.find(
      (a: AppointmentRecord) => a.id.toLowerCase() === inputId.trim().toLowerCase()
    )
    setResult(found ?? null)
    setSearched(true)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch()
  }

  const timeline = result ? getStatusTimeline(result.status, result.createdAt) : []

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      {/* Topbar */}
      <nav
        className="sticky top-0 z-50 border-b px-6 h-14 flex items-center justify-between"
        style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <Logo size="sm" variant="light" />
        <button
          onClick={() => navigate('/login')}
          className="btn-primary text-xs py-1.5 px-3"
        >
          Login
        </button>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Back */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-xs mb-6 transition-colors"
          style={{ color: 'var(--color-text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
        >
          <ArrowLeft size={14} /> Back to Home
        </button>

        {/* Search card */}
        <div className="card mb-5">
          <div className="text-center mb-5">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
              style={{ backgroundColor: 'rgba(7,59,53,0.08)' }}
            >
              <Search size={22} style={{ color: 'var(--color-primary)' }} />
            </div>
            <h2 className="font-bold text-lg mb-1" style={{ color: 'var(--color-text)' }}>
              Track Your Appointment
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Enter your Appointment ID to check the current status and updates.
            </p>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--color-text-muted)' }}
              />
              <input
                type="text"
                value={inputId}
                onChange={e => { setInputId(e.target.value); setSearched(false) }}
                onKeyDown={handleKeyDown}
                placeholder="e.g. APT-2026-100067"
                className="input pl-8"
              />
            </div>
            <button
              onClick={handleSearch}
              className="btn-primary px-5 text-xs"
              disabled={!inputId.trim()}
              style={{ opacity: !inputId.trim() ? 0.6 : 1 }}
            >
              Track
            </button>
          </div>

          {/* Quick fill hints */}
          <div className="mt-3 flex flex-wrap gap-2">
            <p className="text-xs w-full" style={{ color: 'var(--color-text-muted)' }}>
              Try these IDs:
            </p>
            {SEED_APPOINTMENTS.slice(0, 4).map((a: AppointmentRecord) => (
              <button
                key={a.id}
                onClick={() => { setInputId(a.id); setSearched(false) }}
                className="text-xs px-2 py-1 rounded-lg transition-colors"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-secondary)',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
              >
                {a.id}
              </button>
            ))}
          </div>
        </div>

        {/* Result */}
        {searched && !result && (
          <div className="card text-center py-8">
            <p className="font-semibold text-sm mb-1" style={{ color: 'var(--color-text)' }}>
              Appointment not found
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              No appointment found for ID: <strong>{inputId}</strong>.
              Please check the ID and try again.
            </p>
          </div>
        )}

        {searched && result && (
          <div className="space-y-4">
            {/* Status hero card — flat forest, no gradient */}
            <div
              style={{
                backgroundColor: 'var(--color-forest)',
                borderRadius: 'var(--radius-xl)',
                padding: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div>
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', margin: '0 0 4px 0' }}>
                    Appointment ID
                  </p>
                  <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '16px', color: '#ffffff', letterSpacing: '0.03em', margin: 0 }}>
                    {result.id}
                  </p>
                </div>
                <StatusBadge status={result.status} size="md" />
              </div>
              <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '15px', color: '#ffffff', margin: '0 0 2px 0' }}>
                {result.purpose}
              </p>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'rgba(255,255,255,0.7)', margin: 0 }}>
                {result.appointmentType}
              </p>
            </div>

            {/* Summary info */}
            <div className="card">
              <h3 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--color-text-muted)' }}>
                Details
              </h3>
              <div className="space-y-2">
                {[
                  { icon: <Building2 size={13} />, label: 'Department', value: result.department    },
                  { icon: <User      size={13} />, label: 'Authority',  value: result.authority     },
                  { icon: <Calendar  size={13} />, label: 'Date',       value: formatDate(result.date) },
                  { icon: <Clock     size={13} />, label: 'Time',       value: result.time          },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-2.5">
                    <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>{row.icon}</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)', width: '80px', flexShrink: 0 }}>
                      {row.label}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div className="card">
              <h3 className="text-xs font-bold uppercase tracking-wide mb-4" style={{ color: 'var(--color-text-muted)' }}>
                Status Timeline
              </h3>
              <div className="relative">
                <div
                  className="absolute left-3.5 top-4 bottom-4 w-0.5 -translate-x-1/2"
                  style={{ backgroundColor: 'var(--color-border)' }}
                />
                <div className="space-y-5">
                  {timeline.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-3 relative">
                      <div
                        className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 z-10"
                        style={{
                          backgroundColor: step.done
                            ? 'var(--color-secondary)'
                            : step.active
                            ? 'var(--color-warning)'
                            : 'var(--color-border)',
                        }}
                      >
                        {step.done ? (
                          <CheckCircle2 size={14} color="#fff" />
                        ) : step.active ? (
                          <div className="w-2.5 h-2.5 rounded bg-white animate-pulse" />
                        ) : (
                          <div className="w-2 h-2 rounded" style={{ backgroundColor: 'var(--color-text-muted)' }} />
                        )}
                      </div>
                      <div className="flex-1">
                        <p
                          className="text-xs font-semibold"
                          style={{
                            color: step.done ? 'var(--color-text)' : step.active ? 'var(--color-warning)' : 'var(--color-text-muted)',
                          }}
                        >
                          {step.label}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          {step.description}
                        </p>
                        {step.timestamp && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)', fontSize: '0.62rem' }}>
                            {step.timestamp}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Login CTA */}
            <div
              className="p-4 rounded-xl text-center"
              style={{ backgroundColor: 'rgba(7,59,53,0.05)', border: '1px solid rgba(7,59,53,0.1)' }}
            >
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                Login to manage your appointment, cancel, or submit feedback.
              </p>
              <button onClick={() => navigate('/login')} className="btn-primary text-xs py-2 px-5">
                Login to your account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
