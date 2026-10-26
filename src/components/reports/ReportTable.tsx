import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import StatusChip from '../common/StatusChip'
import Skeleton from '../ui/Skeleton'
import type {
  RegisterRow,
  PendingRow,
  TurnaroundRow,
  ChangeRow,
  TableReportResult,
} from '../../data/reportTypes'

interface ReportTableProps {
  type: 'register' | 'pending' | 'turnaround' | 'changes'
  data?: TableReportResult<RegisterRow | PendingRow | TurnaroundRow | ChangeRow>
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  page: number
  pageSize: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onPageChange: (newPage: number) => void
  onPageSizeChange: (newPageSize: number) => void
  onSortChange: (newSortBy: string) => void
}

function fmtDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

function fmtTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

const tableCellStyle: React.CSSProperties = {
  padding: '12px 16px',
  height: '64px',
  verticalAlign: 'middle',
  fontSize: '13px',
  fontFamily: 'var(--font-sans)',
  color: 'var(--color-charcoal)',
  borderBottom: '1px solid var(--color-sage)',
  fontVariantNumeric: 'tabular-nums',
}

const headerCellStyle: React.CSSProperties = {
  padding: '12px 16px',
  height: '44px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  backgroundColor: 'var(--color-cream)',
  borderBottom: '1px solid var(--color-sage)',
  fontFamily: 'var(--font-sans)',
  whiteSpace: 'nowrap',
}

