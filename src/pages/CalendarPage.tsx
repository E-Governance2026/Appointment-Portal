import { useMemo, useState } from 'react'
import { CalendarDays, Settings2 } from 'lucide-react'
import MonthCalendar from '../components/calendar/MonthCalendar'
import DaySchedule from '../components/calendar/DaySchedule'
import AvailabilityEditor from '../components/calendar/AvailabilityEditor'
import { useCalendarAppointments, useDayAppointments, useAvailability } from '../hooks/useCalendar'
import { useAuthStore } from '../store/authStore'
import { hasPermission } from '../config/permissions'
import { localISODate } from '../data/mockAppointments'

// Authorities known to the mock data (id -> display name). In the real system
// this comes from the users/authorities table.
const AUTHORITIES: { id: string; name: string }[] = [
  { id: 'auth-ss', name: 'Prof. Sneha Shah' },
  { id: 'auth-nj', name: 'Prof. Neha Joshi' },
  { id: 'auth-vm', name: 'Mr. Vivek Mehta' },
  { id: 'auth-ap', name: 'Dr. Amit Patel' },
  { id: 'auth-pd', name: 'Ms. Priya Desai' },
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function monthRange(d: Date): { from: string; to: string } {
  const y = d.getFullYear()
  const m = d.getMonth()
  const from = `${y}-${pad(m + 1)}-01`
  const lastDay = new Date(y, m + 1, 0).getDate()
  const to = `${y}-${pad(m + 1)}-${pad(lastDay)}`
  return { from, to }
}

type Tab = 'calendar' | 'availability'

// ─── CalendarPage ─────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const user = useAuthStore(s => s.user)
  const role = user?.role ?? 'requester'

  const canManageOwn = hasPermission(role, 'calendar.manageOwn')
  const canManageAny = hasPermission(role, 'calendar.manageAny')
  const canManage = canManageOwn || canManageAny

  const [tab, setTab] = useState<Tab>('calendar')
  const [viewDate, setViewDate] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selectedDate, setSelectedDate] = useState<string>(localISODate())
  const [authorityId, setAuthorityId] = useState<string>(AUTHORITIES[0].id)

  const range = useMemo(() => monthRange(viewDate), [viewDate])
  const { data: monthAppointments = [] } = useCalendarAppointments(range)
  const { data: dayAppointments = [], isLoading: dayLoading } = useDayAppointments(selectedDate)
  const { data: availability } = useAvailability(authorityId)

  const authorityName = AUTHORITIES.find(a => a.id === authorityId)?.name ?? authorityId

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-subtitle">Appointments by day, and availability configuration.</p>
        </div>

        {/* Authority picker (affects non-working-day shading + availability editor) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="authority-select" style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Authority
          </label>
          <select
            id="authority-select"
            value={authorityId}
            onChange={e => setAuthorityId(e.target.value)}
            className="input"
            style={{ width: 'auto', fontSize: '13px' }}
          >
            {AUTHORITIES.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs (availability tab only when the role can manage it) */}
      {canManage && (
        <div role="tablist" aria-label="Calendar views"
          style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', borderBottom: '1px solid var(--color-sage)' }}>
          {([
            { key: 'calendar',     label: 'Calendar',     icon: <CalendarDays size={15} aria-hidden="true" /> },
            { key: 'availability', label: 'Availability',  icon: <Settings2 size={15} aria-hidden="true" /> },
          ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(t => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-sans)', fontSize: '14px',
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--color-forest)' : 'var(--color-text-secondary)',
                  borderBottom: active ? '2px solid var(--color-forest)' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
                onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
                onBlur={e  => (e.currentTarget.style.outline = 'none')}
              >
                {t.icon} {t.label}
              </button>
            )
          })}
        </div>
      )}

      {tab === 'calendar' ? (
        <div
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 380px)', gap: '1rem', alignItems: 'start' }}
          className="calendar-split"
        >
          <MonthCalendar
            viewDate={viewDate}
            selectedDate={selectedDate}
            appointments={monthAppointments}
            availability={availability}
            onSelectDate={setSelectedDate}
            onPrevMonth={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            onNextMonth={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          />
          <div style={{ position: 'sticky', top: '1rem', height: 'calc(100vh - 8rem)' }}>
            <DaySchedule
              date={selectedDate}
              appointments={dayAppointments}
              availability={availability}
              isLoading={dayLoading}
            />
          </div>
        </div>
      ) : (
        <AvailabilityEditor authorityId={authorityId} authorityName={authorityName} />
      )}
    </div>
  )
}
