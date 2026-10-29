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
    <div className="dashboard-container">
      <HeroBanner />

      <StatCards />

      <div className="dashboard-main-grid">
        <div style={{ minWidth: 0, width: '100%' }}>
          <TodaysAppointments />
        </div>

        <div className="dashboard-right-col">
          <CalendarWidget selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          <AgendaPanel selectedDate={selectedDate} />
        </div>
      </div>

      <style>{`
        .dashboard-container {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
          width: 100%;
          min-width: 0;
        }
        .dashboard-main-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--space-4);
          align-items: start;
          width: 100%;
          min-width: 0;
        }
        .dashboard-right-col {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
          min-width: 0;
          width: 100%;
        }
        @media (min-width: 768px) {
          .dashboard-container {
            gap: var(--space-6);
          }
          .dashboard-main-grid {
            gap: var(--space-6);
          }
          .dashboard-right-col {
            gap: var(--space-6);
          }
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
