import { useState } from 'react'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { generateTimeSlots, type AppointmentFormData } from '../../types/appointment'

// ─── Constants ────────────────────────────────────────────────────────────────
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS   = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']

// Holidays (day numbers for current month — mock)
const HOLIDAY_DAYS = [5, 15, 26]

interface Step3Props {
  data: AppointmentFormData
  onChange: (updates: Partial<AppointmentFormData>) => void
}

export default function Step3DateTime({ data, onChange }: Step3Props) {
  const today     = new Date()
  const [viewDate, setViewDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  )

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const daysInMonth  = new Date(year, month + 1, 0).getDate()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const timeSlots = generateTimeSlots()

  const selectedDate = data.date
    ? new Date(data.date)
    : null
  const selectedDay  = selectedDate
    ? selectedDate.getDate()
    : null
  const isCurrentViewMonth =
    selectedDate &&
    selectedDate.getFullYear() === year &&
    selectedDate.getMonth() === month

  function selectDay(day: number) {
    const isHoliday  = HOLIDAY_DAYS.includes(day)
    const isPast     = year === today.getFullYear() &&
                       month === today.getMonth() &&
                       day < today.getDate()
    if (isHoliday || isPast) return

    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    onChange({ date: iso, timeSlot: '' })
  }

  function isPastDay(day: number) {
    return (
      year < today.getFullYear() ||
      (year === today.getFullYear() &&
        (month < today.getMonth() ||
          (month === today.getMonth() && day < today.getDate())))
    )
  }

  function formatSelectedDate() {
    if (!selectedDate) return ''
    return selectedDate.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  }

  return (
    <div>
      <h2 className="font-bold text-base mb-1" style={{ color: 'var(--color-text)' }}>
        Select Date &amp; Time
      </h2>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-muted)' }}>
        Pick an available date then choose your preferred time slot.
      </p>

      <div className="grid sm:grid-cols-2 gap-5">
        {/* ── Calendar ── */}
        <div
          className="rounded-xl p-4"
          style={{
            backgroundColor: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
          }}
        >
          {/* Month navigator */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="p-1 rounded-md transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-border)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <ChevronLeft size={15} />
            </button>
            <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
              {MONTHS[month]} {year}
            </p>
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              className="p-1 rounded-md transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-border)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map(d => (
              <div
                key={d}
                className="text-center"
                style={{ color: 'var(--color-text-muted)', fontSize: '0.62rem', fontWeight: 600 }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, i) => {
              if (day === null) return <div key={`b-${i}`} />

              const isToday    = year === today.getFullYear() && month === today.getMonth() && day === today.getDate()
              const isSelected = isCurrentViewMonth && day === selectedDay
              const isHoliday  = HOLIDAY_DAYS.includes(day)
              const isPast     = isPastDay(day)
              const disabled   = isHoliday || isPast

              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDay(day)}
                  className="relative flex flex-col items-center justify-center rounded-lg py-1 transition-all"
                  style={{
                    backgroundColor: isSelected
                      ? 'var(--color-primary)'
                      : isToday
                      ? 'rgba(15,128,107,0.12)'
                      : 'transparent',
                    color: isSelected
                      ? '#fff'
                      : isHoliday
                      ? '#ef4444'
                      : isPast
                      ? 'var(--color-border)'
                      : isToday
                      ? 'var(--color-secondary)'
                      : 'var(--color-text)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: isPast ? 0.4 : 1,
                  }}
                  onMouseEnter={e => {
                    if (!disabled && !isSelected)
                      e.currentTarget.style.backgroundColor = 'rgba(7,59,53,0.08)'
                  }}
                  onMouseLeave={e => {
                    if (!disabled && !isSelected)
                      e.currentTarget.style.backgroundColor = isToday
                        ? 'rgba(15,128,107,0.12)'
                        : 'transparent'
                  }}
                >
                  <span style={{ fontSize: '0.7rem', fontWeight: isSelected || isToday ? 700 : 400 }}>
                    {day}
                  </span>
                  {isHoliday && !isPast && (
                    <span
                      style={{
                        width: '4px', height: '4px', borderRadius: '50%',
                        backgroundColor: '#ef4444', display: 'block', marginTop: '1px',
                      }}
                    />
                  )}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
            {[
              { color: 'var(--color-primary)',  label: 'Selected'  },
              { color: '#0F806B',               label: 'Today'     },
              { color: '#ef4444',               label: 'Holiday'   },
              { color: 'var(--color-border)',   label: 'Past'      },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1">
                <span
                  style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: item.color, display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Time Slots ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} style={{ color: 'var(--color-secondary)' }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
              {data.date ? `Available Slots — ${formatSelectedDate()}` : 'Select a date to see slots'}
            </p>
          </div>

          {!data.date ? (
            <div
              className="flex items-center justify-center h-48 rounded-xl"
              style={{ backgroundColor: 'var(--color-bg)', border: '1px dashed var(--color-border)' }}
            >
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                ← Pick a date first
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {timeSlots.map(slot => {
                  const isSelected = data.timeSlot === slot.time
                  const isBooked   = slot.status === 'booked'
                  const isBreak    = slot.status === 'break'
                  const disabled   = isBooked || isBreak

                  return (
                    <button
                      key={slot.time}
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange({ timeSlot: slot.time })}
                      className="py-2 px-3 rounded-lg text-xs font-semibold transition-all border"
                      style={{
                        backgroundColor: isSelected
                          ? 'var(--color-primary)'
                          : isBooked
                          ? 'rgba(229,233,229,0.6)'
                          : isBreak
                          ? 'rgba(244,163,64,0.08)'
                          : 'var(--color-surface)',
                        borderColor: isSelected
                          ? 'var(--color-primary)'
                          : isBooked
                          ? 'var(--color-border)'
                          : isBreak
                          ? '#F4A340'
                          : 'var(--color-border)',
                        color: isSelected
                          ? '#fff'
                          : isBooked
                          ? 'var(--color-text-muted)'
                          : isBreak
                          ? '#F4A340'
                          : 'var(--color-text)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: isBooked ? 0.5 : 1,
                        textDecoration: isBooked ? 'line-through' : 'none',
                      }}
                    >
                      {slot.time}
                      {isBreak && <span className="ml-1 text-xs">☕</span>}
                    </button>
                  )
                })}
              </div>

              {/* Slot legend */}
              <div className="flex flex-wrap gap-3 mt-3">
                {[
                  { color: 'var(--color-primary)', label: 'Selected'   },
                  { color: '#0F806B',              label: 'Available'  },
                  { color: 'var(--color-border)',  label: 'Booked'     },
                  { color: '#F4A340',              label: 'Break'      },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-1">
                    <span
                      style={{
                        width: '8px', height: '8px', borderRadius: '2px',
                        backgroundColor: item.color, display: 'inline-block',
                      }}
                    />
                    <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
