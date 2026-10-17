import { useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLocations } from '../../data/bookingApi'
import { APPOINTMENT_TYPES, MOCK_REQUESTER } from '../../data/bookingSeeds'
import { PURPOSES } from '../../data/bookingSeeds'
import { useBookingStore } from '../../store/bookingStore'

const MODES = [
  { value: 'physical', label: 'Physical', desc: 'In-person meeting at a university location' },
  { value: 'online',   label: 'Online',   desc: 'Video or online call'                      },
  { value: 'phone',    label: 'Phone',    desc: 'Phone call'                                },
] as const

// ─── Character counter ────────────────────────────────────────────────────────
function CharCount({ current, max }: { current: number; max: number }) {
  const near = current > max * 0.85
  return (
    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px',
      color: near ? (current > max ? 'var(--color-danger)' : 'var(--color-amber)') : 'var(--color-text-secondary)',
      float: 'right' }}>
      {current}/{max}
    </span>
  )
}

// ─── Read-only field ──────────────────────────────────────────────────────────
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 2px 0' }}>{label}</p>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', color: 'var(--color-charcoal)', margin: 0, fontWeight: 500 }}>{value}</p>
    </div>
  )
}

// ─── Step 4 ───────────────────────────────────────────────────────────────────
export default function Step4Details() {
  const subjectId     = useId()
  const descId        = useId()
  const modeId        = useId()
  const locationId    = useId()
  const participantId = useId()
  const refId         = useId()

  const typeId              = useBookingStore(s => s.typeId)
  const purposeId           = useBookingStore(s => s.purposeId)
  const subject             = useBookingStore(s => s.subject)
  const description         = useBookingStore(s => s.description)
  const mode                = useBookingStore(s => s.mode)
  const locId               = useBookingStore(s => s.locationId)
  const participantCount    = useBookingStore(s => s.participantCount)
  const supportingReference = useBookingStore(s => s.supportingReference)
  const errors              = useBookingStore(s => s.stepErrors[3])
  const setSubject             = useBookingStore(s => s.setSubject)
  const setDescription         = useBookingStore(s => s.setDescription)
  const setMode                = useBookingStore(s => s.setMode)
  const setLocationId          = useBookingStore(s => s.setLocationId)
  const setParticipantCount    = useBookingStore(s => s.setParticipantCount)
  const setSupportingReference = useBookingStore(s => s.setSupportingReference)
  const goToStep               = useBookingStore(s => s.goToStep)

  const typeConfig = APPOINTMENT_TYPES.find(t => t.id === typeId)
  const purposeLabel = PURPOSES.find(p => p.id === purposeId)?.label ?? ''

  const { data: locations = [] } = useQuery({
    queryKey: ['booking-locations'],
    queryFn:  () => fetchLocations(),
  })

  function error(field: string) {
    const msg = errors[field]
    return msg
      ? <p role="alert" id={`${field}-err`} style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-danger)', margin: '4px 0 0 0' }}>{msg}</p>
      : null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Read-only requester info */}
      <section aria-label="Requester details">
        <h3 style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '14px', color: 'var(--color-text-secondary)', margin: '0 0 12px 0', letterSpacing: '0.03em' }}>
          Requester details
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: '12px',
          padding: '14px 16px', backgroundColor: 'var(--color-bg)', borderRadius: '8px', border: '1px solid var(--color-sage)' }}>
          <ReadOnlyField label="Name"        value={MOCK_REQUESTER.name}        />
          <ReadOnlyField label="Employee ID" value={MOCK_REQUESTER.employeeId}  />
          <ReadOnlyField label="Department"  value={MOCK_REQUESTER.department}  />
          <ReadOnlyField label="Category"    value={MOCK_REQUESTER.category}    />
        </div>
      </section>

      {/* Selected purpose (read-only + Change link) */}
      {purposeLabel && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          padding: '10px 14px', backgroundColor: 'var(--color-bg)', borderRadius: '8px', border: '1px solid var(--color-sage)' }}>
          <div>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-secondary)', margin: '0 0 2px 0' }}>Purpose</p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', color: 'var(--color-charcoal)', fontWeight: 500, margin: 0 }}>{purposeLabel}</p>
          </div>
          <button type="button" onClick={() => goToStep(1)}
            style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px', color: 'var(--color-forest)',
              background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
            onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
            onBlur={e  => (e.currentTarget.style.outline = 'none')}>
            Change
          </button>
        </div>
      )}

      {/* Subject */}
      <div>
        <label htmlFor={subjectId} className="input-label">
          Subject <span style={{ color: 'var(--color-danger)' }}>*</span>
          <CharCount current={subject.length} max={120} />
        </label>
        <input
          id={subjectId}
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          maxLength={120}
          aria-describedby={errors.subject ? `${subjectId}-err` : undefined}
          aria-invalid={!!errors.subject}
          placeholder="Brief subject of this appointment"
          className="input"
          style={{ borderColor: errors.subject ? 'var(--color-danger)' : undefined }}
        />
        {error('subject')}
      </div>

      {/* Description */}
      <div>
        <label htmlFor={descId} className="input-label">
          Description
          <CharCount current={description.length} max={1000} />
        </label>
        <textarea
          id={descId}
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={1000}
          rows={4}
          placeholder="Provide additional context (optional)"
          className="input"
          style={{ resize: 'vertical', lineHeight: 1.6 }}
        />
      </div>

      {/* Meeting mode */}
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend id={modeId} className="input-label">
          Meeting mode <span style={{ color: 'var(--color-danger)' }}>*</span>
        </legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '8px' }}>
          {MODES.map(m => (
            <label
              key={m.value}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '10px 14px',
                border: `1.5px solid ${mode === m.value ? 'var(--color-forest)' : 'var(--color-sage)'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                flex: '1 1 160px',
                backgroundColor: mode === m.value ? 'rgba(7,59,53,0.05)' : 'transparent',
              }}
            >
              <input type="radio" name="meeting-mode" value={m.value} checked={mode === m.value}
                onChange={() => setMode(m.value)}
                style={{ accentColor: 'var(--color-forest)', width: '16px', height: '16px', flexShrink: 0, marginTop: '2px' }}
                onFocus={e => (e.currentTarget.parentElement!.style.outline = '2px solid var(--color-emerald)')}
                onBlur={e  => (e.currentTarget.parentElement!.style.outline = 'none')}
              />
              <div>
                <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '14px', color: 'var(--color-charcoal)', margin: '0 0 2px 0' }}>{m.label}</p>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>{m.desc}</p>
              </div>
            </label>
          ))}
        </div>
        {error('mode')}
      </fieldset>

      {/* Location — Physical only */}
      {mode === 'physical' && (
        <div>
          <label htmlFor={locationId} className="input-label">
            Location <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <select
            id={locationId}
            value={locId}
            onChange={e => setLocationId(e.target.value)}
            className="input"
            aria-invalid={!!errors.locationId}
            style={{ borderColor: errors.locationId ? 'var(--color-danger)' : undefined }}
          >
            <option value="">Select a location</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          {error('locationId')}
        </div>
      )}

      {/* Participant count — when type config enables it */}
      {typeConfig?.showParticipantCount && (
        <div>
          <label htmlFor={participantId} className="input-label">Participant count</label>
          <input
            id={participantId}
            type="number"
            min={1}
            value={participantCount ?? ''}
            onChange={e => setParticipantCount(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="input"
            style={{ maxWidth: '140px' }}
          />
        </div>
      )}

      {/* Supporting reference — when type config enables it */}
      {typeConfig?.showSupportingReference && (
        <div>
          <label htmlFor={refId} className="input-label">Supporting reference</label>
          <input
            id={refId}
            type="text"
            value={supportingReference}
            onChange={e => setSupportingReference(e.target.value)}
            maxLength={200}
            placeholder="e.g. complaint ID, receipt number..."
            className="input"
          />
        </div>
      )}
    </div>
  )
}
