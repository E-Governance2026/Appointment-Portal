import { useId, useState, useRef } from 'react'

interface TooltipProps {
  label:    string
  side?:    'top' | 'right' | 'bottom' | 'left'
  children: React.ReactElement
}

const DELAY = 150

// ─── Tooltip ──────────────────────────────────────────────────────────────────
// Lightweight, dependency-free tooltip. Shows on hover (150ms delay) and on
// keyboard focus; dismisses on blur, mouse-leave and Escape. The trigger is
// described via aria-describedby. No pointer events on the bubble.
export default function Tooltip({ label, side = 'top', children }: TooltipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => { timer.current = setTimeout(() => setOpen(true), DELAY) }
  const hide = () => { if (timer.current) clearTimeout(timer.current); setOpen(false) }

  const pos: React.CSSProperties =
    side === 'right'  ? { left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' }
    : side === 'left' ? { right: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' }
    : side === 'bottom' ? { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }
    : { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={hide}
      onKeyDown={e => { if (e.key === 'Escape') hide() }}
    >
      <span aria-describedby={open ? id : undefined} style={{ display: 'inline-flex' }}>
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          id={id}
          style={{
            position: 'absolute', zIndex: 200, ...pos,
            backgroundColor: 'var(--color-charcoal)', color: '#ffffff',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 500,
            padding: '4px 10px', borderRadius: 'var(--radius-md)',
            whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: 'var(--elevation-2)',
          }}
        >
          {label}
        </span>
      )}
    </span>
  )
}
