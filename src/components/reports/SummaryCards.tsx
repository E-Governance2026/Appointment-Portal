import { CalendarCheck, CheckCircle, XCircle, UserX, Timer, HelpCircle } from 'lucide-react'
import type { ReportSummary } from '../../data/reportTypes'

interface SummaryCardsProps {
  summary: ReportSummary
}

function formatPct(count: number, total: number): string {
  if (total === 0) return '0.0%'
  const pct = (count / total) * 100
  return `${pct.toFixed(1)}%`
}

function formatDuration(hours: number): string {
  if (!hours || hours <= 0) return '0 min'
  if (hours >= 24) {
    const d = Math.floor(hours / 24)
    const remH = Math.round(hours % 24)
    return remH > 0 ? `${d} d ${remH} h` : `${d} d`
  }
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

function Card({ icon, label, value, sub, color, tooltip }: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  color: string
  tooltip?: string
}) {
  return (
    <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'flex-start',
      gap: '12px', flex: 1, minWidth: '170px' }}>
      <div aria-hidden="true" style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'var(--color-sage)', color, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: '24px',
          color: 'var(--color-charcoal)', margin: 0, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </p>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)',
          margin: '4px 0 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}
          title={tooltip}
        >
          {label}
          {tooltip && (
            <button
              type="button"
              aria-label={tooltip}
              title={tooltip}
              style={{
                cursor: 'help',
                color: 'var(--color-text-secondary)',
                display: 'inline-flex',
                background: 'none',
                border: 'none',
                padding: 0,
                alignItems: 'center',
              }}
            >
              <HelpCircle size={13} aria-hidden="true" />
            </button>
          )}
        </p>
        {sub && (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── SummaryCards ─────────────────────────────────────────────────────────────
export default function SummaryCards({ summary }: SummaryCardsProps) {
  const total = summary.total
  const completed = summary.completedCount ?? summary.statusBreakdown.find(s => s.status === 'completed')?.count ?? 0
  const rejected = summary.rejectedCount ?? summary.statusBreakdown.find(s => s.status === 'rejected')?.count ?? 0
  const notReported = summary.notReportedCount ?? summary.statusBreakdown.find(s => s.status === 'not-reported')?.count ?? 0

  const decidedCount = summary.decidedCount ?? 0
  const avgTurnaround = summary.avgTurnaroundHours ?? 0
  const medianTurnaround = summary.medianTurnaroundHours ?? avgTurnaround

  const avgFormatted = decidedCount > 0 ? formatDuration(avgTurnaround) : 'No data'
  const medianFormatted = formatDuration(medianTurnaround)
  const turnaroundSub = decidedCount > 0
    ? `Median ${medianFormatted}, based on ${decidedCount} decided requests`
    : 'No requests were decided in this range'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
      <Card
        icon={<CalendarCheck size={18} aria-hidden="true" />}
        label="Total appointments"
        value={total}
        sub="in the selected range"
        color="var(--color-forest)"
      />
      <Card
        icon={<CheckCircle size={18} aria-hidden="true" />}
        label="Completed"
        value={completed}
        sub={`${formatPct(completed, total)} of ${total}`}
        color="var(--color-emerald)"
      />
      <Card
        icon={<XCircle size={18} aria-hidden="true" />}
        label="Rejected"
        value={rejected}
        sub={`${formatPct(rejected, total)} of ${total}`}
        color="var(--color-danger)"
      />
      <Card
        icon={<UserX size={18} aria-hidden="true" />}
        label="Not reported"
        value={notReported}
        sub={`${formatPct(notReported, total)} of ${total}`}
        color="var(--color-danger)"
      />
      <Card
        icon={<Timer size={18} aria-hidden="true" />}
        label="Average turnaround"
        value={avgFormatted}
        sub={turnaroundSub}
        color="var(--color-info)"
        tooltip="Time from submission to the first decision."
      />
    </div>
  )
}
