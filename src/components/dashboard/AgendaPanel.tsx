import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAllAppointments } from '../../hooks/useDashboard'
import { STATUS_CONFIG, type AppointmentStatus } from '../../data/mockAppointments'
import StatusChip from '../common/StatusChip'
import Skeleton from '../ui/Skeleton'

function lineColor(status: AppointmentStatus): string {
  return STATUS_CONFIG[status].lineColor
}
function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suf = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suf}`
}

interface AgendaPanelProps {
  selectedDate: string   // ISO yyyy-mm-dd
}

export default function AgendaPanel({ selectedDate }: AgendaPanelProps) {
  const navigate = useNavigate()
  const { data: appointments = [], isLoading } = useAllAppointments()

  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const onDay = appointments
    .filter(a => a.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time))
  const visible = onDay.slice(0, 5)
  const total = onDay.length

  return (
    <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-sage)' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 'var(--text-lg)', color: 'var(--color-charcoal)', margin: 0 }}>
          Agenda
        </h2>
        <p className="tnum" style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
          {dateLabel}
        </p>
      </div>

      <div style={{ padding: 'var(--space-2) 0' }}>
        {isLoading ? (
          [0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', gap: 'var(--space-3)', padding: '10px 16px' }} aria-hidden="true">
              <Skeleton width={56} height={14} />
              <Skeleton width="2px" height={52} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Skeleton width="60%" height={13} />
                <Skeleton width="40%" height={12} />
                <Skeleton width="80px" height={20} radius="6px" />
              </div>
            </div>
          ))
        ) : visible.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)',
            padding: 'var(--space-5) var(--space-4)', margin: 0, textAlign: 'center' }}>
            Nothing scheduled for this day.
          </p>
        ) : (
          visible.map((item, idx) => {
            const isLast = idx === visible.length - 1
            return (
              <button key={item.id} onClick={() => navigate(`/my-appointments/${item.id}`)}
                style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
                  padding: '10px 16px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                  transition: 'background-color var(--motion-fast) var(--ease-out)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-cream)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                <span className="tnum" style={{ width: '56px', flexShrink: 0, paddingTop: '1px', textAlign: 'right',
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                  {fmtTime(item.time)}
                </span>
                <span style={{ width: '3px', alignSelf: isLast ? 'flex-start' : 'stretch', minHeight: '52px',
                  backgroundColor: lineColor(item.status), flexShrink: 0, borderRadius: '2px' }} aria-hidden="true" />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-charcoal)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.appointmentType}
                  </span>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.requester}
                  </span>
                  <span style={{ marginTop: '2px' }}><StatusChip status={item.status} /></span>
                </span>
              </button>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--color-sage)', padding: 'var(--space-3) var(--space-4)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <p className="tnum" style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
          Showing {visible.length} of {total}
        </p>
        <button onClick={() => navigate('/calendar')} className="btn-ghost btn-sm" style={{ gap: '4px' }}>
          View full day <ArrowRight size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
