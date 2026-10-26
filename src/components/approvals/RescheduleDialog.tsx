import { useState, useId } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import TimeSlotPicker from '../common/TimeSlotPicker'

interface RescheduleDialogProps {
  /** Current date/time shown as a reference. */
  currentDate: string
  currentTime: string
  submitting:  boolean
  /** Optional copy overrides so the same dialog serves approve-with-time. */
  title?:        string
  description?:  string
  confirmLabel?: string
  mode?:         'physical' | 'online' | 'phone'
  currentMeetingUrl?: string
  onConfirm:   (date: string, time: string, note: string, meetingUrl?: string) => void
  onClose:     () => void
}

// ─── RescheduleDialog ─────────────────────────────────────────────────────────
// Captures a date + time (both required) plus an optional note. Used both when
// an authority proposes a new slot (reschedule) and when an authority sets the
// slot while approving a request the requester left open.
// Rendered via createPortal to document.body so it is never clipped or trapped
// by sticky/overflow parent containers.

export default function RescheduleDialog({
  currentDate,
  currentTime,
  submitting,
  title = 'Propose a new time',
  description = 'The request moves to rescheduled and the requester is asked to accept or decline the new slot.',
  confirmLabel = 'Propose new time',
  mode,
  currentMeetingUrl,
  onConfirm,
  onClose,
}: RescheduleDialogProps) {
  const dateId = useId()
  const noteId = useId()

  const [date, setDate] = useState(currentDate)
  const [time, setTime] = useState(currentTime)
  const [note, setNote] = useState('')
  const [meetingUrl, setMeetingUrl] = useState(currentMeetingUrl || '')
  const [touched, setTouched] = useState(false)

  const missing = !date || !time
  const error = touched && missing ? 'A date and time slot are both required.' : ''

  function handleConfirm() {
    setTouched(true)
    if (missing) return
    onConfirm(date, time, note.trim(), meetingUrl.trim())
  }

  const confirmDisabled = missing || submitting

  const dialogContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-dialog-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem 1rem',
        backgroundColor: 'rgba(23, 37, 34, 0.55)',
        backdropFilter: 'blur(3px)',
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}
      onClick={() => !submitting && onClose()}
    >
      <div
        className="card"
        style={{
          maxWidth: '520px',
          width: '100%',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          margin: 'auto',
          boxShadow: 'var(--elevation-3)',
          borderRadius: 'var(--radius-xl)',
          backgroundColor: 'var(--color-ivory)',
          border: '1px solid var(--color-sage)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Fixed Header (never shrinks, never scrolls off) ── */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-sage)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            backgroundColor: 'var(--color-ivory)',
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              id="reschedule-dialog-title"
              style={{
                fontFamily: 'var(--font-serif)',
                fontWeight: 600,
                fontSize: '18px',
                color: 'var(--color-charcoal)',
                margin: '0 0 4px 0',
                lineHeight: 1.3,
              }}
            >
              {title}
            </h3>
            {description && (
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  color: 'var(--color-text-secondary)',
                  margin: 0,
                  lineHeight: 1.45,
                }}
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close dialog"
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: 'var(--color-text-secondary)',
              flexShrink: 0,
              marginTop: '-2px',
              marginRight: '-4px',
              transition: 'background-color 120ms ease-out',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--color-sage)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* ── Scrollable Body (only content scrolls if height is constrained) ── */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            overflowY: 'auto',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* Date field */}
          <div>
            <label
              htmlFor={dateId}
              style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: '14px',
                color: 'var(--color-charcoal)',
                marginBottom: '0.35rem',
              }}
            >
              Date<span style={{ color: 'var(--color-danger)' }}> *</span>
            </label>
            <input
              id={dateId}
              type="date"
              value={date}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setDate(e.target.value)}
              onBlur={() => setTouched(true)}
              className="input"
              style={{
                width: '100%',
                borderColor: touched && !date ? 'var(--color-danger)' : undefined,
              }}
            />
            {date && (
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                  margin: '4px 0 0 0',
                }}
              >
                {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
          </div>

          {/* TimeSlotPicker */}
          <TimeSlotPicker
            compact
            value={time}
            onChange={val => {
              setTime(val)
              if (touched) setTouched(true)
            }}
            label="Time slot (30 mins)"
            required
            error={touched && !time ? 'Please select a time slot.' : undefined}
          />

          {/* Google Meet link for online consultations */}
          {mode === 'online' && (
            <div style={{ padding: '0.75rem', backgroundColor: '#F0FDF4', borderRadius: 'var(--radius-md)', border: '1px solid #BBF7D0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '14px' }}>🎥</span>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    fontSize: '13px',
                    color: '#166534',
                  }}
                >
                  Online Video Consultation (Google Meet)
                </span>
              </div>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: '#15803D', margin: '0 0 6px 0', lineHeight: 1.45 }}>
                A Google Meet link will be <strong>automatically generated and emailed to the requester</strong> with an <strong>Add to Google Calendar</strong> reminder upon confirmation.
              </p>
              <input
                type="url"
                value={meetingUrl}
                onChange={e => setMeetingUrl(e.target.value)}
                placeholder="Optional custom link (leave blank to auto-generate)"
                className="input"
                style={{ width: '100%', fontSize: '12px', padding: '0.35rem 0.6rem' }}
              />
            </div>
          )}

          {/* Note textarea */}
          <div>
            <label
              htmlFor={noteId}
              style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: '14px',
                color: 'var(--color-charcoal)',
                marginBottom: '0.35rem',
              }}
            >
              Note to requester
            </label>
            <textarea
              id={noteId}
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="Optional note or reason..."
              className="input"
              style={{ resize: 'vertical', lineHeight: 1.45 }}
            />
          </div>

          {error && (
            <p
              role="alert"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                color: 'var(--color-danger)',
                margin: 0,
              }}
            >
              {error}
            </p>
          )}
        </div>

        {/* ── Fixed Footer (docked at bottom, never cut off) ── */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--color-sage)',
            backgroundColor: 'var(--color-surface)',
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={submitting}
            style={{ fontSize: '14px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className="btn-primary"
            style={{
              fontSize: '14px',
              minWidth: '140px',
              justifyContent: 'center',
              opacity: confirmDisabled ? 0.6 : 1,
              cursor: confirmDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting && <Loader2 size={15} className="spin" aria-hidden="true" />}
            {submitting ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(dialogContent, document.body)
  }
  return dialogContent
}
