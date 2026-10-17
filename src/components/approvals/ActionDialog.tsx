import { useState, useId } from 'react'
import { Loader2 } from 'lucide-react'

interface ActionDialogProps {
  title:        string
  description?: string
  fieldLabel:   string
  placeholder:  string
  /** Reason/message required before confirm is enabled. */
  required:     boolean
  confirmLabel: string
  /** 'danger' = red confirm button (reject), else primary forest. */
  variant?:     'primary' | 'danger'
  submitting:   boolean
  onConfirm:    (text: string) => void
  onClose:      () => void
}

// ─── ActionDialog ─────────────────────────────────────────────────────────────
// Shared modal for Reject (reason required), Request information (message
// required) and Internal remark (text required). One component, three uses.

export default function ActionDialog({
  title,
  description,
  fieldLabel,
  placeholder,
  required,
  confirmLabel,
  variant = 'primary',
  submitting,
  onConfirm,
  onClose,
}: ActionDialogProps) {
  const fieldId = useId()
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)

  const error = required && touched && !text.trim()
    ? `${fieldLabel} is required.`
    : ''

  function handleConfirm() {
    setTouched(true)
    if (required && !text.trim()) return
    onConfirm(text.trim())
  }

  const confirmDisabled = (required && !text.trim()) || submitting

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-dialog-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 300, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '1rem',
        backgroundColor: 'rgba(23,37,34,0.45)',
      }}
      onClick={() => !submitting && onClose()}
    >
      <div
        className="card"
        style={{ maxWidth: '460px', width: '100%' }}
        onClick={e => e.stopPropagation()}
      >
        <h3
          id="action-dialog-title"
          style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '18px',
            color: 'var(--color-charcoal)', margin: '0 0 0.5rem 0' }}
        >
          {title}
        </h3>

        {description && (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px',
            color: 'var(--color-text-secondary)', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
            {description}
          </p>
        )}

        <label htmlFor={fieldId}
          style={{ display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 500,
            fontSize: '14px', color: 'var(--color-charcoal)', marginBottom: '0.3rem' }}>
          {fieldLabel}{required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
        </label>
        <textarea
          id={fieldId}
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={() => setTouched(true)}
          rows={4}
          placeholder={placeholder}
          aria-invalid={!!error}
          className="input"
          style={{ resize: 'vertical', lineHeight: 1.5,
            borderColor: error ? 'var(--color-danger)' : undefined }}
        />
        {error && (
          <p role="alert" style={{ fontFamily: 'var(--font-sans)', fontSize: '13px',
            color: 'var(--color-danger)', margin: '0.3rem 0 0 0' }}>
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
            className={variant === 'danger' ? 'btn-danger' : 'btn-primary'}
            style={{ fontSize: '14px', minWidth: '120px', justifyContent: 'center',
              opacity: confirmDisabled ? 0.6 : 1, cursor: confirmDisabled ? 'not-allowed' : 'pointer' }}
          >
            {submitting && <Loader2 size={15} className="spin" aria-hidden="true" />}
            {submitting ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        .spin { animation: act-spin 0.8s linear infinite; }
        @keyframes act-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
