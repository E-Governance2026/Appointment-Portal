import { useState } from 'react'
import type { ReportSummary, GroupCount, StatusBreakdown } from '../../data/reportTypes'
import type { AppointmentStatus } from '../../data/mockAppointments'
import DailyVolumeChart from './DailyVolumeChart'

interface BreakdownBarsProps {
  summary: ReportSummary
}

// Status color family, consistent with StatusChip / tokens
function statusColor(status: AppointmentStatus): string {
  switch (status) {
    case 'approved':
    case 'confirmed':
    case 'completed':
      return 'var(--color-emerald)'
    case 'submitted':
    case 'additional-info':
      return 'var(--color-amber)'
    case 'rescheduled':
      return 'var(--color-info)'
    case 'rejected':
      return 'var(--color-danger)'
    case 'not-reported':
    case 'cancelled':
      return 'var(--color-charcoal)'
    default:
      return 'var(--color-text-secondary)'
  }
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '15px',
        color: 'var(--color-charcoal)', margin: '0 0 1rem 0' }}>
        {title}
      </h2>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}

// A single labelled bar row with wrapping label and count + one-decimal percentage
function BarRow({
  label,
  count,
  total,
  max,
  color,
}: {
  label: string
  count: number
  total: number
  max: number
  color: string
}) {
  const widthPct = max === 0 ? 0 : Math.round((count / max) * 100)
  const pctStr = total === 0 ? '0.0%' : `${((count / total) * 100).toFixed(1)}%`
  const displayLabel = (label && label.trim().length > 0) ? label.trim() : 'Unspecified'

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-charcoal)', wordBreak: 'break-word', lineHeight: 1.3 }}>
          {displayLabel}
        </span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600,
          color: 'var(--color-charcoal)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {count}{' '}
          <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)', fontSize: '12px' }}>
            ({pctStr})
          </span>
        </span>
      </div>
      <div
        role="img"
        aria-label={`${displayLabel}: ${count} (${pctStr})`}
        style={{ height: '8px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-sage)', overflow: 'hidden' }}
      >
        <div style={{ width: `${widthPct}%`, height: '100%', backgroundColor: color,
          borderRadius: 'var(--radius-sm)', transition: 'width 0.2s ease' }} />
      </div>
    </div>
  )
}

function GroupBars({ groups, total }: { groups: GroupCount[]; total: number }) {
  const [expanded, setExpanded] = useState(false)
  if (groups.length === 0) return <Empty />

  const max = Math.max(...groups.map(g => g.count))
  const visibleGroups = expanded ? groups : groups.slice(0, 6)
  const hasMore = groups.length > 6

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1 }}>
        {visibleGroups.map(g => (
          <BarRow
            key={g.key || g.label}
            label={g.label}
            count={g.count}
            total={total}
            max={max}
            color="var(--color-forest)"
          />
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          style={{
            alignSelf: 'flex-start',
            marginTop: '4px',
            background: 'none',
            border: 'none',
            padding: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--color-emerald)',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          {expanded ? 'Show fewer' : `Show all ${groups.length}`}
        </button>
      )}
    </div>
  )
}

function StatusBars({ items, total }: { items: StatusBreakdown[]; total: number }) {
  if (items.length === 0) return <Empty />
  const max = Math.max(...items.map(i => i.count))

  return (
    <div>
      {items.map(i => (
        <BarRow
          key={i.status}
          label={i.label}
          count={i.count}
          total={total}
          max={max}
          color={statusColor(i.status)}
        />
      ))}
    </div>
  )
}

function Empty() {
  return (
    <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0 }}>
      No data for the selected filters.
    </p>
  )
}

// ─── BreakdownBars ────────────────────────────────────────────────────────────
export default function BreakdownBars({ summary }: BreakdownBarsProps) {
  const total = summary.total

  return (
    <div>
      {/* 2x2 grid on desktop with equal height cards in each row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: '1rem', alignItems: 'stretch' }}>
        <Panel title="By status">
          <StatusBars items={summary.statusBreakdown} total={total} />
        </Panel>
        <Panel title="By department">
          <GroupBars groups={summary.byDepartment} total={total} />
        </Panel>
        <Panel title="By authority">
          <GroupBars groups={summary.byAuthority} total={total} />
        </Panel>
        <Panel title="By appointment type">
          <GroupBars groups={summary.byType} total={total} />
        </Panel>
      </div>

      {/* Full-width daily volume column chart */}
      <DailyVolumeChart dailyVolume={summary.dailyVolume} total={total} />
    </div>
  )
}
