import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import { AUTHORITIES, MOCK_REQUESTER, canBook } from '../data/bookingSeeds'
import { submitAppointment, type BookingDraft } from '../data/bookingApi'
import AccessDenied from './AccessDenied'
import TimeSlotPicker from '../components/common/TimeSlotPicker'

// ─── Revised booking flow (per department) ────────────────────────────────────
// Three steps, no appointment-type selection:
//   1. Appointment with  — pick a department, then an authority.
//   2. Date and time     — optional; the authority proposes a time if left blank.
//   3. Reason            — a short subject + a description, then save.
// The draft is built here and sent through the existing submit boundary so the
// data layer, confirmation page and approvals workflow are unchanged.

const STEP_LABELS = ['Appointment with', 'Date and time', 'Reason'] as const
const STEP_COUNT = STEP_LABELS.length

// The three fixed options a requester can book with. "Department" is a general
// request to the department; the other two are specific authorities. Each maps
// to a real authority record so the submit boundary is unchanged.
interface BookWithOption {
  key:          string
  label:        string
  sublabel:     string
  initials:     string
  authorityId:  string
}

const BOOK_WITH_OPTIONS: BookWithOption[] = [
  { key: 'department', label: 'Department',     sublabel: 'A general request to the department', initials: 'DP', authorityId: 'auth-vm' },
  { key: 'auth-ss',    label: 'Shivendra sir',  sublabel: 'Academic Affairs',                    initials: 'SS', authorityId: 'auth-ss' },
  { key: 'auth-ap',    label: 'Jaimeel sir',      sublabel: 'Human Resources',                     initials: 'JS', authorityId: 'auth-ap' },
]

