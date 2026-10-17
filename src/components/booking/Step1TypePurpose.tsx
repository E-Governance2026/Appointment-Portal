import { useState, useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { fetchAppointmentTypes, fetchPurposes } from '../../data/bookingApi'
import { MOCK_REQUESTER } from '../../data/bookingSeeds'
import { useBookingStore } from '../../store/bookingStore'
import type { AppointmentType } from '../../data/bookingApi'

// ─── Skeleton grid ────────────────────────────────────────────────────────────
function TypeSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: '12px' }}>
      {[0,1,2,3,4,5].map(i => (
        <div key={i} style={{ height: '100px', borderRadius: '8px', backgroundColor: 'var(--color-sage)', opacity: 0.5 }} aria-hidden="true" />
      ))}
    </div>
  )
}

// ─── Type card (radio group item) ────────────────────────────────────────────
function TypeCard({ type, selected, onSelect }: {
  type: AppointmentType
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        display:         'flex',
        flexDirection:   'column',
        gap:             '6px',
        padding:         '14px 16px',
        border:          `2px solid ${selected ? 'var(--color-forest)' : 'var(--color-sage)'}`,
        borderRadius:    '8px',
        backgroundColor: selected ? 'rgba(7,59,53,0.06)' : 'var(--color-ivory)',
        cursor:          'pointer',
        textAlign:       'left',
        transition:      'border-color 0.12s ease, background-color 0.12s ease',
      }}
      onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
      onBlur={e  => (e.currentTarget.style.outline = 'none')}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--color-emerald)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--color-sage)'    }}
    >
      <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '15px', color: 'var(--color-charcoal)' }}>
        {type.name}
      </span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
        {type.description}
      </span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
        {type.defaultDurationMinutes} min
      </span>
    </button>
  )
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────
export default function Step1TypePurpose() {
  const searchId  = useId()
  const [search, setSearch] = useState('')

  const typeId    = useBookingStore(s => s.typeId)
  const purposeId = useBookingStore(s => s.purposeId)
  const errors    = useBookingStore(s => s.stepErrors[0])
  const setType   = useBookingStore(s => s.setType)
  const setPurpose= useBookingStore(s => s.setPurpose)

  const { data: types = [], isLoading: loadingTypes, isError: typesError } =
    useQuery({ queryKey: ['booking-types', MOCK_REQUESTER.role], queryFn: () => fetchAppointmentTypes(MOCK_REQUESTER.role) })

  const selectedType = types.find(t => t.id === typeId)

  const { data: purposes = [], isLoading: loadingPurposes } =
    useQuery({
      queryKey:  ['booking-purposes', typeId],
      queryFn:   () => fetchPurposes(typeId),
      enabled:   !!typeId,
    })

  const filtered = types.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  )

  function handleTypeSelect(t: AppointmentType) {
    if (t.id !== typeId) setType(t.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: '400px' }}>
        <label htmlFor={searchId} className="input-label">Search appointment types</label>
        <div style={{ position: 'relative' }}>
          <Search size={14} aria-hidden="true"
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="e.g. Finance, Academic..."
            className="input"
            style={{ paddingLeft: '36px' }}
          />
        </div>
      </div>

      {/* Type radio group */}
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="input-label" style={{ marginBottom: '10px' }}>
          Appointment type <span style={{ color: 'var(--color-danger)' }}>*</span>
        </legend>

        {errors.typeId && (
          <p role="alert" style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-danger)', marginBottom: '10px' }}>
            {errors.typeId}
          </p>
        )}

        {typesError && (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-danger)' }}>
            Could not load appointment types. Refresh the page to try again.
          </p>
        )}

        {loadingTypes
          ? <TypeSkeleton />
          : filtered.length === 0
          ? <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>No types match your search.</p>
          : (
            <div
              role="radiogroup"
              aria-label="Appointment type"
              aria-required="true"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: '12px' }}
            >
              {filtered.map(t => (
                <TypeCard key={t.id} type={t} selected={typeId === t.id} onSelect={() => handleTypeSelect(t)} />
              ))}
            </div>
          )
        }
      </fieldset>

      {/* Purpose radio list — shown only when a type with requiresPurpose is selected */}
      {selectedType && (
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="input-label" style={{ marginBottom: '10px' }}>
            Purpose
            {selectedType.requiresPurpose && (
              <> <span style={{ color: 'var(--color-danger)' }}>*</span></>
            )}
          </legend>

          {typeId && purposes.length === 0 && !loadingPurposes && !selectedType.requiresPurpose && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              No specific purpose is required for this type.
            </p>
          )}

          {errors.purposeId && (
            <p role="alert" style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-danger)', marginBottom: '8px' }}>
              {errors.purposeId}
            </p>
          )}

          {loadingPurposes
            ? <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>Loading purposes...</p>
            : (
              <div role="radiogroup" aria-label="Purpose" aria-required={selectedType.requiresPurpose}
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {purposes.map(p => (
                  <label
                    key={p.id}
                    style={{
                      display:      'flex',
                      alignItems:   'center',
                      gap:          '10px',
                      padding:      '10px 14px',
                      border:       `1.5px solid ${purposeId === p.id ? 'var(--color-forest)' : 'var(--color-sage)'}`,
                      borderRadius: '6px',
                      cursor:       'pointer',
                      backgroundColor: purposeId === p.id ? 'rgba(7,59,53,0.05)' : 'transparent',
                      fontFamily:   'var(--font-sans)',
                      fontSize:     '14px',
                      color:        'var(--color-charcoal)',
                    }}
                  >
                    <input
                      type="radio"
                      name="purpose"
                      value={p.id}
                      checked={purposeId === p.id}
                      onChange={() => setPurpose(p.id)}
                      style={{ accentColor: 'var(--color-forest)', width: '16px', height: '16px', flexShrink: 0 }}
                      onFocus={e => (e.currentTarget.parentElement!.style.outline = '2px solid var(--color-emerald)')}
                      onBlur={e  => (e.currentTarget.parentElement!.style.outline = 'none')}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            )
          }
        </fieldset>
      )}

      {/* Type-change notice (only shown after user picked a type before) */}
      {typeId && selectedType && (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
          Changing the appointment type clears your authority, date, and time selections.
        </p>
      )}
    </div>
  )
}
