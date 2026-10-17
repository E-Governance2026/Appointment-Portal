import { useRef, useEffect } from 'react'
import { VerticalStepper, HorizontalProgress } from './BookingStepper'
import { STEP_LABELS } from '../../store/bookingStore'

interface BookingLayoutProps {
  currentStep:      number
  highestValidStep: number
  onStepClick:      (step: number) => void
  children:         React.ReactNode
}

// ─── BookingLayout ────────────────────────────────────────────────────────────
// Renders the page title, step indicator, left stepper, and right content card.
// Focus is moved to the step heading every time currentStep changes.

export default function BookingLayout({
  currentStep,
  highestValidStep,
  onStepClick,
  children,
}: BookingLayoutProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Move focus to heading and announce to screen readers on step change
  useEffect(() => {
    headingRef.current?.focus()
  }, [currentStep])

  const stepLabel = STEP_LABELS[currentStep - 1]

  return (
    <div>
      {/* ── Page title row ── */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 className="page-title">Book appointment</h1>
        <p className="page-subtitle">
          Step {currentStep} of {STEP_LABELS.length}
        </p>
      </div>

      {/* ── Horizontal progress (mobile/tablet) ── */}
      <div className="booking-mobile-progress">
        <HorizontalProgress currentStep={currentStep} />
      </div>

      {/* ── Desktop: stepper + card side by side ── */}
      <div
        className="booking-desktop-layout"
        style={{
          display:    'flex',
          gap:        '1.5rem',
          alignItems: 'flex-start',
        }}
      >
        {/* Left: vertical stepper */}
        <div className="booking-stepper-panel">
          <VerticalStepper
            currentStep={currentStep}
            highestValidStep={highestValidStep}
            onStepClick={onStepClick}
          />
        </div>

        {/* Right: ivory content card */}
        <div
          style={{
            flex:            1,
            minWidth:        0,
            backgroundColor: 'var(--color-ivory)',
            border:          '1px solid var(--color-sage)',
            borderRadius:    '12px',
            padding:         '32px',
            boxShadow:       'var(--shadow-card)',
          }}
        >
          {/* Step heading — receives focus on step change */}
          <h2
            ref={headingRef}
            tabIndex={-1}
            style={{
              fontFamily:  'var(--font-serif)',
              fontWeight:  600,
              fontSize:    '20px',
              color:       'var(--color-charcoal)',
              margin:      '0 0 1.5rem 0',
              outline:     'none',   /* suppress visible focus ring on programmatic focus */
            }}
          >
            {stepLabel}
          </h2>

          {children}
        </div>
      </div>

      {/* ── Responsive overrides ── */}
      <style>{`
        /* Mobile/tablet: hide vertical stepper, show progress bar */
        @media (max-width: 1023px) {
          .booking-stepper-panel   { display: none !important; }
          .booking-mobile-progress { display: block !important; }
        }
        /* Desktop: show vertical stepper, hide progress bar */
        @media (min-width: 1024px) {
          .booking-stepper-panel   { display: block; }
          .booking-mobile-progress { display: none; }
        }
      `}</style>
    </div>
  )
}
