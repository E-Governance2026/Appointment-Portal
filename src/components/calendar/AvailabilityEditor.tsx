import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, Loader2 } from 'lucide-react'
import { useAvailability, useUpdateAvailability } from '../../hooks/useCalendar'
import {
  WEEKDAY_LABELS, type Availability, type Weekday, type Holiday,
} from '../../data/availabilityData'

interface AvailabilityEditorProps {
  authorityId: string
  authorityName: string
}

// ─── AvailabilityEditor ───────────────────────────────────────────────────────
// Edits working hours, slot length and holidays for one authority.
// Rendered only for roles with calendar.manageOwn / calendar.manageAny
// (gated by the parent). The service re-checks permission on save.
export default function AvailabilityEditor({ authorityId, authorityName }: AvailabilityEditorProps) {
  const { data: loaded, isLoading } = useAvailability(authorityId)
  const update = useUpdateAvailability()

  const [draft, setDraft] = useState<Availability | null>(null)
  const [banner, setBanner] = useState('')
  const [saved, setSaved] = useState(false)

  // Load the fetched config into the editable draft.
  useEffect(() => {
    if (loaded) {
      setDraft({
        ...loaded,
        workingHours: loaded.workingHours.map(w => ({ ...w })),
        holidays:     loaded.holidays.map(h => ({ ...h })),
      })
    }
  }, [loaded])

  if (isLoading || !draft) {
    return <p style={muted}>Loading availability...</p>
  }

  function setDay(weekday: Weekday, patch: Partial<{ enabled: boolean; start: string; end: string }>) {
    setDraft(d => d ? {
      ...d,
      workingHours: d.workingHours.map(w => w.weekday === weekday ? { ...w, ...patch } : w),
    } : d)
    setSaved(false)
  }

  function addHoliday() {
    setDraft(d => d ? { ...d, holidays: [...d.holidays, { date: '', label: '' }] } : d)
    setSaved(false)
  }

  function setHoliday(idx: number, patch: Partial<Holiday>) {
    setDraft(d => d ? {
      ...d,
      holidays: d.holidays.map((h, i) => i === idx ? { ...h, ...patch } : h),
    } : d)
    setSaved(false)
  }

  function removeHoliday(idx: number) {
    setDraft(d => d ? { ...d, holidays: d.holidays.filter((_, i) => i !== idx) } : d)
    setSaved(false)
  }

  function handleSave() {
    if (!draft) return
    setBanner('')
    // Drop empty holiday rows before saving.
    const cleaned: Availability = {
      ...draft,
      holidays: draft.holidays.filter(h => h.date.trim()),
    }
    update.mutate(cleaned, {
      onSuccess: () => { setSaved(true); setBanner('') },
      onError: (e) => setBanner(e instanceof Error ? e.message : 'Could not save availability.'),
    })
  }

  // Ordered Monday..Sunday for display.
  const orderedDays: Weekday[] = [1, 2, 3, 4, 5, 6, 0]

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '16px',
        color: 'var(--color-charcoal)', margin: '0 0 0.25rem 0' }}>
        Availability
      </h2>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 1rem 0' }}>
        Working hours, slot length and holidays for {authorityName}.
      </p>

      {banner && (
        <div role="alert" style={{ padding: '10px 14px', backgroundColor: '#fce8e6',
          border: '1px solid #f5c6c4', borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#7d1c18', marginBottom: '1rem' }}>
          {banner}
        </div>
      )}
      {saved && !banner && (
        <div role="status" style={{ padding: '10px 14px', backgroundColor: '#DCEFE9',
          border: '1px solid #bfe0d5', borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#0B5F4F', marginBottom: '1rem' }}>
          Availability saved.
        </div>
      )}

      {/* Slot length */}
      <div style={{ marginBottom: '1.25rem' }}>
        <label htmlFor="slot-minutes" style={fieldLabel}>Slot length (minutes)</label>
        <input
          id="slot-minutes"
          type="number"
          min={5}
          step={5}
          value={draft.slotMinutes}
          onChange={e => { setDraft(d => d ? { ...d, slotMinutes: Number(e.target.value) } : d); setSaved(false) }}
          className="input"
          style={{ maxWidth: '140px' }}
        />
      </div>

      {/* Working hours */}
      <h3 style={sectionTitle}>Working hours</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1.25rem' }}>
        {orderedDays.map(wd => {
          const w = draft.workingHours.find(x => x.weekday === wd)!
          return (
            <div key={wd} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '150px', flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={w.enabled}
                  onChange={e => setDay(wd, { enabled: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--color-forest)' }}
                />
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-charcoal)' }}>
                  {WEEKDAY_LABELS[wd]}
                </span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: w.enabled ? 1 : 0.5 }}>
                <input
                  type="time"
                  value={w.start}
                  disabled={!w.enabled}
                  onChange={e => setDay(wd, { start: e.target.value })}
                  className="input"
                  style={{ width: 'auto' }}
                  aria-label={`${WEEKDAY_LABELS[wd]} start time`}
                />
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>to</span>
                <input
                  type="time"
                  value={w.end}
                  disabled={!w.enabled}
                  onChange={e => setDay(wd, { end: e.target.value })}
                  className="input"
                  style={{ width: 'auto' }}
                  aria-label={`${WEEKDAY_LABELS[wd]} end time`}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Holidays */}
      <h3 style={sectionTitle}>Holidays</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '0.75rem' }}>
        {draft.holidays.length === 0 && (
          <p style={muted}>No holidays added.</p>
        )}
        {draft.holidays.map((h, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="date"
              value={h.date}
              onChange={e => setHoliday(idx, { date: e.target.value })}
              className="input"
              style={{ width: 'auto' }}
              aria-label={`Holiday ${idx + 1} date`}
            />
            <input
              type="text"
              value={h.label}
              onChange={e => setHoliday(idx, { label: e.target.value })}
              placeholder="Label (optional)"
              className="input"
              style={{ flex: 1, minWidth: '160px' }}
              aria-label={`Holiday ${idx + 1} label`}
            />
            <button
              onClick={() => removeHoliday(idx)}
              aria-label={`Remove holiday ${idx + 1}`}
              className="btn-secondary"
              style={{ padding: '0.4rem', fontSize: '13px' }}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <button onClick={addHoliday} className="btn-secondary" style={{ fontSize: '13px', marginBottom: '1.25rem' }}>
        <Plus size={14} aria-hidden="true" /> Add holiday
      </button>

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-sage)', paddingTop: '1rem' }}>
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className="btn-primary"
          style={{ fontSize: '14px', minWidth: '140px', justifyContent: 'center',
            opacity: update.isPending ? 0.7 : 1 }}
        >
          {update.isPending ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
          {update.isPending ? 'Saving...' : 'Save availability'}
        </button>
      </div>

      <style>{`
        .spin { animation: av-spin 0.8s linear infinite; }
        @keyframes av-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

const muted: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0,
}
const fieldLabel: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: '14px',
  color: 'var(--color-charcoal)', marginBottom: '0.3rem',
}
const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600,
  color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em',
  margin: '0 0 0.75rem 0',
}
