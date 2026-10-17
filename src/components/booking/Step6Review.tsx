import { useId } from 'react'
import { Pencil } from 'lucide-react'
import { APPOINTMENT_TYPES, PURPOSES, AUTHORITIES, LOCATIONS, MOCK_REQUESTER } from '../../data/bookingSeeds'
import { useBookingStore } from '../../store/bookingStore'

// ─── Review section ───────────────────────────────────────────────────────────
function ReviewSection({
  title,
  step,
  onEdit,
  children,
}: {
  title:   string
  step:    number
  onEdit:  (step: number) => void
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={title}
      style={{
        border:       '1px solid var(--color-sage)',
        borderRadius: '8px',
        overflow:     'hidden',
      }}
    >
      {/* Section header */}
      <div
        style={{
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'space-between',
          padding:         '10px 16px',
          backgroundColor: 'var(--color-bg)',
          borderBottom:    '1px solid var(--color-sage)',
        }}
      >
        <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>
          {title}
        </p>
        <button
          type="button"
          onClick={() => onEdit(step)}
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        '5px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            fontSize:   '13px',
            color:      'var(--color-forest)',
            background: 'none',
            border:     'none',
            cursor:     'pointer',
          }}
          onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
          onBlur={e  => (e.currentTarget.style.outline = 'none')}
        >
          <Pencil size={12} aria-hidden="true" /> Edit
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </section>
  )
}

// ─── Review row ───────────────────────────────────────────────────────────────
function ReviewRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px', paddingBottom: '8px', marginBottom: '8px', borderBottom: '1px solid var(--color-sage)' }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-charcoal)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

