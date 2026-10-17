import { useState } from 'react'
import HeroBanner         from '../components/dashboard/HeroBanner'
import StatCards          from '../components/dashboard/StatCards'
import TodaysAppointments from '../components/dashboard/TodaysAppointments'
import CalendarWidget     from '../components/dashboard/CalendarWidget'
import AgendaPanel        from '../components/dashboard/AgendaPanel'
import { localISODate }   from '../data/mockAppointments'

// ─── Dashboard ────────────────────────────────────────────────────────────────
// Order: banner, stat row, main grid.
// Main grid (>=1360px): minmax(0, 1fr) 360px — appointments table left; calendar
// then agenda stacked right. Below 1360px a single column: table, calendar,
// agenda. Calendar and agenda share the selected date (lifted here).
export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState<string>(localISODate())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <HeroBanner />

      <StatCards />

      <div className="dashboard-main-grid">
        <div style={{ minWidth: 0 }}>
          <TodaysAppointments />
        </div>

        <div className="dashboard-right-col">
          <CalendarWidget selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          <AgendaPanel selectedDate={selectedDate} />
        </div>
      </div>

      <style>{`
        .dashboard-main-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--space-6);
          align-items: start;
        }
        .dashboard-right-col {
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
          min-width: 0;
        }
        @media (min-width: 1360px) {
          .dashboard-main-grid {
            grid-template-columns: minmax(0, 1fr) 360px;
          }
        }
      `}</style>
    </div>
  )
}
