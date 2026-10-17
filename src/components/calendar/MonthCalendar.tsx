import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ApprovalRecord } from '../../data/approvalData'
import type { AppointmentStatus } from '../../data/mockAppointments'
import { localISODate } from '../../data/mockAppointments'
import type { Availability } from '../../data/availabilityData'
import { isWorkingDay } from '../../data/availabilityData'

interface MonthCalendarProps {
  viewDate:     Date                 // any date within the month to show
  selectedDate: string               // ISO yyyy-mm-dd
  appointments: ApprovalRecord[]     // records within the visible month
  availability?: Availability        // optional, to shade non-working days
  onSelectDate: (isoDate: string) => void
  onPrevMonth:  () => void
  onNextMonth:  () => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
] as const

// Dot color per status family (same families as STATUS_CONFIG).
function dotColor(status: AppointmentStatus): string {
  switch (status) {
    case 'approved':
    case 'confirmed':
    case 'completed':
      return 'var(--color-emerald)'
    case 'submitted':
    case 'additional-info':
      return 'var(--color-amber)'
    case 'rescheduled':
      return 'var(--color-info)'
    case 'rejected':
    case 'not-reported':
      return 'var(--color-danger)'
    default:
      return 'var(--color-text-secondary)'   // cancelled / draft
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// ─── MonthCalendar ────────────────────────────────────────────────────────────
export default function MonthCalendar({
  viewDate,
  selectedDate,
  appointments,
  availability,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: MonthCalendarProps) {
  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const todayISO = localISODate()

  const daysInMonth     = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()
  const firstOffset     = (new Date(year, month, 1).getDay() + 6) % 7  // Mon-based

  // Group appointments by ISO date -> ordered set of status colors (max 3 dots).
  const byDate = new Map<string, AppointmentStatus[]>()
  for (const a of appointments) {
    const list = byDate.get(a.date) ?? []
    list.push(a.status)
    byDate.set(a.date, list)
  }

  const cells: { iso: string | null; day: number; thisMonth: boolean }[] = []
  for (let i = firstOffset - 1; i >= 0; i--) {
    cells.push({ iso: null, day: daysInPrevMonth - i, thisMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: `${year}-${pad(month + 1)}-${pad(d)}`, day: d, thisMonth: true })
  }
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    cells.push({ iso: null, day: d, thisMonth: false })
  }

  const focusRing = (e: React.FocusEvent<HTMLElement>) =>
    (e.currentTarget.style.outline = '2px solid var(--color-emerald)')
  const blurRing = (e: React.FocusEvent<HTMLElement>) =>
    (e.currentTarget.style.outline = 'none')

  return (
    <div className="card" style={{ padding: '1rem' }}>
      {/* Month navigator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <button
          onClick={onPrevMonth}
          aria-label="Previous month"
          style={navBtn}
          onFocus={focusRing}
          onBlur={blurRing}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-sage)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '15px',
          color: 'var(--color-charcoal)', margin: 0 }}>
          {MONTHS[month]} {year}
        </p>
        <button
          onClick={onNextMonth}
          aria-label="Next month"
          style={navBtn}
          onFocus={focusRing}
          onBlur={blurRing}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-sage)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {WEEKDAYS.map(d => (
          <div key={d} style={{ height: '36px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontFamily: 'var(--font-sans)', fontSize: '12px',
            fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            {d}
          </div>
        ))}

        {cells.map((cell, i) => {
          const isToday    = cell.thisMonth && cell.iso === todayISO
          const isSelected = cell.thisMonth && cell.iso === selectedDate
          const statuses   = cell.iso ? (byDate.get(cell.iso) ?? []) : []
          const nonWorking = cell.thisMonth && cell.iso && availability
            ? !isWorkingDay(availability, cell.iso)
            : false

          // Up to 3 distinct status dots.
          const dots = Array.from(new Set(statuses)).slice(0, 3)

          return (
            <button
              key={`${cell.thisMonth ? 'cur' : 'adj'}-${i}`}
              onClick={() => { if (cell.thisMonth && cell.iso) onSelectDate(cell.iso) }}
              disabled={!cell.thisMonth}
              aria-label={cell.thisMonth && cell.iso
                ? `${cell.day} ${MONTHS[month]} ${year}${isToday ? ', today' : ''}${statuses.length ? `, ${statuses.length} appointment${statuses.length > 1 ? 's' : ''}` : ''}`
                : undefined}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              style={{
                height: '52px',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: '3px',
                border: 'none', padding: 0,
                cursor: cell.thisMonth ? 'pointer' : 'default',
                backgroundColor: nonWorking && !isSelected ? 'var(--color-bg)' : 'transparent',
                borderRadius: 'var(--radius-md)',
              }}
              onFocus={cell.thisMonth ? focusRing : undefined}
              onBlur={cell.thisMonth ? blurRing : undefined}
              onMouseEnter={e => { if (cell.thisMonth && !isToday && !isSelected) e.currentTarget.style.backgroundColor = 'var(--color-sage)' }}
              onMouseLeave={e => { if (!isToday && !isSelected) e.currentTarget.style.backgroundColor = nonWorking ? 'var(--color-bg)' : 'transparent' }}
            >
              <span style={{
                width: '28px', height: '28px', display: 'flex', alignItems: 'center',
                justifyContent: 'center',
                borderRadius: isToday ? '50%' : 'var(--radius-sm)',
                backgroundColor: isToday ? 'var(--color-forest)' : isSelected ? 'var(--color-sage)' : 'transparent',
                fontFamily: 'var(--font-sans)', fontSize: '13px',
                fontWeight: isToday || isSelected ? 700 : 400,
                color: isToday ? '#ffffff' : cell.thisMonth ? 'var(--color-charcoal)' : 'var(--color-text-secondary)',
                lineHeight: 1,
              }}>
                {cell.day}
              </span>
              <span style={{ display: 'flex', gap: '3px', height: '5px', alignItems: 'center' }}>
                {dots.map((s, di) => (
                  <span key={di} aria-hidden="true" style={{
                    width: '5px', height: '5px', borderRadius: '50%',
                    backgroundColor: dotColor(s), display: 'block', flexShrink: 0,
                  }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.875rem', marginTop: '0.75rem',
        paddingTop: '0.75rem', borderTop: '1px solid var(--color-sage)' }}>
        {[
          { label: 'Approved or confirmed', color: 'var(--color-emerald)' },
          { label: 'Awaiting review',       color: 'var(--color-amber)'   },
          { label: 'Rescheduled',           color: 'var(--color-info)'    },
          { label: 'Rejected or not reported', color: 'var(--color-danger)' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%',
              backgroundColor: item.color, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: '44px', height: '44px', display: 'flex', alignItems: 'center',
  justifyContent: 'center', borderRadius: 'var(--radius-md)', border: 'none',
  backgroundColor: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer',
}
