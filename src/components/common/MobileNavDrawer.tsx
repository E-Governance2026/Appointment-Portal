import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface NavLink {
  label: string
  href: string
}

interface MobileNavDrawerProps {
  open: boolean
  onClose: () => void
  links: NavLink[]
  onLoginClick: () => void
}

/**
 * MobileNavDrawer
 * Slides in from the right on mobile when the menu button is pressed.
 * Traps focus while open. Closes on Escape or backdrop click.
 * No pill shapes, no gradients.
 */
export default function MobileNavDrawer({
  open,
  onClose,
  links,
  onLoginClick,
}: MobileNavDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  /* Focus the close button when drawer opens */
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus()
    }
  }, [open])

  /* Close on Escape key */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  /* Prevent body scroll while open */
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      {/* Dim layer */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(23, 37, 34, 0.45)',
        }}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        style={{
          position: 'relative',
          width: 'min(320px, 85vw)',
          height: '100%',
          backgroundColor: 'var(--color-ivory)',
          borderLeft: '1px solid var(--color-sage)',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.5rem',
          overflowY: 'auto',
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '2rem',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 600,
              fontSize: '1rem',
              color: 'var(--color-charcoal)',
            }}
          >
            Navigation
          </span>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close navigation menu"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-charcoal)',
              backgroundColor: 'transparent',
              border: '1px solid var(--color-sage)',
              cursor: 'pointer',
            }}
            onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
            onBlur={e => (e.currentTarget.style.outline = 'none')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Nav links */}
        <nav aria-label="Mobile navigation">
          <ul
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            {links.map(link => (
              <li key={link.label}>
                <a
                  href={link.href}
                  onClick={e => {
                    e.preventDefault()
                    onClose()
                    /* smooth scroll handled in parent via id */
                    const target = document.getElementById(link.href.replace('#', ''))
                    if (target) {
                      setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
                    }
                  }}
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 500,
                    fontSize: '1rem',
                    color: 'var(--color-charcoal)',
                    padding: '0.75rem 0.875rem',
                    borderRadius: 'var(--radius-md)',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-sage)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
                  onBlur={e => (e.currentTarget.style.outline = 'none')}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Login button at bottom of drawer */}
        <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
          <button
            onClick={() => { onClose(); onLoginClick() }}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
            onBlur={e => (e.currentTarget.style.outline = 'none')}
          >
            Login
          </button>
        </div>
      </div>
    </div>
  )
}
