import { CheckCircle2 } from 'lucide-react'
import { STEP_LABELS, STEP_COUNT } from '../../store/bookingStore'

interface BookingStepperProps {
  currentStep: number          // 1-based
  highestValidStep: number     // steps up to this index are clickable
  onStepClick: (step: number) => void
}

// ─── Vertical stepper — desktop only (hidden below 1024px) ───────────────────
export function VerticalStepper({ currentStep, highestValidStep, onStepClick }: BookingStepperProps) {
  return (
    <nav
      aria-label="Booking steps"
      style={{
        width:           '280px',
        flexShrink:      0,
        backgroundColor: 'var(--color-ivory)',
        border:          '1px solid var(--color-sage)',
        borderRadius:    '12px',
        padding:         '1.5rem 1.25rem',
        alignSelf:       'flex-start',
        position:        'sticky',
        top:             'calc(3.5rem + 1.25rem)',   /* below navbar */
      }}
    >
      <p
        style={{
          fontFamily:  'var(--font-sans)',
          fontSize:    '12px',
          fontWeight:  600,
          color:       'var(--color-text-secondary)',
          marginBottom:'1rem',
          letterSpacing: '0.04em',
        }}
      >
        Booking steps
      </p>

      <ol style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {STEP_LABELS.map((label, idx) => {
          const stepNum  = idx + 1
          const isDone   = stepNum < currentStep
          const isActive = stepNum === currentStep
          const isClickable = isDone || stepNum <= highestValidStep

          return (
            <li key={stepNum}>
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(stepNum)}
                aria-current={isActive ? 'step' : undefined}
                style={{
                  display:         'flex',
                  alignItems:      'center',
                  gap:             '12px',
                  width:           '100%',
                  padding:         '8px 10px',
                  borderRadius:    '6px',
                  border:          'none',
                  backgroundColor: isActive ? 'rgba(7,59,53,0.07)' : 'transparent',
                  cursor:          isClickable ? 'pointer' : 'not-allowed',
                  opacity:         !isClickable && !isDone && !isActive ? 0.45 : 1,
                  textAlign:       'left',
                }}
                onFocus={e  => { if (isClickable) e.currentTarget.style.outline = '2px solid var(--color-emerald)' }}
                onBlur={e   => (e.currentTarget.style.outline = 'none')}
                onMouseEnter={e => { if (isClickable && !isActive) e.currentTarget.style.backgroundColor = 'var(--color-sage)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                {/* Step indicator circle */}
                <span
                  style={{
                    width:           '28px',
                    height:          '28px',
                    borderRadius:    '50%',
                    flexShrink:      0,
                    display:         'flex',
                    alignItems:      'center',
                    justifyContent:  'center',
                    backgroundColor: isDone
                      ? 'var(--color-emerald)'
                      : isActive
                      ? 'var(--color-forest)'
                      : 'var(--color-sage)',
                    color: isDone || isActive ? '#ffffff' : 'var(--color-text-secondary)',
                    fontSize: '13px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-sans)',
                  }}
                  aria-hidden="true"
                >
                  {isDone
                    ? <CheckCircle2 size={15} aria-hidden="true" />
                    : stepNum}
                </span>

                {/* Label */}
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize:   '14px',
                    fontWeight: isActive ? 600 : 400,
                    color:      isActive
                      ? 'var(--color-forest)'
                      : isDone
                      ? 'var(--color-charcoal)'
                      : 'var(--color-text-secondary)',
                    lineHeight: 1.35,
                  }}
                >
                  {label}
                </span>
              </button>

              {/* Connector line between steps */}
              {stepNum < STEP_COUNT && (
                <div
                  aria-hidden="true"
                  style={{
                    width:           '2px',
                    height:          '12px',
                    backgroundColor: stepNum < currentStep
                      ? 'var(--color-emerald)'
                      : 'var(--color-sage)',
                    marginLeft:      '23px',
                    borderRadius:    '1px',
                  }}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ─── Horizontal progress bar — mobile and tablet (< 1024px) ──────────────────
export function HorizontalProgress({ currentStep }: Pick<BookingStepperProps, 'currentStep'>) {
  const label = STEP_LABELS[currentStep - 1]
  const pct   = Math.round(((currentStep - 1) / (STEP_COUNT - 1)) * 100)

  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
        marginBottom:  '1.25rem',
      }}
    >
      {/* Text indicator */}
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize:   '14px',
          color:      'var(--color-text-secondary)',
          margin:     0,
        }}
      >
        Step{' '}
        <span style={{ fontWeight: 600, color: 'var(--color-charcoal)' }}>
          {currentStep} of {STEP_COUNT}
        </span>
        {': '}
        <span style={{ fontWeight: 600, color: 'var(--color-forest)' }}>
          {label}
        </span>
      </p>

      {/* Bar */}
      <div
        role="progressbar"
        aria-valuenow={currentStep}
        aria-valuemin={1}
        aria-valuemax={STEP_COUNT}
        aria-label={`Step ${currentStep} of ${STEP_COUNT}: ${label}`}
        style={{
          height:          '6px',
          backgroundColor: 'var(--color-sage)',
          borderRadius:    '3px',
          overflow:        'hidden',
        }}
      >
        <div
          style={{
            height:          '100%',
            width:           `${pct === 0 ? 8 : pct}%`,
            backgroundColor: 'var(--color-emerald)',
            borderRadius:    '3px',
            transition:      'width 0.3s ease',
          }}
        />
      </div>
    </div>
  )
}
