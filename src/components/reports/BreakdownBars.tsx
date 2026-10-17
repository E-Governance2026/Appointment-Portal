import type { ReportSummary, GroupCount, StatusBreakdown } from '../../data/reportTypes'
import type { AppointmentStatus } from '../../data/mockAppointments'

interface BreakdownBarsProps {
  summary: ReportSummary
}

// Status color family, consistent with StatusChip / calendar.
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
    case 'not-reported':
      return 'var(--color-danger)'
    default:
      return 'var(--color-text-secondary)'
  }
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '15px',
        color: 'var(--color-charcoal)', margin: '0 0 1rem 0' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

// A single labelled bar row.
function BarRow({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const widthPct = max === 0 ? 0 : Math.round((count / max) * 100)
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-charcoal)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600,
          color: 'var(--color-charcoal)', flexShrink: 0 }}>
          {count}
        </span>
      </div>
      <div
        role="img"
        aria-label={`${label}: ${count}`}
        style={{ height: '8px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-sage)', overflow: 'hidden' }}
      >
        <div style={{ width: `${widthPct}%`, height: '100%', backgroundColor: color,
          borderRadius: 'var(--radius-sm)', transition: 'width 0.2s ease' }} />
      </div>
    </div>
  )
}

function GroupBars({ groups }: { groups: GroupCount[] }) {
  if (groups.length === 0) return <Empty />
  const max = Math.max(...groups.map(g => g.count))
  return (
    <div>
      {groups.map(g => (
        <BarRow key={g.key} label={g.label} count={g.count} max={max} color="var(--color-forest)" />
      ))}
    </div>
  )
}

function StatusBars({ items }: { items: StatusBreakdown[] }) {
  if (items.length === 0) return <Empty />
  const max = Math.max(...items.map(i => i.count))
  return (
    <div>
      {items.map(i => (
        <BarRow key={i.status} label={i.label} count={i.count} max={max} color={statusColor(i.status)} />
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

// Daily volume as a compact column strip with an accessible data fallback.
function DailyVolume({ summary }: { summary: ReportSummary }) {
  const vols = summary.dailyVolume
  if (vols.length === 0) return <Empty />
  const max = Math.max(...vols.map(v => v.count))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '120px', overflowX: 'auto', paddingBottom: '4px' }}>
        {vols.map(v => {
          const h = max === 0 ? 0 : Math.max(4, Math.round((v.count / max) * 100))
          const d = new Date(v.date + 'T00:00:00')
          return (
            <div key={v.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '28px' }}>
              <div
                role="img"
                aria-label={`${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}: ${v.count}`}
                style={{ width: '20px', height: `${h}%`, backgroundColor: 'var(--color-emerald)',
                  borderRadius: 'var(--radius-sm)' }}
              />
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── BreakdownBars ────────────────────────────────────────────────────────────
export default function BreakdownBars({ summary }: BreakdownBarsProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1rem' }}>
      <Panel title="By status"><StatusBars items={summary.statusBreakdown} /></Panel>
      <Panel title="By department"><GroupBars groups={summary.byDepartment} /></Panel>
      <Panel title="By authority"><GroupBars groups={summary.byAuthority} /></Panel>
      <Panel title="By appointment type"><GroupBars groups={summary.byType} /></Panel>
      <Panel title="Daily volume"><DailyVolume summary={summary} /></Panel>
    </div>
  )
}
