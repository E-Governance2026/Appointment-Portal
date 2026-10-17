import { LogIn, LogOut, Clock, User, Building2, CheckCircle, Loader2 } from 'lucide-react'
import type { ApprovalRecord } from '../../data/approvalData'
import { useAuthStore } from '../../store/authStore'
import { hasPermission } from '../../config/permissions'
import { useCheckIn, useCheckOut } from '../../hooks/useVisitors'

interface ReceptionQueueProps {
  rows:      ApprovalRecord[]
  isLoading?: boolean
  onError?:  (message: string) => void
}

type VisitState = 'expected' | 'checked-in' | 'completed'

function visitState(rec: ApprovalRecord): VisitState {
  if (rec.status === 'completed' || rec.checkedOutAt) return 'completed'
  if (rec.checkedInAt) return 'checked-in'
  return 'expected'
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suf = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suf}`
}

function fmtClock(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

// Small state tag — not a status chip (visit state is distinct from appointment status).
function VisitTag({ state }: { state: VisitState }) {
  const map: Record<VisitState, { label: string; bg: string; color: string }> = {
    'expected':   { label: 'Expected',   bg: '#FCEBD0', color: '#8A5200' },
    'checked-in': { label: 'Checked in', bg: '#DCEFE9', color: '#0B5F4F' },
    'completed':  { label: 'Completed',  bg: '#E5E9E5', color: '#172522' },
  }
  const s = map[state]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px',
      backgroundColor: s.bg, color: s.color, fontFamily: 'var(--font-sans)',
      fontSize: '12px', fontWeight: 600, lineHeight: '18px', padding: '2px 8px',
      borderRadius: '6px' }}>
      {s.label}
    </span>
  )
}

// ─── ReceptionQueue ───────────────────────────────────────────────────────────
export default function ReceptionQueue({ rows, isLoading, onError }: ReceptionQueueProps) {
  const role = useAuthStore(s => s.user?.role ?? 'requester')
  const canCheckIn  = hasPermission(role, 'visitor.checkIn')
  const canCheckOut = hasPermission(role, 'visitor.checkOut')

  const checkIn  = useCheckIn()
  const checkOut = useCheckOut()
  const busy = checkIn.isPending || checkOut.isPending

  function handleError(err: unknown) {
    onError?.(err instanceof Error ? err.message : 'Something went wrong.')
  }

  if (isLoading) {
    return <div style={empty}>Loading the reception desk...</div>
  }
  if (rows.length === 0) {
    return <div style={empty}>No confirmed appointments for this day.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {rows.map(rec => {
        const state = visitState(rec)
        return (
          <div key={rec.id} className="card" style={{ padding: '1rem', display: 'flex',
            gap: '12px', alignItems: 'flex-start' }}>
            {/* Time */}
            <div style={{ flexShrink: 0, minWidth: '72px' }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '14px',
                color: 'var(--color-charcoal)', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={13} aria-hidden="true" /> {fmtTime(rec.time)}
              </p>
            </div>

            {/* Details */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '14px',
                  color: 'var(--color-charcoal)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rec.subject}
                </p>
                <VisitTag state={state} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                <span style={meta}><User size={12} aria-hidden="true" /> {rec.requester} ({rec.requesterCategory})</span>
                <span style={meta}><Building2 size={12} aria-hidden="true" /> {rec.authorityName}</span>
                <span style={meta}>{rec.id}</span>
              </div>

              {/* Visit timestamps */}
              {(rec.checkedInAt || rec.checkedOutAt) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: '6px' }}>
                  {rec.checkedInAt && (
                    <span style={meta}><LogIn size={12} aria-hidden="true" /> In at {fmtClock(rec.checkedInAt)}</span>
                  )}
                  {rec.checkedOutAt && (
                    <span style={meta}><LogOut size={12} aria-hidden="true" /> Out at {fmtClock(rec.checkedOutAt)}</span>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              {state === 'expected' && canCheckIn && (
                <button className="btn-primary" disabled={busy} style={{ fontSize: '13px' }}
                  onClick={() => checkIn.mutate({ id: rec.id }, { onError: handleError })}>
                  {checkIn.isPending ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <LogIn size={14} aria-hidden="true" />}
                  Check in
                </button>
              )}
              {state === 'checked-in' && canCheckOut && (
                <button className="btn-secondary" disabled={busy} style={{ fontSize: '13px' }}
                  onClick={() => checkOut.mutate({ id: rec.id }, { onError: handleError })}>
                  {checkOut.isPending ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <LogOut size={14} aria-hidden="true" />}
                  Check out
                </button>
              )}
              {state === 'completed' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px',
                  fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-emerald)' }}>
                  <CheckCircle size={14} aria-hidden="true" /> Done
                </span>
              )}
            </div>

            <style>{`
              .spin { animation: vq-spin 0.8s linear infinite; }
              @keyframes vq-spin { to { transform: rotate(360deg); } }
            `}</style>
          </div>
        )
      })}
    </div>
  )
}

const meta: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '4px',
  fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-secondary)',
}
const empty: React.CSSProperties = {
  padding: '2.5rem', textAlign: 'center', fontFamily: 'var(--font-sans)',
  fontSize: '14px', color: 'var(--color-text-secondary)',
}
