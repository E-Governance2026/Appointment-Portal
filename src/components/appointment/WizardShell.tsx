import { CheckCircle2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface WizardStep {
  number: number
  label: string
  shortLabel: string
}

interface WizardShellProps {
  steps: WizardStep[]
  currentStep: number          // 1-based
  children: React.ReactNode
  onNext: () => void
  onBack: () => void
  onCancel: () => void
  nextLabel?: string
  nextDisabled?: boolean
  isLastStep?: boolean
  isSubmitting?: boolean
  hideFooter?: boolean
}

// ─── WizardShell Component ────────────────────────────────────────────────────
export default function WizardShell({
  steps,
  currentStep,
  children,
  onNext,
  onBack,
  onCancel,
  nextLabel,
  nextDisabled = false,
  isLastStep = false,
  isSubmitting = false,
  hideFooter = false,
}: WizardShellProps) {
  const progressPct = ((currentStep - 1) / (steps.length - 1)) * 100

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {/* ── Step Header ── */}
      <div
        className="px-6 pt-5 pb-4"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        {/* Step labels row */}
        <div className="flex items-center justify-between mb-3">
          {steps.map((step) => {
            const isDone    = step.number < currentStep
            const isActive  = step.number === currentStep
            const isFuture  = step.number > currentStep

            return (
              <div key={step.number} className="flex flex-col items-center gap-1 flex-1">
                {/* Circle */}
                <div
                  className="w-8 h-8 rounded flex items-center justify-center transition-all duration-300 flex-shrink-0"
                  style={{
                    backgroundColor: isDone
                      ? 'var(--color-secondary)'
                      : isActive
                      ? 'var(--color-primary)'
                      : 'var(--color-border)',
                    color: isDone || isActive ? '#fff' : 'var(--color-text-muted)',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                  }}
                >
                  {isDone ? <CheckCircle2 size={15} /> : step.number}
                </div>

                {/* Label */}
                <span
                  className="text-center leading-tight hidden sm:block"
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive
                      ? 'var(--color-primary)'
                      : isDone
                      ? 'var(--color-secondary)'
                      : 'var(--color-text-muted)',
                    maxWidth: '80px',
                  }}
                >
                  {step.shortLabel}
                </span>
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        <div
          className="h-1.5 rounded overflow-hidden"
          style={{ backgroundColor: 'var(--color-border)' }}
        >
          <div
            className="h-full rounded transition-all duration-500 ease-in-out"
            style={{
              width: `${progressPct}%`,
              background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
            }}
          />
        </div>

        {/* Step counter */}
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          Step{' '}
          <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
            {currentStep}
          </span>{' '}
          of {steps.length} —{' '}
          <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>
            {steps[currentStep - 1]?.label}
          </span>
        </p>
      </div>

      {/* ── Step Content ── */}
      <div className="p-6">{children}</div>

      {/* ── Footer Navigation ── */}
      {!hideFooter && (
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary py-2 px-4 text-xs"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={onBack}
                className="btn-secondary py-2 px-4 text-xs"
                disabled={isSubmitting}
              >
                ← Back
              </button>
            )}

            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled || isSubmitting}
              className="btn-primary py-2 px-5 text-xs"
              style={{
                opacity: nextDisabled || isSubmitting ? 0.5 : 1,
                cursor: nextDisabled || isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin inline-block mr-1">⟳</span>
                  Submitting...
                </>
              ) : isLastStep ? (
                nextLabel ?? 'Submit Appointment'
              ) : (
                (nextLabel ?? 'Next') + ' →'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
