import type { ReportFilters as Filters } from '../../data/reportTypes'
import type { AppointmentStatus } from '../../data/mockAppointments'
import { STATUS_CONFIG } from '../../data/mockAppointments'

interface Option { value: string; label: string }

interface ReportFiltersProps {
  filters:     Filters
  departments: Option[]
  authorities: Option[]
  onChange:    (next: Filters) => void
  onClear:     () => void
}

// Statuses offered in the filter dropdown (exclude 'draft' — never reported on).
const STATUS_OPTIONS: AppointmentStatus[] = [
  'submitted', 'additional-info', 'approved', 'confirmed',
  'rescheduled', 'completed', 'cancelled', 'rejected', 'not-reported',
]

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '0.25rem', display: 'block',
}

// ─── ReportFilters ────────────────────────────────────────────────────────────
export default function ReportFilters({ filters, departments, authorities, onChange, onClear }: ReportFiltersProps) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  const hasOptional = !!(filters.department || filters.authorityId || filters.status)

  return (
    <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
        <div>
          <label htmlFor="rep-from" style={labelStyle}>From</label>
          <input id="rep-from" type="date" value={filters.from} className="input"
            style={{ width: 'auto', fontSize: '13px' }}
            onChange={e => set({ from: e.target.value })} />
        </div>
        <div>
          <label htmlFor="rep-to" style={labelStyle}>To</label>
          <input id="rep-to" type="date" value={filters.to} className="input"
            style={{ width: 'auto', fontSize: '13px' }}
            onChange={e => set({ to: e.target.value })} />
        </div>

        <div>
          <label htmlFor="rep-dept" style={labelStyle}>Department</label>
          <select id="rep-dept" value={filters.department ?? ''} className="input"
            style={{ width: 'auto', fontSize: '13px' }}
            onChange={e => set({ department: e.target.value || undefined })}>
            <option value="">All departments</option>
            {departments.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="rep-auth" style={labelStyle}>Authority</label>
          <select id="rep-auth" value={filters.authorityId ?? ''} className="input"
            style={{ width: 'auto', fontSize: '13px' }}
            onChange={e => set({ authorityId: e.target.value || undefined })}>
            <option value="">All authorities</option>
            {authorities.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="rep-status" style={labelStyle}>Status</label>
          <select id="rep-status" value={filters.status ?? ''} className="input"
            style={{ width: 'auto', fontSize: '13px' }}
            onChange={e => set({ status: (e.target.value || undefined) as AppointmentStatus | undefined })}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
          </select>
        </div>

        {hasOptional && (
          <button onClick={onClear} className="btn-secondary" style={{ fontSize: '13px' }}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
