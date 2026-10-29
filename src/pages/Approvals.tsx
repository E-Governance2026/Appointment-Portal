import { useMemo, useState } from 'react'
import { Inbox } from 'lucide-react'
import ApprovalQueueTable from '../components/approvals/ApprovalQueueTable'
import ApprovalDetailPanel from '../components/approvals/ApprovalDetailPanel'
import { useApprovalQueue } from '../hooks/useApprovals'
import { localISODate } from '../data/mockAppointments'
import type { AppointmentStatus } from '../data/mockAppointments'
import type { ApprovalRecord } from '../data/approvalData'

// ─── Tabs ───────────────────────────────────────────────────────────────────────
// Each tab is a saved view over the queue. A record either matches a status set
// or a custom predicate (today's confirmed, upcoming).
type TabKey =
  | 'new'
  | 'awaiting-info'
  | 'pending-confirm'
  | 'reschedule'
  | 'today'
  | 'upcoming'
  | 'completed'

interface TabDef {
  key:       TabKey
  label:     string
  statuses?: AppointmentStatus[]
  match?:    (rec: ApprovalRecord) => boolean
}

const TODAY = localISODate()

const TABS: TabDef[] = [
  { key: 'new',             label: 'New requests',         statuses: ['submitted'] },
  { key: 'awaiting-info',   label: 'Awaiting info',        statuses: ['additional-info'] },
  { key: 'pending-confirm', label: 'Pending confirmation', statuses: ['approved'] },
  { key: 'reschedule',      label: 'Reschedule requests',  statuses: ['rescheduled'] },
  { key: 'today',           label: "Today's confirmed",    match: r => r.status === 'confirmed' && r.date === TODAY },
  { key: 'upcoming',        label: 'Upcoming',             match: r => r.status === 'confirmed' && r.date > TODAY },
  { key: 'completed',       label: 'Completed',            statuses: ['completed', 'rejected', 'cancelled', 'not-reported'] },
]

function matchesTab(tab: TabDef, rec: ApprovalRecord): boolean {
  if (tab.match) return tab.match(rec)
  if (tab.statuses) return tab.statuses.includes(rec.status)
  return false
}

// ─── Approvals page ───────────────────────────────────────────────────────────
export default function Approvals() {
  const { data: queue = [], isLoading, isError } = useApprovalQueue()
  const [activeTab, setActiveTab] = useState<TabKey>('new')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Counts per tab, recomputed whenever the queue changes.
  const counts = useMemo(() => {
    const map = {} as Record<TabKey, number>
    for (const tab of TABS) map[tab.key] = queue.filter(r => matchesTab(tab, r)).length
    return map
  }, [queue])

  const activeDef = TABS.find(t => t.key === activeTab)!
  const rows = useMemo(
    () => queue.filter(r => matchesTab(activeDef, r)),
    [queue, activeDef],
  )

  // If the selected row is no longer in the active list (e.g. after an action
  // moved it to another tab), keep the panel open so the user sees the result,
  // but allow selecting from the new list.
  function handleTab(key: TabKey) {
    setActiveTab(key)
  }

  return (
    <div>
      <h1 className="page-title">Approvals</h1>
      <p className="page-subtitle">
        Review, approve, reject or request information on appointment requests.
      </p>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Approval views"
        style={{
          display: 'flex', flexWrap: 'wrap', gap: '8px',
          margin: '1.25rem 0', borderBottom: '1px solid var(--color-sage)', paddingBottom: '0',
        }}
      >
        {TABS.map(tab => {
          const isActive = tab.key === activeTab
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: '14px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--color-forest)' : 'var(--color-text-secondary)',
                borderBottom: isActive ? '2px solid var(--color-forest)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
              onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
              onBlur={e  => (e.currentTarget.style.outline = 'none')}
            >
              {tab.label}
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: '22px', height: '20px', padding: '0 6px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: isActive ? 'var(--color-forest)' : 'var(--color-sage)',
                  color: isActive ? 'var(--color-ivory)' : 'var(--color-text-secondary)',
                  fontSize: '12px', fontWeight: 700,
                }}
              >
                {counts[tab.key] ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      {/* Split layout: queue (left) + detail (right when a row is selected) */}
      <div className={`approvals-split ${selectedId ? 'has-selected' : ''}`}>
        <div className="card" style={{ padding: 0, overflow: 'hidden', minWidth: 0 }}>
          {isLoading ? (
            <div style={emptyStyle}>Loading requests...</div>
          ) : isError ? (
            <div style={emptyStyle}>Could not load the approval queue.</div>
          ) : rows.length === 0 ? (
            <div style={emptyStyle}>
              <Inbox size={28} style={{ color: 'var(--color-text-secondary)', marginBottom: '8px' }} aria-hidden="true" />
              <p style={{ margin: 0 }}>No requests in this list.</p>
            </div>
          ) : (
            <ApprovalQueueTable
              rows={rows}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>

        {selectedId && (
          <div className="approvals-detail-col">
            <ApprovalDetailPanel id={selectedId} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>

      <style>{`
        .approvals-split {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
          align-items: start;
          width: 100%;
          min-width: 0;
        }
        .approvals-detail-col {
          min-width: 0;
          width: 100%;
        }
        @media (min-width: 1024px) {
          .approvals-split.has-selected {
            grid-template-columns: minmax(0, 1fr) minmax(0, 420px);
          }
          .approvals-detail-col {
            position: sticky;
            top: 1rem;
            height: calc(100vh - 8rem);
          }
        }
      `}</style>
    </div>
  )
}

const emptyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '3rem 1.5rem',
  textAlign: 'center',
  fontFamily: 'var(--font-sans)',
  fontSize: '14px',
  color: 'var(--color-text-secondary)',
}
