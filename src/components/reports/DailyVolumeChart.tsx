import { useState } from 'react'
import { Table, BarChart2 } from 'lucide-react'
import type { DailyVolume } from '../../data/reportTypes'

interface DailyVolumeChartProps {
  dailyVolume: DailyVolume[]
  total: number
}

interface Bucket {
  key: string
  label: string
  tooltipLabel: string
  count: number
}

// Group into 7-day buckets when daily array exceeds 31 items
function groupVolume(vols: DailyVolume[]): Bucket[] {
  if (vols.length <= 31) {
    return vols.map(v => {
      const d = new Date(v.date + 'T00:00:00')
      const weekday = d.toLocaleDateString('en-IN', { weekday: 'short' })
      const dayMonth = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      const year = d.getFullYear()
      return {
        key: v.date,
        label: dayMonth,
        tooltipLabel: `${weekday} ${dayMonth} ${year}: ${v.count} ${v.count === 1 ? 'appointment' : 'appointments'}`,
        count: v.count,
      }
    })
  }

  // Range > 31 days: Group by 7-day intervals
  const buckets: Bucket[] = []
  for (let i = 0; i < vols.length; i += 7) {
    const chunk = vols.slice(i, i + 7)
    const start = new Date(chunk[0].date + 'T00:00:00')
    const end = new Date(chunk[chunk.length - 1].date + 'T00:00:00')
    const startStr = start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    const endStr = end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    const sum = chunk.reduce((acc, c) => acc + c.count, 0)
    buckets.push({
      key: `${chunk[0].date}_${chunk[chunk.length - 1].date}`,
      label: startStr,
      tooltipLabel: `${startStr} – ${endStr}: ${sum} ${sum === 1 ? 'appointment' : 'appointments'}`,
      count: sum,
    })
  }
  return buckets
}

export default function DailyVolumeChart({ dailyVolume, total }: DailyVolumeChartProps) {
  const [viewAsTable, setViewAsTable] = useState(false)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const buckets = groupVolume(dailyVolume)
  const maxCount = buckets.length > 0 ? Math.max(...buckets.map(b => b.count)) : 0

  // 4 to 5 horizontal integer gridlines
  // Ensure maxY is at least 4 and divisible by 4 for whole integer ticks
  const maxY = Math.max(4, Math.ceil(maxCount / 4) * 4)
  const ticks = [0, maxY * 0.25, maxY * 0.5, maxY * 0.75, maxY]

  // Thin out x labels so they never overlap
  // Aim for roughly 8-10 visible labels maximum
  const step = Math.max(1, Math.ceil(buckets.length / 10))

  return (
    <div className="card" style={{ padding: '1.25rem', marginTop: '1rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '15px', color: 'var(--color-charcoal)', margin: 0 }}>
          Daily volume
        </h2>
        <button
          type="button"
          onClick={() => setViewAsTable(v => !v)}
          className="btn-secondary"
          style={{ fontSize: '12px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          {viewAsTable ? (
            <>
              <BarChart2 size={13} aria-hidden="true" />
              View as chart
            </>
          ) : (
            <>
              <Table size={13} aria-hidden="true" />
              View as table
            </>
          )}
        </button>
      </div>

      {total === 0 || buckets.length === 0 ? (
        <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0 }}>
            No appointments in this range.
          </p>
        </div>
      ) : viewAsTable ? (
        <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-sage)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Date / Period</th>
                <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'right' }}>Appointments</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map(b => (
                <tr key={b.key} style={{ borderBottom: '1px solid var(--color-sage)' }}>
                  <td style={{ padding: '6px 12px', color: 'var(--color-charcoal)' }}>{b.label}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--color-charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                    {b.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative', height: '220px', display: 'flex', flexDirection: 'column' }}>
          {/* Active tooltip overlay */}
          {hoveredIdx !== null && buckets[hoveredIdx] && (
            <div
              role="tooltip"
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'var(--color-charcoal)',
                color: '#ffffff',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 500,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                pointerEvents: 'none',
                zIndex: 10,
                boxShadow: 'var(--elevation-2)',
                whiteSpace: 'nowrap',
              }}
            >
              {buckets[hoveredIdx].tooltipLabel}
            </div>
          )}

          {/* Chart area with Y-axis gridlines and columns */}
          <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: '180px' }}>
            {/* Y axis numbers */}
            <div
              style={{
                width: '32px',
                display: 'flex',
                flexDirection: 'column-reverse',
                justifyContent: 'space-between',
                paddingBottom: '2px',
                paddingRight: '6px',
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                color: 'var(--color-text-secondary)',
                textAlign: 'right',
                userSelect: 'none',
              }}
            >
              {ticks.map(t => (
                <span key={t} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {t}
                </span>
              ))}
            </div>

            {/* Plot area with gridlines */}
            <div
              style={{
                flex: 1,
                position: 'relative',
                display: 'flex',
                alignItems: 'flex-end',
                gap: buckets.length > 20 ? '2px' : '4px',
                borderLeft: '1px solid var(--color-sage)',
                borderBottom: '1px solid var(--color-sage)',
                paddingLeft: '4px',
                paddingRight: '4px',
              }}
            >
              {/* Horizontal gridlines */}
              {ticks.slice(1).map(t => {
                const bottomPct = (t / maxY) * 100
                return (
                  <div
                    key={t}
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: `${bottomPct}%`,
                      borderBottom: '1px solid var(--color-sage)',
                      pointerEvents: 'none',
                      opacity: 0.7,
                    }}
                  />
                )
              })}

              {/* Columns */}
              {buckets.map((b, idx) => {
                const heightPct = maxY === 0 ? 0 : (b.count / maxY) * 100
                const isHovered = hoveredIdx === idx
                return (
                  <div
                    key={b.key}
                    tabIndex={0}
                    role="graphics-symbol"
                    aria-label={b.tooltipLabel}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onFocus={() => setHoveredIdx(idx)}
                    onBlur={() => setHoveredIdx(null)}
                    style={{
                      flex: 1,
                      height: '100%',
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        maxWidth: buckets.length > 20 ? '16px' : '28px',
                        height: b.count === 0 ? '0px' : `${Math.max(4, heightPct)}%`,
                        backgroundColor: isHovered ? 'var(--color-forest)' : 'var(--color-emerald)',
                        borderRadius: '2px 2px 0 0',
                        transition: 'background-color 0.15s ease, height 0.2s ease',
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* X axis labels (thinned) */}
          <div
            style={{
              display: 'flex',
              paddingLeft: '36px',
              paddingRight: '4px',
              marginTop: '6px',
              userSelect: 'none',
            }}
          >
            {buckets.map((b, idx) => {
              const showLabel = idx % step === 0 || idx === buckets.length - 1
              return (
                <div
                  key={b.key}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '10px',
                    color: 'var(--color-text-secondary)',
                    overflow: 'visible',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {showLabel ? b.label : ''}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
