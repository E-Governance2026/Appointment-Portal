import { Clock, User, Building2, Video, Phone, MapPin } from 'lucide-react'
import StatusChip from '../common/StatusChip'
import type { ApprovalRecord } from '../../data/approvalData'
import type { Availability } from '../../data/availabilityData'
import { isWorkingDay } from '../../data/availabilityData'

interface DayScheduleProps {
  date:         string                // ISO yyyy-mm-dd
  appointments: ApprovalRecord[]
  availability?: Availability
  isLoading?:   boolean
  onSelectAppointment?: (id: string) => void
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suf = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suf}`
}

function ModeIcon({ mode }: { mode: ApprovalRecord['mode'] }) {
  const common = { size: 13, 'aria-hidden': true } as const
  if (mode === 'online') return <Video {...common} />
  if (mode === 'phone')  return <Phone {...common} />
  return <MapPin {...common} />
}

// ─── DaySchedule ──────────────────────────────────────────────────────────────
export default function DaySchedule({
  date,
  appointments,
  availability,
  isLoading,
  onSelectAppointment,
}: DayScheduleProps) {
  const heading = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const working = availability ? isWorkingDay(availability, date) : true
  const windowLabel = (() => {
    if (!availability) return ''
    const weekday = new Date(date + 'T00:00:00').getDay()
    const wh = availability.workingHours.find(w => w.weekday === weekday)
    if (!wh || !wh.enabled) return ''
    return `${fmtTime(wh.start)} to ${fmtTime(wh.end)}`
  })()

  return (
    <aside className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}
      aria-label="Day schedule">
      {/* Header */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-sage)' }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '16px',
          color: 'var(--color-charcoal)', margin: '0 0 2px 0' }}>
          {heading}
        </p>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>
          {!working
            ? 'Non-working day'
            : `${appointments.length} appointment${appointments.length !== 1 ? 's' : ''}${windowLabel ? ` · ${windowLabel}` : ''}`}
        </p>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
        {isLoading ? (
          <p style={muted}>Loading schedule...</p>
        ) : !working ? (
          <p style={muted}>This day is marked as a holiday or outside working hours. No appointments are scheduled.</p>
        ) : appointments.length === 0 ? (
          <p style={muted}>No appointments scheduled for this day.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {appointments.map(a => {
              const clickable = !!onSelectAppointment
              return (
                <div
                  key={a.id}
                  onClick={() => onSelectAppointment?.(a.id)}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectAppointment?.(a.id) } } : undefined}
                  style={{
                    display: 'flex', gap: '12px', alignItems: 'flex-start',
                    padding: '12px', border: '1px solid var(--color-sage)',
                    borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-ivory)',
                    cursor: clickable ? 'pointer' : 'default',
                  }}
                  onMouseEnter={e => { if (clickable) e.currentTarget.style.borderColor = 'var(--color-emerald)' }}
                  onMouseLeave={e => { if (clickable) e.currentTarget.style.borderColor = 'var(--color-sage)' }}
                  onFocus={e => { if (clickable) e.currentTarget.style.outline = '2px solid var(--color-emerald)' }}
                  onBlur={e => { if (clickable) e.currentTarget.style.outline = 'none' }}
                >
                  {/* Time column */}
                  <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '66px' }}>
                    <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '13px',
                      color: 'var(--color-charcoal)', margin: 0, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                      <Clock size={12} aria-hidden="true" /> {fmtTime(a.time)}
                    </p>
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '14px',
                        color: 'var(--color-charcoal)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.subject}
                      </p>
                      <StatusChip status={a.status} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: '6px' }}>
                      <span style={meta}><User size={12} aria-hidden="true" /> {a.requester}</span>
                      <span style={meta}><Building2 size={12} aria-hidden="true" /> {a.authorityName}</span>
                      <span style={meta}><ModeIcon mode={a.mode} /> {a.mode.charAt(0).toUpperCase() + a.mode.slice(1)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}

const muted: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0,
}
const meta: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '4px',
  fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-secondary)',
}
