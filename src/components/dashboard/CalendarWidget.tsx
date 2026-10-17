import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAllAppointments } from '../../hooks/useDashboard'
import { localISODate, type AppointmentStatus } from '../../data/mockAppointments'
import { SEED_HOLIDAY_SET } from '../../data/mockAppointments'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'] as const

type MarkType = 'confirmed' | 'pending' | 'holiday'
const DOT: Record<MarkType, string> = {
  confirmed: 'var(--color-emerald)',
  pending:   'var(--color-amber)',
  holiday:   'var(--color-danger)',
}

function markFor(status: AppointmentStatus): MarkType | null {
  if (status === 'confirmed' || status === 'approved' || status === 'completed') return 'confirmed'
  if (status === 'submitted' || status === 'additional-info') return 'pending'
  return null
}
function pad2(n: number) { return String(n).padStart(2, '0') }

interface CalendarWidgetProps {
  selectedDate: string                  // ISO yyyy-mm-dd
  onSelectDate: (iso: string) => void
}

type ViewMode = 'Day' | 'Week' | 'Month'

export default function CalendarWidget({ selectedDate, onSelectDate }: CalendarWidgetProps) {
  const today = new Date()
  const todayISO = localISODate(today)
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [viewMode, setViewMode] = useState<ViewMode>('Month')

  const { data: appointments = [] } = useAllAppointments()

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  // Marks for the visible month: date -> set of mark types, plus counts for aria.
  const marksByDay = useMemo(() => {
    const map = new Map<string, { types: Set<MarkType>; count: number }>()
    for (const a of appointments) {
      const d = new Date(a.date + 'T00:00:00')
      if (d.getFullYear() !== year || d.getMonth() !== month) continue
      const key = a.date
      const t = markFor(a.status)
      const entry = map.get(key) ?? { types: new Set<MarkType>(), count: 0 }
      if (t) entry.types.add(t)
      entry.count++
      map.set(key, entry)
    }
    // Holidays for the visible month.
    for (const iso of SEED_HOLIDAY_SET) {
      const d = new Date(iso + 'T00:00:00')
      if (d.getFullYear() === year && d.getMonth() === month) {
        const entry = map.get(iso) ?? { types: new Set<MarkType>(), count: 0 }
        entry.types.add('holiday')
        map.set(iso, entry)
      }
    }
    return map
  }, [appointments, year, month])

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()
  const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7  // Monday-based

  const cells: { iso: string | null; day: number; cur: boolean }[] = []
  for (let i = firstOffset - 1; i >= 0; i--) cells.push({ iso: null, day: daysInPrev - i, cur: false })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ iso: `${year}-${pad2(month + 1)}-${pad2(d)}`, day: d, cur: true })
  while (cells.length < 42) cells.push({ iso: null, day: cells.length - (firstOffset + daysInMonth) + 1, cur: false })

  function moveSelection(deltaDays: number) {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() + deltaDays)
    const iso = localISODate(d)
    // Keep the visible month in sync.
    if (d.getFullYear() !== year || d.getMonth() !== month) setViewDate(new Date(d.getFullYear(), d.getMonth(), 1))
    onSelectDate(iso)
  }

  const focusRing = (e: React.FocusEvent<HTMLElement>) => (e.currentTarget.style.outline = '')
  const navBtn: React.CSSProperties = {
    width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 'var(--radius-md)', border: 'none', backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)', cursor: 'pointer',
  }

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      {/* Header + segmented control */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 'var(--text-lg)', color: 'var(--color-charcoal)', margin: 0 }}>
          Calendar
        </h2>
        <div role="group" aria-label="Calendar view" style={{ display: 'flex', gap: '4px', padding: '3px',
          border: '1px solid var(--color-sage)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--color-bg)' }}>
          {(['Day', 'Week', 'Month'] as ViewMode[]).map(m => {
            const active = viewMode === m
            return (
              <button key={m} onClick={() => setViewMode(m)} aria-pressed={active}
                style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 600,
                  padding: '4px 10px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer',
                  backgroundColor: active ? 'var(--color-forest)' : 'transparent',
                  color: active ? '#ffffff' : 'var(--color-text-secondary)',
                  transition: 'background-color var(--motion-fast) var(--ease-out)' }}>
                {m}
              </button>
            )
          })}
        </div>
      </div>

      {/* Month navigator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="Previous month" style={navBtn}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-sage)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-charcoal)', margin: 0 }}>
          {MONTHS[month]} {year}
        </p>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="Next month" style={navBtn}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-sage)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      {/* 7-column grid */}
      <div role="grid" aria-label={`${MONTHS[month]} ${year}`}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}
        onKeyDown={e => {
          if (e.key === 'ArrowRight') { e.preventDefault(); moveSelection(1) }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); moveSelection(-1) }
          else if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(7) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-7) }
        }}>
        {WEEKDAYS.map(d => (
          <div key={d} role="columnheader" style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            {d}
          </div>
        ))}

        {cells.map((cell, i) => {
          const isToday = cell.cur && cell.iso === todayISO
          const isSelected = cell.cur && cell.iso === selectedDate
          const entry = cell.iso ? marksByDay.get(cell.iso) : undefined
          const dots = entry ? Array.from(entry.types).slice(0, 3) : []
          const dateObj = cell.iso ? new Date(cell.iso + 'T00:00:00') : null
          const ariaLabel = dateObj
            ? `${dateObj.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${entry?.count ? `, ${entry.count} appointment${entry.count > 1 ? 's' : ''}` : ''}`
            : undefined

          return (
            <button
              key={i}
              role="gridcell"
              onClick={() => { if (cell.cur && cell.iso) onSelectDate(cell.iso) }}
              disabled={!cell.cur}
              tabIndex={isSelected ? 0 : -1}
              aria-label={ariaLabel}
              aria-selected={isSelected}
              aria-current={isToday ? 'date' : undefined}
              style={{ height: '44px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '3px', border: 'none', padding: 0, cursor: cell.cur ? 'pointer' : 'default', backgroundColor: 'transparent',
                borderRadius: 'var(--radius-md)' }}
              onFocus={focusRing}
              onMouseEnter={e => { if (cell.cur && !isToday && !isSelected) e.currentTarget.style.backgroundColor = 'var(--color-sage)' }}
              onMouseLeave={e => { if (!isToday && !isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <span className="tnum" style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: isToday ? '50%' : 'var(--radius-sm)',
                backgroundColor: isToday ? 'var(--color-forest)' : isSelected ? 'var(--color-sage)' : 'transparent',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: isToday || isSelected ? 700 : 400,
                color: isToday ? '#ffffff' : cell.cur ? 'var(--color-charcoal)' : 'var(--color-text-secondary)', lineHeight: 1 }}>
                {cell.day}
              </span>
              <span style={{ display: 'flex', gap: '3px', height: '4px', alignItems: 'center' }}>
                {dots.map((t, di) => (
                  <span key={di} aria-hidden="true" style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: DOT[t], display: 'block' }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', marginTop: 'var(--space-3)',
        paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-sage)' }}>
        {[
          { label: 'Confirmed', color: DOT.confirmed },
          { label: 'Awaiting approval', color: DOT.pending },
          { label: 'Holiday', color: DOT.holiday },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color, display: 'inline-block' }} />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
