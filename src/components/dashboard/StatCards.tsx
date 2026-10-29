import { useNavigate } from 'react-router-dom'
import { Calendar, Clock, CheckCircle2, CalendarDays } from 'lucide-react'
import { useDashboardStats } from '../../hooks/useDashboard'
import Card from '../ui/Card'
import Skeleton from '../ui/Skeleton'

// ─── StatCards ────────────────────────────────────────────────────────────────
// Interactive cards that link to a filtered list. 40px icon tile, count in
// Source Serif 4 32px (tabular), 14px secondary label. Hover/focus come only
// from the shared .card-interactive CSS, so no card can get stuck with a shadow.
interface CardDef {
  label: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  getValue: (s: ReturnType<typeof useDashboardStats>['data']) => number
  filterPath: string
}

const CARDS: CardDef[] = [
  { label: 'Total appointments',   icon: <Calendar size={20} aria-hidden="true" />,     iconBg: 'rgb(7 59 53 / 0.08)',    iconColor: 'var(--color-forest)',  getValue: s => s?.total ?? 0,            filterPath: '/my-appointments' },
  { label: 'Awaiting approval',    icon: <Clock size={20} aria-hidden="true" />,        iconBg: 'rgb(244 163 64 / 0.16)', iconColor: '#8A5200',              getValue: s => s?.awaitingApproval ?? 0, filterPath: '/approvals' },
  { label: 'Confirmed',            icon: <CheckCircle2 size={20} aria-hidden="true" />, iconBg: 'rgb(15 128 107 / 0.1)',  iconColor: 'var(--color-emerald)', getValue: s => s?.confirmed ?? 0,        filterPath: '/my-appointments' },
  { label: "Today's appointments", icon: <CalendarDays size={20} aria-hidden="true" />, iconBg: 'rgb(31 95 166 / 0.1)',   iconColor: 'var(--color-info)',    getValue: s => s?.todayCount ?? 0,       filterPath: '/my-appointments' },
]

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="stat-grid">
      {children}
      <style>{`
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-3);
          width: 100%;
          box-sizing: border-box;
          min-width: 0;
        }
        @media (max-width: 360px) {
          .stat-grid { grid-template-columns: 1fr; }
        }
        @media (min-width: 640px)  {
          .stat-grid { grid-template-columns: repeat(2, 1fr); gap: var(--space-4); }
        }
        @media (min-width: 1024px) {
          .stat-grid { grid-template-columns: repeat(4, 1fr); gap: var(--space-4); }
        }
      `}</style>
    </div>
  )
}

export default function StatCards() {
  const navigate = useNavigate()
  const { data: stats, isLoading, isError } = useDashboardStats()

  if (isLoading) {
    return (
      <Grid>
        {[0, 1, 2, 3].map(i => (
          <Card key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Skeleton width={40} height={40} radius="var(--radius-md)" />
            <Skeleton width="50%" height={32} />
            <Skeleton width="75%" height={14} />
          </Card>
        ))}
      </Grid>
    )
  }

  if (isError) {
    return (
      <div role="alert" style={{ padding: 'var(--space-4)', backgroundColor: '#fce8e6',
        border: '1px solid #f5c6c4', borderRadius: 'var(--radius-lg)',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: '#7d1c18',
        width: '100%', boxSizing: 'border-box', wordBreak: 'break-word' }}>
        Could not load statistics. Refresh the page to try again.
      </div>
    )
  }

  return (
    <Grid>
      {CARDS.map(card => (
        <Card
          key={card.label}
          interactive
          role="link"
          tabIndex={0}
          onClick={() => navigate(card.filterPath)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(card.filterPath) } }}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
        >
          <div aria-hidden="true" style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)',
            backgroundColor: card.iconBg, color: card.iconColor, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {card.icon}
          </div>
          <p className="tnum" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600,
            fontSize: 'var(--text-4xl)', lineHeight: 1, color: 'var(--color-charcoal)', margin: 0 }}>
            {card.getValue(stats)}
          </p>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 500,
            color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.4 }}>
            {card.label}
          </p>
        </Card>
      ))}
    </Grid>
  )
}
