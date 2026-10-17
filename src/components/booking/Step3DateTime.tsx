import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import { fetchMonthAvailability, fetchDaySlots } from '../../data/bookingApi'
import { useBookingStore } from '../../store/bookingStore'

// ─── Constants ────────────────────────────────────────────────────────────────
const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const
const MONTHS   = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function formatDisplayTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12    = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2,'0')} ${suffix}`
}

// ─── Step 3 ───────────────────────────────────────────────────────────────────
export default function Step3DateTime() {
  const today = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  // Arrow-key focus tracking inside the calendar grid
  const [focusDay, setFocusDay] = useState<number | null>(null)

  const authorityId = useBookingStore(s => s.authorityId)
  const date        = useBookingStore(s => s.date)
  const time        = useBookingStore(s => s.time)
  const errors      = useBookingStore(s => s.stepErrors[2])
  const setDate     = useBookingStore(s => s.setDate)
  const setTime     = useBookingStore(s => s.setTime)

  // Revised flow: choosing a slot is optional — the authority may propose a time
  // during approval. This control clears any selection so the request is
  // submitted without a time.
  function letAuthorityPropose() {
    setTime('')
    setDate('')
  }

  // Month availability
  const { data: monthData = [], isLoading: loadingMonth } = useQuery({
    queryKey: ['booking-month', authorityId, viewYear, viewMonth],
    queryFn:  () => fetchMonthAvailability(authorityId, viewYear, viewMonth),
    enabled:  !!authorityId,
  })

  // Day slots (only when a date is selected in the current view)
  const selectedInView =
    date.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2,'0')}`)

  const { data: slots = [], isLoading: loadingSlots } = useQuery({
    queryKey: ['booking-slots', authorityId, date],
    queryFn:  () => fetchDaySlots(authorityId, date),
    enabled:  !!authorityId && !!date,
  })

  // Build 42-cell grid
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstOffset  = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate()

  type Cell = { day: number; thisMonth: boolean; dateStr: string }
  const cells: Cell[] = []
  for (let i = firstOffset - 1; i >= 0; i--)
    cells.push({ day: prevMonthDays - i, thisMonth: false, dateStr: '' })
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, thisMonth: true, dateStr: toISO(viewYear, viewMonth, d) })
  while (cells.length < 42)
    cells.push({ day: cells.length - firstOffset - daysInMonth + 1, thisMonth: false, dateStr: '' })

  const dayMap = new Map(monthData.map(d => [d.date, d]))

  // Arrow-key navigation
  const handleCalendarKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!focusDay) return
    let next = focusDay
    if (e.key === 'ArrowRight') next = Math.min(focusDay + 1, daysInMonth)
    if (e.key === 'ArrowLeft')  next = Math.max(focusDay - 1, 1)
    if (e.key === 'ArrowDown')  next = Math.min(focusDay + 7, daysInMonth)
    if (e.key === 'ArrowUp')    next = Math.max(focusDay - 7, 1)
    if (next !== focusDay) {
      e.preventDefault()
      setFocusDay(next)
      const btn = document.getElementById(`cal-day-${next}`)
      btn?.focus()
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const info = dayMap.get(toISO(viewYear, viewMonth, focusDay))
      if (info?.open) setDate(toISO(viewYear, viewMonth, focusDay))
    }
  }, [focusDay, daysInMonth, viewYear, viewMonth, dayMap, setDate])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const isViewingCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Optional-slot banner: the authority proposes a time if none is chosen. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', padding: '12px 14px', backgroundColor: 'var(--color-cream)',
        border: '1px solid var(--color-sage)', borderRadius: 'var(--radius-md)' }}>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
          Choosing a date and time is optional. Leave it blank and the authority will propose a time when they review your request.
        </p>
        {(date || time) && (
          <button type="button" onClick={letAuthorityPropose} className="btn-ghost btn-sm" style={{ flexShrink: 0 }}>
            Let the authority propose a time
          </button>
        )}
      </div>

      {/* Validation errors */}
      {(errors.date || errors.time) && (
        <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px',
          padding: '10px 14px', backgroundColor: '#fce8e6', border: '1px solid #f5c6c4',
          borderRadius: '8px' }}>
          <AlertCircle size={15} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#7d1c18', margin: 0 }}>
            {errors.date || errors.time}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="step3-grid">

        {/* ── Left: Calendar ── */}
        <div>
          {/* Month navigator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <button type="button" onClick={prevMonth} aria-label="Previous month"
              style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', backgroundColor: 'transparent', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--color-charcoal)' }}
              onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
              onBlur={e  => (e.currentTarget.style.outline = 'none')}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>

            <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '15px', color: 'var(--color-charcoal)', margin: 0 }}>
              {MONTHS[viewMonth]} {viewYear}
            </p>

            <button type="button" onClick={nextMonth} aria-label="Next month"
              style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', backgroundColor: 'transparent', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--color-charcoal)' }}
              onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
              onBlur={e  => (e.currentTarget.style.outline = 'none')}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {WEEKDAYS.map(d => (
              <div key={d} style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div
            role="grid"
            aria-label="Select appointment date"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}
            onKeyDown={handleCalendarKeyDown}
          >
            {cells.map((cell, i) => {
              if (!cell.thisMonth) {
                return (
                  <div key={`blank-${i}`} style={{ height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'rgba(74,90,85,0.35)' }}>
                      {cell.day}
                    </span>
                  </div>
                )
              }

              const info     = dayMap.get(cell.dateStr)
              const isOpen   = info?.open ?? false
              const isClosed = !!info && !info.open
              const isToday  = isViewingCurrentMonth && cell.day === today.getDate()
              const isSel    = cell.dateStr === date

              let title = ''
              if (isClosed && info?.reason)   title = info.reason
              if (isClosed && info?.holidayLabel) title = info.holidayLabel

              const ariaLabel = [
                `${cell.day} ${MONTHS[viewMonth]} ${viewYear}`,
                isToday   ? 'today' : '',
                isClosed  ? (title || 'unavailable') : '',
                isSel     ? 'selected' : '',
              ].filter(Boolean).join(', ')

              return (
                <button
                  key={cell.dateStr}
                  id={`cal-day-${cell.day}`}
                  role="gridcell"
                  type="button"
                  disabled={isClosed || loadingMonth}
                  onClick={() => isOpen && setDate(cell.dateStr)}
                  onFocus={e => {
                    setFocusDay(cell.day)
                    e.currentTarget.style.outline = '2px solid var(--color-emerald)'
                  }}
                  onBlur={e => (e.currentTarget.style.outline = 'none')}
                  aria-label={ariaLabel}
                  aria-selected={isSel}
                  aria-current={isToday ? 'date' : undefined}
                  title={title || undefined}
                  style={{
                    height:          '44px',
                    display:         'flex',
                    flexDirection:   'column',
                    alignItems:      'center',
                    justifyContent:  'center',
                    gap:             '2px',
                    border:          'none',
                    backgroundColor: 'transparent',
                    cursor:          isOpen ? 'pointer' : 'not-allowed',
                    borderRadius:    'var(--radius-md)',
                    opacity:         isClosed ? 0.38 : 1,
                  }}
                  onMouseEnter={e => { if (isOpen && !isSel) e.currentTarget.style.backgroundColor = 'var(--color-sage)' }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <span
                    style={{
                      width:           '28px',
                      height:          '28px',
                      borderRadius:    '50%',
                      display:         'flex',
                      alignItems:      'center',
                      justifyContent:  'center',
                      backgroundColor: isSel  ? 'var(--color-forest)'
                                      : isToday ? 'rgba(7,59,53,0.1)' : 'transparent',
                      fontFamily:      'var(--font-sans)',
                      fontSize:        '13px',
                      fontWeight:      isSel || isToday ? 700 : 400,
                      color:           isSel ? '#ffffff' : isToday ? 'var(--color-forest)' : 'var(--color-charcoal)',
                    }}
                  >
                    {cell.day}
                  </span>
                  {/* Dot for days that have appointment marks */}
                  {info?.reason === 'Holiday' ? (
                    <span aria-hidden="true" style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--color-danger)', display: 'block' }} />
                  ) : isOpen ? (
                    <span aria-hidden="true" style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--color-emerald)', display: 'block' }} />
                  ) : (
                    <span style={{ width: '4px', height: '4px', display: 'block' }} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Right: Time slots ── */}
        <div>
          <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '15px', color: 'var(--color-charcoal)', margin: '0 0 12px 0' }}>
            {date ? `Slots for ${new Date(date + 'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'long'})}` : 'Select a date to see available slots'}
          </p>

          {!date && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              Choose a date on the calendar to see available time slots.
            </p>
          )}

          {date && loadingSlots && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
              {[0,1,2,3,4,5].map(i => (
                <div key={i} style={{ height: '40px', borderRadius: '6px', backgroundColor: 'var(--color-sage)', opacity: 0.5 }} aria-hidden="true" />
              ))}
            </div>
          )}

          {date && !loadingSlots && slots.length === 0 && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              No slots are available on this date. Select another date.
            </p>
          )}

          {date && !loadingSlots && slots.length > 0 && (
            <>
              <div
                role="radiogroup"
                aria-label="Available time slots"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}
              >
                {slots.map(slot => {
                  const isAvail = slot.state === 'available'
                  const isSel   = slot.time === time
                  return (
                    <button
                      key={slot.time}
                      type="button"
                      role="radio"
                      aria-checked={isSel}
                      disabled={!isAvail}
                      title={slot.label || undefined}
                      onClick={() => isAvail && setTime(slot.time)}
                      style={{
                        height:          '40px',
                        fontFamily:      'var(--font-sans)',
                        fontSize:        '13px',
                        fontWeight:      isSel ? 700 : 500,
                        border:          `1.5px solid ${isSel ? 'var(--color-forest)' : isAvail ? 'var(--color-sage)' : 'var(--color-sage)'}`,
                        borderRadius:    '6px',
                        backgroundColor: isSel ? 'var(--color-forest)' : isAvail ? 'var(--color-ivory)' : 'var(--color-sage)',
                        color:           isSel ? '#ffffff' : isAvail ? 'var(--color-charcoal)' : 'var(--color-text-secondary)',
                        cursor:          isAvail ? 'pointer' : 'not-allowed',
                        opacity:         isAvail || isSel ? 1 : 0.6,
                        textDecoration:  slot.state === 'booked' || slot.state === 'held' ? 'line-through' : 'none',
                      }}
                      onFocus={e => { if (isAvail) e.currentTarget.style.outline = '2px solid var(--color-emerald)' }}
                      onBlur={e  => (e.currentTarget.style.outline = 'none')}
                    >
                      {formatDisplayTime(slot.time)}
                    </button>
                  )
                })}
              </div>

              {/* Slot legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '12px' }}>
                {[
                  { color: 'var(--color-forest)', label: 'Selected'  },
                  { color: 'var(--color-emerald)', label: 'Available' },
                  { color: 'var(--color-sage)',    label: 'Unavailable' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span aria-hidden="true" style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: item.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Spec note */}
          {date && time && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '14px',
              padding: '10px 12px', backgroundColor: 'rgba(31,95,166,0.06)', border: '1px solid rgba(31,95,166,0.15)', borderRadius: '6px' }}>
              Selecting a slot does not confirm the appointment. The authority must approve the request.
            </p>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 767px) { .step3-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  )
}
