import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface StepFooterProps {
  currentStep:   number
  isLastStep:    boolean
  isSaving:      boolean
  isSubmitting:  boolean
  isDirty:       boolean
  canProceed:    boolean
  onBack:        () => void
  onSaveDraft:   () => void
  onNext:        () => void
  onCancel:      () => void   // navigate away
}

// ─── StepFooter ───────────────────────────────────────────────────────────────
// Step 1: "Cancel" (shows confirmation dialog if data was entered), "Save draft", "Next"
// Steps 2-5: "Back", "Save draft", "Next"
// Step 6: "Back", "Save draft", "Submit appointment"

export default function StepFooter({
  currentStep,
  isLastStep,
  isSaving,
  isSubmitting,
  isDirty,
  canProceed,
  onBack,
  onSaveDraft,
  onNext,
  onCancel,
}: StepFooterProps) {
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  function handleLeftButton() {
    if (currentStep === 1) {
      if (isDirty) {
        setShowCancelDialog(true)
      } else {
        onCancel()
      }
    } else {
      onBack()
    }
  }

  const leftLabel   = currentStep === 1 ? 'Cancel' : 'Back'
  const rightLabel  = isLastStep ? 'Submit appointment' : 'Next'

  return (
    <>
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          paddingTop:     '1.5rem',
          marginTop:      '1.5rem',
          borderTop:      '1px solid var(--color-sage)',
          gap:            '12px',
          flexWrap:       'wrap',
        }}
      >
        {/* Left: Back / Cancel */}
        <button
          type="button"
          onClick={handleLeftButton}
          className="btn-secondary"
          style={{ minWidth: '80px' }}
          disabled={isSubmitting}
        >
          {leftLabel}
        </button>

        {/* Right group: Save draft + Next/Submit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Save draft — text button */}
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={isSaving || isSubmitting || !isDirty}
            style={{
              fontFamily:  'var(--font-sans)',
              fontWeight:  600,
              fontSize:    '14px',
              color:       isSaving || !isDirty ? 'var(--color-text-secondary)' : 'var(--color-forest)',
              background:  'none',
              border:      'none',
              cursor:      isSaving || !isDirty ? 'not-allowed' : 'pointer',
              padding:     '0.5rem',
              display:     'flex',
              alignItems:  'center',
              gap:         '6px',
              opacity:     !isDirty ? 0.5 : 1,
            }}
            onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
            onBlur={e  => (e.currentTarget.style.outline = 'none')}
          >
            {isSaving && <Loader2 size={14} className="spin" aria-hidden="true" />}
            {isSaving ? 'Saving...' : 'Save draft'}
          </button>

          {/* Next / Submit */}
          <button
            type="button"
            onClick={onNext}
            disabled={!canProceed || isSubmitting}
            className="btn-primary"
            style={{
              minWidth: '120px',
              justifyContent: 'center',
              opacity: !canProceed || isSubmitting ? 0.6 : 1,
              cursor:  !canProceed || isSubmitting ? 'not-allowed' : 'pointer',
            }}
            onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
            onBlur={e  => (e.currentTarget.style.outline = 'none')}
          >
            {isSubmitting && <Loader2 size={15} className="spin" aria-hidden="true" />}
            {isSubmitting ? 'Submitting...' : rightLabel}
          </button>
        </div>
      </div>

      {/* ── Cancel confirmation dialog ── */}
      {showCancelDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-dialog-title"
          style={{
            position:        'fixed',
            inset:           0,
            zIndex:          300,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            padding:         '1rem',
            backgroundColor: 'rgba(23,37,34,0.45)',
          }}
          onClick={() => setShowCancelDialog(false)}
        >
          <div
            className="card"
            style={{ maxWidth: '400px', width: '100%' }}
            onClick={e => e.stopPropagation()}
          >
            <h3
              id="cancel-dialog-title"
              style={{
                fontFamily:   'var(--font-serif)',
                fontWeight:   600,
                fontSize:     '18px',
                color:        'var(--color-charcoal)',
                margin:       '0 0 0.75rem 0',
              }}
            >
              Discard this booking?
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   '14px',
                color:      'var(--color-text-secondary)',
                margin:     '0 0 1.25rem 0',
              }}
            >
              Your progress has not been saved. If you leave, the information you
              entered will be lost.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowCancelDialog(false)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => { setShowCancelDialog(false); onCancel() }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spinner keyframes */}
      <style>{`
        .spin { animation: step-spin 0.8s linear infinite; }
        @keyframes step-spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}