// ─── Format time ─────────────────────────────────────────────────────────────
function formatTime(hhmm: string): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12    = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2,'0')} ${suffix}`
}

// ─── Step 6 ───────────────────────────────────────────────────────────────────
export default function Step6Review() {
  const checkId = useId()

  const typeId              = useBookingStore(s => s.typeId)
  const purposeId           = useBookingStore(s => s.purposeId)
  const authorityId         = useBookingStore(s => s.authorityId)
  const date                = useBookingStore(s => s.date)
  const time                = useBookingStore(s => s.time)
  const subject             = useBookingStore(s => s.subject)
  const description         = useBookingStore(s => s.description)
  const mode                = useBookingStore(s => s.mode)
  const locationId          = useBookingStore(s => s.locationId)
  const participantCount    = useBookingStore(s => s.participantCount)
  const supportingReference = useBookingStore(s => s.supportingReference)
  const docSlots            = useBookingStore(s => s.docSlots)
  const errors              = useBookingStore(s => s.stepErrors[5])
  const submitError         = useBookingStore(s => s.submitError)
  const goToStep            = useBookingStore(s => s.goToStep)
  // confirmed checkbox lives as local state; the store only gets it on submit
  // We expose it via the parent page's onNext handler instead
  // For UI, track in a local ref via a data attribute trick using store's errors check
  const confirmed = !errors.confirmed

  // Resolve display values
  const typeName  = APPOINTMENT_TYPES.find(t => t.id === typeId)?.name ?? typeId
  const purpose   = PURPOSES.find(p => p.id === purposeId)?.label ?? ''
  const authority = AUTHORITIES.find(a => a.id === authorityId)
  const location  = LOCATIONS.find(l => l.id === locationId)

  const dateDisplay = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  const uploadedDocs = docSlots.filter(s => s.doc)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Global submit error */}
      {submitError && (
        <div role="alert"
          style={{ padding: '12px 16px', backgroundColor: '#fce8e6', border: '1px solid #f5c6c4',
            borderRadius: '8px', fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#7d1c18' }}>
          {submitError}
        </div>
      )}

      {/* ── Requester ── */}
      <ReviewSection title="Requester" step={1} onEdit={() => {}}>
        <ReviewRow label="Name"        value={MOCK_REQUESTER.name}       />
        <ReviewRow label="Employee ID" value={MOCK_REQUESTER.employeeId} />
        <ReviewRow label="Department"  value={MOCK_REQUESTER.department} />
      </ReviewSection>

      {/* ── Appointment ── */}
      <ReviewSection title="Appointment" step={1} onEdit={goToStep}>
        <ReviewRow label="Type"    value={typeName} />
        <ReviewRow label="Purpose" value={purpose}  />
      </ReviewSection>

      {/* ── Authority ── */}
      <ReviewSection title="Authority" step={2} onEdit={goToStep}>
        <ReviewRow label="Name"        value={authority?.name ?? ''}        />
        <ReviewRow label="Designation" value={authority?.designation ?? ''} />
        <ReviewRow label="Department"  value={authority?.department ?? ''}  />
      </ReviewSection>

      {/* ── Schedule ── */}
      <ReviewSection title="Schedule" step={3} onEdit={goToStep}>
        {date && time ? (
          <>
            <ReviewRow label="Date" value={dateDisplay} />
            <ReviewRow label="Time" value={formatTime(time)} />
          </>
        ) : (
          <ReviewRow label="Schedule" value="To be proposed by the authority" />
        )}
      </ReviewSection>

      {/* ── Details ── */}
      <ReviewSection title="Details" step={4} onEdit={goToStep}>
        <ReviewRow label="Subject"             value={subject}             />
        <ReviewRow label="Description"         value={description}        />
        <ReviewRow label="Meeting mode"        value={mode.charAt(0).toUpperCase() + mode.slice(1)} />
        {mode === 'physical' && <ReviewRow label="Location" value={location?.label ?? ''} />}
        {participantCount != null && <ReviewRow label="Participants" value={String(participantCount)} />}
        {supportingReference && <ReviewRow label="Reference" value={supportingReference} />}
      </ReviewSection>

      {/* ── Documents ── */}
      <ReviewSection title="Documents" step={5} onEdit={goToStep}>
        {uploadedDocs.length === 0
          ? <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0 }}>No documents attached.</p>
          : uploadedDocs.map(s => (
            <div key={s.docTypeId} style={{ display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 0', borderBottom: '1px solid var(--color-sage)' }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-charcoal)', flex: 1 }}>{s.doc!.fileName}</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                {(s.doc!.fileSize / 1024).toFixed(0)} KB
              </span>
            </div>
          ))
        }
      </ReviewSection>

      {/* ── Confirm checkbox ── */}
      <div
        style={{
          display:         'flex',
          alignItems:      'flex-start',
          gap:             '12px',
          padding:         '14px 16px',
          border:          `1.5px solid ${confirmed ? 'var(--color-forest)' : errors.confirmed ? 'var(--color-danger)' : 'var(--color-sage)'}`,
          borderRadius:    '8px',
          backgroundColor: confirmed ? 'rgba(7,59,53,0.04)' : 'transparent',
          cursor:          'pointer',
        }}
      >
        <input
          id={checkId}
          type="checkbox"
          name="booking-confirmed"
          style={{ width: '18px', height: '18px', accentColor: 'var(--color-forest)', flexShrink: 0, marginTop: '1px', cursor: 'pointer' }}
          onFocus={e => (e.currentTarget.parentElement!.style.outline = '2px solid var(--color-emerald)')}
          onBlur={e  => (e.currentTarget.parentElement!.style.outline = 'none')}
        />
        <label htmlFor={checkId} style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-charcoal)', lineHeight: 1.6, cursor: 'pointer' }}>
          I confirm that the information above is correct.
        </label>
      </div>

      {errors.confirmed && (
        <p role="alert" style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-danger)', margin: 0 }}>
          {errors.confirmed}
        </p>
      )}

      {/* Submission note */}
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)',
        padding: '10px 14px', backgroundColor: 'rgba(31,95,166,0.06)', border: '1px solid rgba(31,95,166,0.15)', borderRadius: '6px', margin: 0 }}>
        Your request will be sent to the authority for approval. You will be notified when the status changes.
      </p>
    </div>
  )
}