function fmtTime(hhmm: string): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const suf = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suf}`
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function BookAppointmentNew() {
  const navigate = useNavigate()

  if (!canBook(MOCK_REQUESTER.role)) return <AccessDenied />

  const [step, setStep] = useState(1)
  const [optionKey, setOptionKey] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [mode, setMode] = useState<'physical' | 'online'>('physical')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const idempotencyKey = useRef(crypto.randomUUID())

  const selectedOption = BOOK_WITH_OPTIONS.find(o => o.key === optionKey)
  const authority = AUTHORITIES.find(a => a.id === selectedOption?.authorityId)
  // Who the appointment is with, for display copy.
  const withLabel = selectedOption?.label ?? 'the authority'

  function validate(current: number): boolean {
    const e: Record<string, string> = {}
    if (current === 1) {
      if (!optionKey) e.option = 'Select who the appointment is with.'
    }
    if (current === 2) {
      // Optional, but if one is set the other must be too.
      if (date && !time) e.time = 'Select a time, or clear the date to let the authority propose one.'
      if (time && !date) e.date = 'Select a date, or clear the time to let the authority propose one.'
    }
    if (current === 3) {
      if (!subject.trim()) e.subject = 'Enter a short subject.'
      if (!description.trim()) e.description = 'Describe the reason for the appointment.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (!validate(step)) return
    setErrors({})
    if (step < STEP_COUNT) setStep(s => s + 1)
    else handleSubmit()
  }
  function back() {
    setErrors({})
    setStep(s => Math.max(1, s - 1))
  }

  async function handleSubmit() {
    if (!authority) return
    setSubmitError('')
    setSubmitting(true)

    // Derive a type from the authority (type selection was removed from the
    // requester flow); fall back to 'general'. purpose/mode/docs are defaults.
    const typeId = authority.typeIds[0] ?? 'general'
    const draft: BookingDraft = {
      id: 'new',
      status: 'draft',
      typeId,
      purposeId: '',
      authorityId: authority.id,
      autoAssigned: false,
      date,
      time,
      subject: subject.trim(),
      description: description.trim(),
      mode,
      locationId: '',
      participantCount: null,
      supportingReference: '',
      documents: [],
      createdAt: '',
      updatedAt: '',
    }

    try {
      const record = await submitAppointment(draft, idempotencyKey.current)
      navigate(`/book/confirmation/${record.id}`, { replace: true })
    } catch (err: unknown) {
      const apiErr = err as { message?: string }
      setSubmitError(apiErr.message || 'Something went wrong. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      <PageHeader title="Book appointment" description={`Step ${step} of ${STEP_COUNT}: ${STEP_LABELS[step - 1]}`} />

      {/* Stepper */}
      <ol style={{ display: 'flex', gap: 'var(--space-2)', listStyle: 'none', margin: '0 0 var(--space-6) 0', padding: 0, flexWrap: 'wrap' }}>
        {STEP_LABELS.map((label, i) => {
          const n = i + 1
          const done = n < step
          const active = n === step
          return (
            <li key={label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span aria-hidden="true" style={{ width: '28px', height: '28px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 700,
                backgroundColor: active ? 'var(--color-forest)' : done ? 'var(--color-emerald)' : 'var(--color-sage)',
                color: active || done ? '#ffffff' : 'var(--color-text-secondary)' }}>
                {done ? <Check size={14} aria-hidden="true" /> : n}
              </span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
                fontWeight: active ? 600 : 500, color: active ? 'var(--color-charcoal)' : 'var(--color-text-secondary)' }}>
                {label}
              </span>
              {n < STEP_COUNT && <span aria-hidden="true" style={{ width: '16px', height: '1px', backgroundColor: 'var(--color-sage)' }} />}
            </li>
          )
        })}
      </ol>

      <div className="card" style={{ padding: 'var(--space-6)' }}>
        {submitError && (
          <div role="alert" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 14px',
            backgroundColor: '#fce8e6', border: '1px solid #f5c6c4', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-5)' }}>
            <AlertCircle size={15} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: '#7d1c18', margin: 0 }}>{submitError}</p>
          </div>
        )}

        {/* ── Step 1: Appointment with (three fixed options) ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <span style={labelStyle}>Appointment with<span style={reqStyle}> *</span></span>
            <div role="radiogroup" aria-label="Appointment with" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {BOOK_WITH_OPTIONS.map(opt => {
                const selected = opt.key === optionKey
                return (
                  <button key={opt.key} type="button" role="radio" aria-checked={selected}
                    onClick={() => { setOptionKey(opt.key); setErrors({}) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', textAlign: 'left',
                      padding: '14px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      border: `1.5px solid ${selected ? 'var(--color-forest)' : 'var(--color-sage)'}`,
                      backgroundColor: selected ? 'rgb(7 59 53 / 0.04)' : 'var(--color-ivory)' }}>
                    <span aria-hidden="true" style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                      backgroundColor: 'var(--color-sage)', color: 'var(--color-charcoal)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                      {opt.initials}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-charcoal)' }}>{opt.label}</span>
                      <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{opt.sublabel}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            {errors.option && <p style={errStyle}>{errors.option}</p>}
          </div>
        )}

        {/* ── Step 2: Date and time (optional) ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div style={{ padding: '12px 14px', backgroundColor: 'var(--color-cream)', border: '1px solid var(--color-sage)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Choosing a date and time is optional. Leave it blank and {withLabel} will propose a time when they review your request.
              </p>
            </div>

            <div>
              <label htmlFor="date" style={labelStyle}>Preferred date</label>
              <input id="date" type="date" className="input" value={date} min={todayISO()}
                aria-invalid={!!errors.date}
                onChange={e => { setDate(e.target.value); setErrors({}) }} />
              {date && (
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-secondary)', margin: '4px 0 0 0' }}>
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
              )}
              {errors.date && <p style={errStyle}>{errors.date}</p>}
            </div>

            <TimeSlotPicker
              value={time}
              onChange={val => { setTime(val); setErrors({}) }}
              label="Preferred time slot"
              error={errors.time}
            />

            {(date || time) && (
              <button type="button" className="btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
                onClick={() => { setDate(''); setTime(''); setErrors({}) }}>
                Clear and let the authority propose a time
              </button>
            )}
          </div>
        )}

        {/* ── Step 3: Reason ── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div>
              <label htmlFor="subject" style={labelStyle}>Subject<span style={reqStyle}> *</span></label>
              <input id="subject" type="text" className="input" value={subject} maxLength={120}
                placeholder="A short summary, for example: Project guidance"
                aria-invalid={!!errors.subject}
                onChange={e => { setSubject(e.target.value); setErrors({}) }} />
              {errors.subject && <p style={errStyle}>{errors.subject}</p>}
            </div>
            <div>
              <label htmlFor="reason" style={labelStyle}>Reason<span style={reqStyle}> *</span></label>
              <textarea id="reason" className="input" rows={5} value={description} maxLength={1000}
                placeholder="Describe the reason for the appointment."
                aria-invalid={!!errors.description}
                style={{ resize: 'vertical', lineHeight: 1.5 }}
                onChange={e => { setDescription(e.target.value); setErrors({}) }} />
              {errors.description && <p style={errStyle}>{errors.description}</p>}
            </div>

            {/* Meeting method (Online / Offline) dropdown */}
            <div>
              <label htmlFor="meeting-method" style={labelStyle}>Meeting method<span style={reqStyle}> *</span></label>
              <select
                id="meeting-method"
                className="input"
                value={mode}
                onChange={e => setMode(e.target.value as 'physical' | 'online')}
                style={{ width: '100%', cursor: 'pointer', backgroundColor: 'var(--color-ivory)' }}
              >
                <option value="physical">Offline (In-Person)</option>
                <option value="online">Online</option>
              </select>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: '6px 0 0 0' }}>
                {mode === 'physical'
                  ? 'In-person meeting at the authority\'s designated department office.'
                  : 'Online video meeting link will be shared once approved.'}
              </p>
            </div>

            {/* Summary */}
            <div style={{ padding: '12px 14px', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-sage)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', margin: '0 0 6px 0' }}>Summary</p>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--color-charcoal)', margin: 0, lineHeight: 1.6 }}>
                Appointment with <strong>{withLabel}</strong> ({mode === 'online' ? 'Online' : 'Offline / In-Person'}).{' '}
                {date && time ? <>Preferred {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })} at {fmtTime(time)}.</> : 'Time to be proposed by the authority.'}
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)',
          marginTop: 'var(--space-6)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--color-sage)' }}>
          <button type="button" className="btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>Cancel</button>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {step > 1 && (
              <Button variant="secondary" size="md" onClick={back} disabled={submitting}>
                <ChevronLeft size={16} aria-hidden="true" /> Back
              </Button>
            )}
            <Button variant="primary" size="md" onClick={next} loading={submitting}>
              {step < STEP_COUNT ? <>Next <ChevronRight size={16} aria-hidden="true" /></> : 'Save appointment'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 'var(--text-sm)',
  color: 'var(--color-charcoal)', marginBottom: '0.3rem',
}
const reqStyle: React.CSSProperties = { color: 'var(--color-danger)' }
const errStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--color-danger)', margin: '0.3rem 0 0 0',
}
