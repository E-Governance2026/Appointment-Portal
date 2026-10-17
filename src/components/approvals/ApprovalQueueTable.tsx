import StatusChip from '../common/StatusChip'
import type { ApprovalRecord } from '../../data/approvalData'

interface ApprovalQueueTableProps {
  rows:        ApprovalRecord[]
  selectedId:  string | null
  onSelect:    (id: string) => void
}

// ─── Avatar ─────────────────────────────────────────────────────────────────────
function Avatar({ initials }: { initials: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: '36px', height: '36px', borderRadius: '50%',
        backgroundColor: 'var(--color-sage)', color: 'var(--color-charcoal)',
        fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suf = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2,'0')} ${suf}`
}

// ─── ApprovalQueueTable ───────────────────────────────────────────────────────
// Columns (PRD §6.12): ID, requester + category, type, purpose, department,
// requested date/time, submitted date, approval stage, status.
// table-layout fixed; rows clickable to open the detail panel.

export default function ApprovalQueueTable({ rows, selectedId, onSelect }: ApprovalQueueTableProps) {
  const COLS = [
    { label: 'Requested by',  w: '22%'  },
    { label: 'Type',          w: '14%'  },
    { label: 'Department',    w: '16%'  },
    { label: 'Requested',     w: '14%'  },
    { label: 'Stage',         w: '16%'  },
    { label: 'Status',        w: '18%'  },
  ]

  if (rows.length === 0) {
    return (
      <div style={{ padding: '2.5rem', textAlign: 'center', fontFamily: 'var(--font-sans)',
        fontSize: '14px', color: 'var(--color-text-secondary)' }}>
        No requests in this list.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }} className="approval-table-wrap">
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}
        aria-label="Approval queue">
        <colgroup>
          {COLS.map(c => <col key={c.label} style={{ width: c.w }} />)}
        </colgroup>
        <thead>
          <tr style={{ backgroundColor: 'var(--color-bg)' }}>
            {COLS.map(c => (
              <th key={c.label}
                style={{ textAlign: 'left', padding: '12px 16px', fontFamily: 'var(--font-sans)',
                  fontSize: '14px', fontWeight: 600, color: 'var(--color-text-secondary)',
                  borderBottom: '1px solid var(--color-sage)', whiteSpace: 'nowrap' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((rec, idx) => {
            const isSelected = rec.id === selectedId
            return (
              <tr
                key={rec.id}
                onClick={() => onSelect(rec.id)}
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(rec.id) } }}
                aria-selected={isSelected}
                style={{
                  height: '64px',
                  borderTop: idx > 0 ? '1px solid var(--color-sage)' : 'none',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'rgba(7,59,53,0.06)' : 'transparent',
                  outline: 'none',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(229,233,229,0.35)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
                onFocus={e => (e.currentTarget.style.boxShadow = 'inset 0 0 0 2px var(--color-emerald)')}
                onBlur={e  => (e.currentTarget.style.boxShadow = 'none')}
              >
                {/* Requested by */}
                <td style={{ padding: '12px 16px', verticalAlign: 'middle', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Avatar initials={rec.requesterInitials} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 600,
                        color: 'var(--color-charcoal)', margin: 0, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rec.requester}
                      </p>
                      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px',
                        color: 'var(--color-text-secondary)', margin: 0, whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rec.id} · {rec.requesterCategory}
                      </p>
                    </div>
                  </div>
                </td>

                {/* Type */}
                <td style={cellStyle}>{rec.typeName}</td>

                {/* Department */}
                <td style={cellStyle}>{rec.department}</td>

                {/* Requested date/time */}
                <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                  {rec.date && rec.time ? (
                    <>
                      {new Date(rec.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      <span style={{ color: 'var(--color-text-secondary)' }}> · {fmtTime(rec.time)}</span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--color-text-secondary)' }}>No time yet</span>
                  )}
                </td>

                {/* Stage */}
                <td style={cellStyle}>{rec.assignedStage}</td>

                {/* Status */}
                <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                  <StatusChip status={rec.status} wrap />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const cellStyle: React.CSSProperties = {
  padding: '12px 16px',
  verticalAlign: 'middle',
  fontFamily: 'var(--font-sans)',
  fontSize: '14px',
  color: 'var(--color-charcoal)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
