import { useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useTodaysAppointments } from '../../hooks/useDashboard'
import { useAuthStore } from '../../store/authStore'
import { hasPermission } from '../../config/permissions'
import StatusChip from '../common/StatusChip'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import { CalendarX } from 'lucide-react'
import type { AppointmentRecord } from '../../data/mockAppointments'

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suf = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suf}`
}
function longDate(): string {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// Column widths (table-layout: fixed). Flexible columns use 'auto' with min-widths.
const COLS = ['72px', 'auto', 'auto', '144px', '96px']
const MINW = ['72px', '180px', '200px', '144px', '96px']

function RequestedBy({ apt }: { apt: AppointmentRecord }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
      <Avatar name={apt.requester} size={36} />
      <div style={{ minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 600,
          color: 'var(--color-charcoal)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {apt.requester}
        </p>
        <p className="tnum" style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)',
          color: 'var(--color-text-secondary)', margin: 0, whiteSpace: 'nowrap' }}>
          {apt.id}
        </p>
      </div>
    </div>
  )
}

function TypeAuthority({ apt }: { apt: AppointmentRecord }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 500,
        color: 'var(--color-charcoal)', margin: 0 }}>
        {apt.appointmentType}
      </p>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)',
        color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
        {apt.authority}
      </p>
    </div>
  )
}

function ActionButton({ apt, canReview, onOpen }: { apt: AppointmentRecord; canReview: boolean; onOpen: () => void }) {
  // Action stops row propagation so it does not double-fire the row open.
  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation()
  if (canReview && apt.status === 'submitted') {
    return (
      <Button variant="primary" size="sm" onClick={e => { stop(e); onOpen() }} style={{ width: '100%' }}>
        Review
      </Button>
    )
  }
  return (
    <button
      onClick={e => { stop(e); onOpen() }}
      className="btn-ghost btn-sm"
      style={{ width: '100%' }}
    >
      View
    </button>
  )
}

export default function TodaysAppointments() {
  const navigate = useNavigate()
  const role = useAuthStore(s => s.user?.role ?? 'requester')
  const canReview = hasPermission(role, 'appointment.approve')
  const { data: appointments = [], isLoading, isError, refetch } = useTodaysAppointments()

  const sorted = [...appointments].sort((a, b) => a.time.localeCompare(b.time))
  const open = (id: string) => navigate(`/my-appointments/${id}`)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 'var(--space-3)', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-sage)' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 'var(--text-lg)',
            color: 'var(--color-charcoal)', margin: 0 }}>
            Today's appointments
          </h2>
          <p className="tnum" style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)',
            color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
            {longDate()}
          </p>
        </div>
        <button onClick={() => navigate('/my-appointments')} className="btn-ghost btn-sm" style={{ flexShrink: 0 }}>
          View all
        </button>
      </div>

      {/* Body */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)', margin: '0 0 var(--space-3) 0' }}>
            Could not load today's appointments.
          </p>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </Button>
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={<CalendarX size={22} aria-hidden="true" />} title="No appointments today."
          text="When appointments are scheduled for today, they appear here." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="ta-table-wrap" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }} aria-label="Today's appointments">
              <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead>
                <tr>
                  {['Time', 'Requested by', 'Type and authority', 'Status', 'Action'].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 4 ? 'center' : 'left', padding: '12px 16px',
                      fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 600,
                      color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-sage)',
                      minWidth: MINW[i], whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((apt, idx) => (
                  <tr
                    key={apt.id}
                    onClick={() => open(apt.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(apt.id) } }}
                    tabIndex={0}
                    className="ta-row"
                    style={{ height: '72px', cursor: 'pointer',
                      borderTop: idx > 0 ? '1px solid var(--color-sage)' : 'none' }}
                  >
                    <td className="tnum" style={{ padding: '12px 16px', verticalAlign: 'middle',
                      fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-charcoal)', whiteSpace: 'nowrap' }}>
                      {fmtTime(apt.time)}
                    </td>
                    <td style={{ padding: '12px 16px', verticalAlign: 'middle', overflow: 'hidden' }}><RequestedBy apt={apt} /></td>
                    <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}><TypeAuthority apt={apt} /></td>
                    <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}><StatusChip status={apt.status} wrap /></td>
                    <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                      <ActionButton apt={apt} canReview={canReview} onOpen={() => open(apt.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="ta-cards" style={{ display: 'none', flexDirection: 'column' }}>
            {sorted.map((apt, idx) => (
              <div
                key={apt.id}
                onClick={() => open(apt.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(apt.id) } }}
                tabIndex={0}
                className="ta-row"
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-4)',
                  cursor: 'pointer', borderTop: idx > 0 ? '1px solid var(--color-sage)' : 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                  <span className="tnum" style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-charcoal)' }}>
                    {fmtTime(apt.time)}
                  </span>
                  <StatusChip status={apt.status} wrap />
                </div>
                <RequestedBy apt={apt} />
                <TypeAuthority apt={apt} />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ width: '120px' }}>
                    <ActionButton apt={apt} canReview={canReview} onOpen={() => open(apt.id)} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-sage)' }}>
            <p className="tnum" style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
              Showing {sorted.length} of {sorted.length} appointments today
            </p>
            <button onClick={() => navigate('/my-appointments')} className="btn-ghost btn-sm">View all</button>
          </div>
        </>
      )}

      <style>{`
        .ta-row:hover { background-color: var(--color-cream); }
        @media (max-width: 767px) {
          .ta-table-wrap { display: none; }
          .ta-cards { display: flex !important; }
        }
      `}</style>
    </div>
  )
}

// ─── Skeleton (reserves table height so nothing shifts) ───────────────────────
function TableSkeleton() {
  return (
    <div style={{ padding: 'var(--space-2) 0' }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', height: '72px', padding: '0 var(--space-4)',
          borderTop: i > 0 ? '1px solid var(--color-sage)' : 'none' }} aria-hidden="true">
          <Skeleton width={52} height={14} />
          <Skeleton width={36} height={36} radius="50%" />
          <Skeleton width="30%" height={14} />
          <Skeleton width="20%" height={14} />
          <Skeleton width={72} height={20} radius="6px" />
          <Skeleton width={72} height={36} radius="var(--radius-md)" style={{ marginLeft: 'auto' }} />
        </div>
      ))}
    </div>
  )
}
