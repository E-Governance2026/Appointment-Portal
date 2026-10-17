import { CalendarCheck, CheckCircle, XCircle, UserX, Timer } from 'lucide-react'
import type { ReportSummary } from '../../data/reportTypes'

interface SummaryCardsProps {
  summary: ReportSummary
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

function Card({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string
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
        <p style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: '22px',
          color: 'var(--color-charcoal)', margin: 0, lineHeight: 1 }}>
          {value}
        </p>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)', margin: '4px 0 0 0' }}>
          {label}
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
  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
      <Card
        icon={<CalendarCheck size={18} aria-hidden="true" />}
        label="Total appointments"
        value={String(summary.total)}
        color="var(--color-forest)"
      />
      <Card
        icon={<CheckCircle size={18} aria-hidden="true" />}
        label="Completed"
        value={pct(summary.completionRate)}
        sub="of total"
        color="var(--color-emerald)"
      />
      <Card
        icon={<XCircle size={18} aria-hidden="true" />}
        label="Rejected"
        value={pct(summary.rejectionRate)}
        sub="of total"
        color="var(--color-danger)"
      />
      <Card
        icon={<UserX size={18} aria-hidden="true" />}
        label="Not reported"
        value={pct(summary.noShowRate)}
        sub="of total"
        color="var(--color-danger)"
      />
      <Card
        icon={<Timer size={18} aria-hidden="true" />}
        label="Average turnaround"
        value={summary.avgTurnaroundHours > 0 ? `${summary.avgTurnaroundHours} h` : 'n/a'}
        sub="submission to decision"
        color="var(--color-info)"
      />
    </div>
  )
}
