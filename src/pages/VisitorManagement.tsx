import { useMemo, useState } from 'react'
import { UserCheck, LogIn, CheckCircle } from 'lucide-react'
import ReceptionQueue from '../components/visitors/ReceptionQueue'
import { useReceptionQueue } from '../hooks/useVisitors'
import { localISODate } from '../data/mockAppointments'
import type { ApprovalRecord } from '../data/approvalData'

function countByState(rows: ApprovalRecord[]) {
  let expected = 0, checkedIn = 0, completed = 0
  for (const r of rows) {
    if (r.status === 'completed' || r.checkedOutAt) completed++
    else if (r.checkedInAt) checkedIn++
    else expected++
  }
  return { expected, checkedIn, completed }
}

// ─── Summary stat ──────────────────────────────────────────────────────────────
function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '160px' }}>
      <div aria-hidden="true" style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'var(--color-sage)', color, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <p style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: '22px',
          color: 'var(--color-charcoal)', margin: 0, lineHeight: 1 }}>
          {value}
        </p>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)', margin: '4px 0 0 0' }}>
          {label}
        </p>
      </div>
    </div>
  )
}

// ─── VisitorManagement page ────────────────────────────────────────────────────
export default function VisitorManagement() {
  const [date, setDate] = useState<string>(localISODate())
  const [banner, setBanner] = useState('')

  const { data: rows = [], isLoading, isError } = useReceptionQueue(date)
  const counts = useMemo(() => countByState(rows), [rows])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h1 className="page-title">Visitor management</h1>
          <p className="page-subtitle">Check visitors in and out for confirmed appointments.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="reception-date" style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Date
          </label>
          <input
            id="reception-date"
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setBanner('') }}
            className="input"
            style={{ width: 'auto', fontSize: '13px' }}
          />
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <Stat icon={<UserCheck size={18} aria-hidden="true" />}   label="Expected"   value={counts.expected}  color="var(--color-amber)"   />
        <Stat icon={<LogIn size={18} aria-hidden="true" />}       label="Checked in" value={counts.checkedIn} color="var(--color-emerald)" />
        <Stat icon={<CheckCircle size={18} aria-hidden="true" />} label="Completed"  value={counts.completed} color="var(--color-text-secondary)" />
      </div>

      {banner && (
        <div role="alert" style={{ padding: '10px 14px', backgroundColor: '#fce8e6',
          border: '1px solid #f5c6c4', borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#7d1c18', marginBottom: '1rem' }}>
          {banner}
        </div>
      )}

      {isError ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center',
          fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          Could not load the reception desk.
        </div>
      ) : (
        <ReceptionQueue rows={rows} isLoading={isLoading} onError={setBanner} />
      )}
    </div>
  )
}
