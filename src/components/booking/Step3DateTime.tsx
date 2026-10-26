import { AlertCircle } from 'lucide-react'
import { useBookingStore } from '../../store/bookingStore'

// ─── 30-minute slots 09:00–17:00 ──────────────────────────────────────────────
const SLOTS: string[] = []
for (let h = 9; h < 17; h++) {
  SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}

function fmt(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suf = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suf}`
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Step 2: Date and time (optional) ─────────────────────────────────────────
export default function Step3DateTime() {
  const date     = useBookingStore(s => s.date)
  const time     = useBookingStore(s => s.time)
  const errors   = useBookingStore(s => s.stepErrors[2])
  const setDate  = useBookingStore(s => s.setDate)
  const setTime  = useBookingStore(s => s.setTime)

  const authorityLabel = useBookingStore(s => {
    const id = s.authorityId
    const opts: { authorityId: string; label: string }[] = [
      { authorityId: 'auth-vm', label: 'the department' },
      { authorityId: 'auth-ss', label: 'Shivendra sir' },
      { authorityId: 'auth-ap', label: 'Jaimeel sir' },
    ]
    return opts.find(o => o.authorityId === id)?.label ?? 'the authority'
  })

  function clear() { setDate(''); setTime('') }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Optional banner */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', padding: '12px 14px', backgroundColor: 'var(--color-cream)',
        border: '1px solid var(--color-sage)', borderRadius: 'var(--radius-md)' }}>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px',
          color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
          Choosing a date and time is optional. Leave it blank and{' '}
          <strong>{authorityLabel}</strong> will propose a time when they review your request.
        </p>
        {(date || time) && (
          <button type="button" onClick={clear}
            style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600,
              color: 'var(--color-forest)', background: 'none', border: 'none',
              cursor: 'pointer', flexShrink: 0, padding: '4px 8px',
              borderRadius: 'var(--radius-sm)' }}>
            Let {authorityLabel} propose a time
          </button>
        )}
      </div>

      {/* Validation error */}
      {(errors.date || errors.time) && (
        <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px',
          padding: '10px 14px', backgroundColor: '#fce8e6',
          border: '1px solid #f5c6c4', borderRadius: '8px' }}>
          <AlertCircle size={15} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#7d1c18', margin: 0 }}>
            {errors.date || errors.time}
          </p>
        </div>
      )}

      {/* Date + time grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}
        className="step3-grid">

        {/* ── Preferred date ── */}
        <div>
          <label htmlFor="pref-date" style={{ display: 'block', fontFamily: 'var(--font-sans)',
            fontWeight: 500, fontSize: '14px', color: 'var(--color-charcoal)',
            marginBottom: '6px' }}>
            Preferred date <span style={{ color: 'var(--color-text-secondary)',
              fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="pref-date"
            type="date"
            value={date}
            min={todayISO()}
            onChange={e => { setDate(e.target.value); if (!e.target.value) setTime('') }}
            className="input"
            style={{ width: '100%' }}
          />
          {date && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px',
              color: 'var(--color-text-secondary)', margin: '4px 0 0 0' }}>
              {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          )}
        </div>

        {/* ── Preferred time — 30-min slots ── */}
        <div>
          <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: '14px',
            color: 'var(--color-charcoal)', margin: '0 0 6px 0' }}>
            Preferred time <span style={{ color: 'var(--color-text-secondary)',
              fontWeight: 400 }}>(optional)</span>
          </p>

          {!date ? (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px',
              color: 'var(--color-text-secondary)', margin: 0 }}>
              Select a date first to choose a time slot.
            </p>
          ) : (
            <div role="radiogroup" aria-label="Preferred time slot"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {SLOTS.map(slot => {
                const selected = slot === time
                return (
                  <button
                    key={slot}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTime(selected ? '' : slot)}
                    style={{
                      height: '40px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '13px',
                      fontWeight: selected ? 700 : 500,
                      border: `1.5px solid ${selected ? 'var(--color-forest)' : 'var(--color-sage)'}`,
                      borderRadius: '6px',
                      backgroundColor: selected ? 'var(--color-forest)' : 'var(--color-ivory)',
                      color: selected ? '#ffffff' : 'var(--color-charcoal)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (!selected) e.currentTarget.style.backgroundColor = 'var(--color-sage)' }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.backgroundColor = 'var(--color-ivory)' }}
                    onFocus={e => { e.currentTarget.style.outline = '2px solid var(--color-emerald)' }}
                    onBlur={e  => { e.currentTarget.style.outline = 'none' }}
                  >
                    {fmt(slot)}
                  </button>
                )
              })}
            </div>
          )}

          {date && time && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px',
              color: 'var(--color-text-secondary)', marginTop: '8px' }}>
              Selecting a slot is a preference, not a confirmation.
              {authorityLabel !== 'the authority' ? ` ${authorityLabel} ` : ' The authority '}
              must still approve your request.
            </p>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 767px) {
          .step3-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
