import { useEffect, useRef } from 'react'

interface Props {
  secondsLeft:    number
  onStaySignedIn: () => void
  onSignOutNow:   () => void
}

// ─── SessionWarningDialog ────────────────────────────────────────────────────
// Accessible modal alertdialog shown when the idle timeout is imminent.
// Focus is trapped inside. Only the two buttons dismiss it (not Escape, not
// clicking the backdrop — Escape maps to "Stay signed in" per spec).
export default function SessionWarningDialog({ secondsLeft, onStaySignedIn, onSignOutNow }: Props) {
  const stayRef = useRef<HTMLButtonElement>(null)
  // Announce remaining time to screen readers at key intervals.
  const announceRef = useRef<HTMLDivElement>(null)
  const lastAnnounced = useRef<number>(-1)

  // Focus the primary button when the dialog opens.
  useEffect(() => {
    stayRef.current?.focus()
  }, [])

  // Polite live-region announcements at 30, 20, 10, 5 seconds.
  useEffect(() => {
    const announce = [30, 20, 10, 5]
    if (announce.includes(secondsLeft) && secondsLeft !== lastAnnounced.current) {
      lastAnnounced.current = secondsLeft
      if (announceRef.current) {
        announceRef.current.textContent = ''
        requestAnimationFrame(() => {
          if (announceRef.current)
            announceRef.current.textContent = `You will be signed out in ${secondsLeft} seconds.`
        })
      }
    }
  }, [secondsLeft])

  // Focus trap: Tab / Shift+Tab cycles between the two buttons only.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onStaySignedIn(); return }
    if (e.key !== 'Tab') return
    const els = [stayRef.current, document.getElementById('session-signout-btn')]
      .filter(Boolean) as HTMLElement[]
    if (els.length < 2) return
    const first = els[0], last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          backgroundColor: 'rgba(0,0,0,0.5)',
          backdropFilter: prefersReducedMotion ? 'none' : 'blur(2px)',
        }}
      />

      {/* Dialog */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-warn-title"
        aria-describedby="session-warn-desc"
        onKeyDown={handleKeyDown}
        style={{
          position: 'fixed', inset: 0, zIndex: 9001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <div style={{
          backgroundColor: 'var(--color-ivory)',
          border: '1px solid var(--color-sage)',
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '420px',
          width: '100%',
          boxShadow: 'var(--elevation-3)',
        }}>
          {/* Icon */}
          <div style={{
            width: '48px', height: '48px', borderRadius: '50%',
            backgroundColor: '#FEF9C3', display: 'flex', alignItems: 'center',
            justifyContent: 'center', marginBottom: '1.25rem',
          }}>
            <span aria-hidden="true" style={{ fontSize: '22px' }}>⏱</span>
          </div>

          <h2
            id="session-warn-title"
            style={{
              fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '20px',
              color: 'var(--color-charcoal)', margin: '0 0 0.75rem 0',
            }}
          >
            You are about to be signed out
          </h2>

          <p
            id="session-warn-desc"
            style={{
              fontFamily: 'var(--font-sans)', fontSize: '15px', lineHeight: 1.6,
              color: 'var(--color-text-secondary)', margin: '0 0 1.75rem 0',
            }}
          >
            You will be signed out in{' '}
            <strong style={{ color: 'var(--color-charcoal)' }}>
              {secondsLeft} second{secondsLeft !== 1 ? 's' : ''}
            </strong>{' '}
            because there has been no activity.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              ref={stayRef}
              type="button"
              onClick={onStaySignedIn}
              className="btn-primary"
              style={{ flex: '1 1 auto' }}
            >
              Stay signed in
            </button>
            <button
              id="session-signout-btn"
              type="button"
              onClick={onSignOutNow}
              className="btn-secondary"
              style={{ flex: '1 1 auto' }}
            >
              Sign out now
            </button>
          </div>
        </div>
      </div>

      {/* Live region for screen-reader announcements */}
      <div
        ref={announceRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
      />
    </>
  )
}