export default function ReportTable({
  type,
  data,
  isLoading,
  isError,
  onRetry,
  page,
  pageSize,
  sortBy,
  sortOrder,
  onPageChange,
  onPageSizeChange,
  onSortChange,
}: ReportTableProps) {
  if (isError) {
    return (
      <div
        className="card"
        style={{
          padding: '2.5rem',
          textAlign: 'center',
          fontFamily: 'var(--font-sans)',
          color: 'var(--color-text-secondary)',
        }}
      >
        <p style={{ color: 'var(--color-status-rejected)', marginBottom: '1rem', fontWeight: 600 }}>
          Could not load the {type} report.
        </p>
        <button type="button" onClick={onRetry} className="btn-secondary" style={{ fontSize: '13px' }}>
          Retry
        </button>
      </div>
    )
  }

  const rows = (data?.rows ?? []) as (RegisterRow | PendingRow | TurnaroundRow | ChangeRow)[]
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const summary = data?.summary as Record<string, string | number> | undefined

  function renderSortHeader(label: string, field: string) {
    const isCurrent = sortBy === field
    const ariaSort = isCurrent ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined
    return (
      <th style={headerCellStyle} aria-sort={ariaSort}>
        <button
          type="button"
          onClick={() => onSortChange(field)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            font: 'inherit',
            fontWeight: isCurrent ? 700 : 600,
            color: isCurrent ? 'var(--color-forest)' : 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>{label}</span>
          {isCurrent ? (
            sortOrder === 'asc' ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />
          ) : (
            <ArrowUpDown size={12} aria-hidden="true" style={{ opacity: 0.4 }} />
          )}
        </button>
      </th>
    )
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      {/* Turnaround summary cards if applicable */}
      {type === 'turnaround' && summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <div className="card" style={{ padding: '1rem' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>Average turnaround</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-forest)', fontVariantNumeric: 'tabular-nums' }}>{summary.average}</span>
          </div>
          <div className="card" style={{ padding: '1rem' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>Median turnaround</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-forest)', fontVariantNumeric: 'tabular-nums' }}>{summary.median}</span>
          </div>
          <div className="card" style={{ padding: '1rem' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>Longest turnaround</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-forest)', fontVariantNumeric: 'tabular-nums' }}>{summary.longest}</span>
          </div>
          <div className="card" style={{ padding: '1rem' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>Decided requests</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-forest)', fontVariantNumeric: 'tabular-nums' }}>{summary.decidedRequests}</span>
          </div>
        </div>
      )}

      {/* Main Table Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              minWidth: type === 'register' ? '860px' : '720px',
            }}
          >
            <thead>
              {type === 'register' && (
                <tr>
                  {renderSortHeader('Appointment ID', 'id')}
                  {renderSortHeader('Requester', 'requester')}
                  {renderSortHeader('Department', 'department')}
                  {renderSortHeader('Authority', 'authorityName')}
                  {renderSortHeader('Type', 'typeName')}
                  {renderSortHeader('Appointment slot', 'date')}
                  {renderSortHeader('Status', 'status')}
                  {renderSortHeader('Submitted', 'submittedAt')}
                </tr>
              )}

              {type === 'pending' && (
                <tr>
                  {renderSortHeader('Appointment ID', 'id')}
                  {renderSortHeader('Requester', 'requester')}
                  {renderSortHeader('Type', 'typeName')}
                  {renderSortHeader('Authority', 'authorityName')}
                  {renderSortHeader('Submitted', 'submittedAt')}
                  {renderSortHeader('Waiting time', 'waitingTime')}
                  {renderSortHeader('Status', 'status')}
                </tr>
              )}

              {type === 'turnaround' && (
                <tr>
                  {renderSortHeader('Appointment ID', 'id')}
                  {renderSortHeader('Type', 'typeName')}
                  {renderSortHeader('Authority', 'authorityName')}
                  {renderSortHeader('Submitted', 'submittedAt')}
                  {renderSortHeader('Decided', 'decidedAt')}
                  {renderSortHeader('Decision', 'decision')}
                  {renderSortHeader('Time to decide', 'durationHours')}
                  <th style={headerCellStyle}>Decided by</th>
                </tr>
              )}

              {type === 'changes' && (
                <tr>
                  {renderSortHeader('Appointment ID', 'id')}
                  {renderSortHeader('Type', 'typeName')}
                  {renderSortHeader('Change', 'change')}
                  <th style={headerCellStyle}>Initiated by</th>
                  <th style={headerCellStyle}>Original slot</th>
                  <th style={headerCellStyle}>New slot</th>
                  <th style={headerCellStyle}>Reason</th>
                  {renderSortHeader('Changed on', 'changedOn')}
                </tr>
              )}
            </thead>

            <tbody>
              {isLoading ? (
                Array.from({ length: pageSize > 10 ? 10 : pageSize }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} style={{ ...tableCellStyle, padding: '16px' }}>
                      <Skeleton height={20} />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      ...tableCellStyle,
                      textAlign: 'center',
                      padding: '3rem 1rem',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    No records match the current filters.
                  </td>
                </tr>
              ) : (
                rows.map(row => {
                  if (type === 'register') {
                    const r = row as RegisterRow
                    return (
                      <tr key={r.id} className="table-row-hover">
                        <td style={{ ...tableCellStyle, fontWeight: 600 }}>{r.id}</td>
                        <td style={tableCellStyle}>
                          <div style={{ fontWeight: 500 }}>{r.requester}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{r.requesterCategory}</div>
                        </td>
                        <td style={tableCellStyle}>{r.department}</td>
                        <td style={tableCellStyle}>{r.authorityName}</td>
                        <td style={tableCellStyle}>{r.typeName}</td>
                        <td style={tableCellStyle}>
                          {r.date ? (
                            <div>
                              <div>{fmtDate(r.date)}</div>
                              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{r.time || 'Time unspecified'}</div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-text-secondary)' }}>Not scheduled</span>
                          )}
                        </td>
                        <td style={tableCellStyle}>
                          <StatusChip status={r.status} />
                        </td>
                        <td style={tableCellStyle}>
                          <div>{fmtDate(r.submittedAt)}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{fmtTime(r.submittedAt)}</div>
                        </td>
                      </tr>
                    )
                  }

                  if (type === 'pending') {
                    const p = row as PendingRow
                    const isLongWait = p.waitingTimeHours >= 48
                    return (
                      <tr key={p.id}>
                        <td style={{ ...tableCellStyle, fontWeight: 600 }}>{p.id}</td>
                        <td style={tableCellStyle}>{p.requester}</td>
                        <td style={tableCellStyle}>{p.typeName}</td>
                        <td style={tableCellStyle}>{p.authorityName}</td>
                        <td style={tableCellStyle}>
                          <div>{fmtDate(p.submittedAt)}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{fmtTime(p.submittedAt)}</div>
                        </td>
                        <td style={tableCellStyle}>
                          <span
                            style={{
                              fontWeight: isLongWait ? 700 : 500,
                              color: isLongWait ? 'var(--color-amber)' : 'inherit',
                            }}
                          >
                            {p.waitingTime}
                          </span>
                        </td>
                        <td style={tableCellStyle}>
                          <StatusChip status={p.status} />
                        </td>
                      </tr>
                    )
                  }

                  if (type === 'turnaround') {
                    const t = row as TurnaroundRow
                    return (
                      <tr key={t.id}>
                        <td style={{ ...tableCellStyle, fontWeight: 600 }}>{t.id}</td>
                        <td style={tableCellStyle}>{t.typeName}</td>
                        <td style={tableCellStyle}>{t.authorityName}</td>
                        <td style={tableCellStyle}>
                          <div>{fmtDate(t.submittedAt)}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{fmtTime(t.submittedAt)}</div>
                        </td>
                        <td style={tableCellStyle}>
                          <div>{fmtDate(t.decidedAt)}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{fmtTime(t.decidedAt)}</div>
                        </td>
                        <td style={tableCellStyle}>
                          <StatusChip status={t.decision} />
                        </td>
                        <td style={{ ...tableCellStyle, fontWeight: 600 }}>{t.timeToDecide}</td>
                        <td style={tableCellStyle}>{t.decidedBy}</td>
                      </tr>
                    )
                  }

                  if (type === 'changes') {
                    const c = row as ChangeRow
                    return (
                      <tr key={`${c.id}-${c.changedOn}`}>
                        <td style={{ ...tableCellStyle, fontWeight: 600 }}>{c.id}</td>
                        <td style={tableCellStyle}>{c.typeName}</td>
                        <td style={tableCellStyle}>
                          <span
                            className="badge"
                            style={{
                              fontWeight: 600,
                              color: c.change === 'Cancelled' ? 'var(--color-status-rejected)' : 'var(--color-forest)',
                            }}
                          >
                            {c.change}
                          </span>
                        </td>
                        <td style={tableCellStyle}>{c.initiatedBy}</td>
                        <td style={tableCellStyle}>{c.originalTime}</td>
                        <td style={tableCellStyle}>{c.newTime}</td>
                        <td style={{ ...tableCellStyle, maxWidth: '200px', whiteSpace: 'normal' }}>{c.reason}</td>
                        <td style={tableCellStyle}>
                          <div>{fmtDate(c.changedOn)}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{fmtTime(c.changedOn)}</div>
                        </td>
                      </tr>
                    )
                  }

                  return null
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-side Pagination footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '12px 16px',
            borderTop: '1px solid var(--color-sage)',
            backgroundColor: '#ffffff',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Rows per page:</span>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              style={{
                fontSize: '13px',
                height: '32px',
                padding: '0 6px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-sage)',
                backgroundColor: '#ffffff',
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span style={{ marginLeft: '8px', fontVariantNumeric: 'tabular-nums' }}>
              Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{
                fontSize: '12px',
                padding: '6px 12px',
                minHeight: '36px',
                cursor: page > 1 ? 'pointer' : 'not-allowed',
                opacity: page > 1 ? 1 : 0.5,
              }}
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </button>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn-secondary"
              style={{
                fontSize: '12px',
                padding: '6px 12px',
                minHeight: '36px',
                cursor: page < totalPages ? 'pointer' : 'not-allowed',
                opacity: page < totalPages ? 1 : 0.5,
              }}
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
