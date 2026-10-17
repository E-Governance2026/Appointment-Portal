import { useState, useId } from 'react'
import { Loader2 } from 'lucide-react'

interface RescheduleDialogProps {
  /** Current date/time shown as a reference. */
  currentDate: string
  currentTime: string
  submitting:  boolean
  /** Optional copy overrides so the same dialog serves approve-with-time. */
  title?:        string
  description?:  string
  confirmLabel?: string
  onConfirm:   (date: string, time: string, note: string) => void
  onClose:     () => void
}

// ─── RescheduleDialog ─────────────────────────────────────────────────────────
// Captures a date + time (both required) plus an optional note. Used both when
// an authority proposes a new slot (reschedule) and when an authority sets the
// slot while approving a request the requester left open.

export default function RescheduleDialog({
  currentDate,
  currentTime,
  submitting,
  title = 'Propose a new time',
  description = 'The request moves to rescheduled and the requester is asked to accept or decline the new slot.',
  confirmLabel = 'Propose new time',
  onConfirm,
  onClose,
}: RescheduleDialogProps) {
  const dateId = useId()
  const timeId = useId()
  const noteId = useId()

  const [date, setDate] = useState(currentDate)
  const [time, setTime] = useState(currentTime)
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)

  const missing = !date || !time
  const error = touched && missing ? 'A new date and time are both required.' : ''

  function handleConfirm() {
    setTouched(true)
    if (missing) return
    onConfirm(date, time, note.trim())
  }

  const confirmDisabled = missing || submitting

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-dialog-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 300, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '1rem',
        backgroundColor: 'rgba(23,37,34,0.45)',
      }}
      onClick={() => !submitting && onClose()}
    >
      <div className="card" style={{ maxWidth: '460px', width: '100%' }} onClick={e => e.stopPropagation()}>
        <h3
          id="reschedule-dialog-title"
          style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '18px',
            color: 'var(--color-charcoal)', margin: '0 0 0.5rem 0' }}
        >
          {title}
        </h3>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px',
          color: 'var(--color-text-secondary)', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
          {description}
        </p>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor={dateId}
              style={{ display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 500,
                fontSize: '14px', color: 'var(--color-charcoal)', marginBottom: '0.3rem' }}>
              New date<span style={{ color: 'var(--color-danger)' }}> *</span>
            </label>
            <input
              id={dateId}
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              onBlur={() => setTouched(true)}
              className="input"
              style={{ borderColor: touched && !date ? 'var(--color-danger)' : undefined }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor={timeId}
              style={{ display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 500,
                fontSize: '14px', color: 'var(--color-charcoal)', marginBottom: '0.3rem' }}>
              New time<span style={{ color: 'var(--color-danger)' }}> *</span>
            </label>
            <input
              id={timeId}
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              onBlur={() => setTouched(true)}
              className="input"
              style={{ borderColor: touched && !time ? 'var(--color-danger)' : undefined }}
            />
          </div>
        </div>

        <label htmlFor={noteId}
          style={{ display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 500,
            fontSize: '14px', color: 'var(--color-charcoal)', margin: '1rem 0 0.3rem 0' }}>
          Note to requester
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          placeholder="Optional reason for the new time..."
          className="input"
          style={{ resize: 'vertical', lineHeight: 1.5 }}
        />

        {error && (
          <p role="alert" style={{ fontFamily: 'var(--font-sans)', fontSize: '13px',
            color: 'var(--color-danger)', margin: '0.5rem 0 0 0' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}
            style={{ fontSize: '14px' }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className="btn-primary"
            style={{ fontSize: '14px', minWidth: '140px', justifyContent: 'center',
              opacity: confirmDisabled ? 0.6 : 1, cursor: confirmDisabled ? 'not-allowed' : 'pointer' }}
          >
            {submitting && <Loader2 size={15} className="spin" aria-hidden="true" />}
            {submitting ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
