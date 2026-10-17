import { forwardRef } from 'react'

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required for screen readers — an icon-only button has no text. */
  'aria-label': string
  /** Opt into the white focus ring on dark/forest surfaces. */
  onDark?: boolean
  /** Visual tone of the hover fill. */
  tone?: 'default' | 'danger'
}

// ─── IconButton ───────────────────────────────────────────────────────────────
// 44px touch target, transparent until hover, global focus-visible ring.
// aria-label is required by the type.
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { onDark = false, tone = 'default', className, style, children, ...rest }, ref,
) {
  const hover = onDark ? 'var(--color-on-forest-08)' : 'var(--color-sage)'
  const color = tone === 'danger' ? 'var(--color-danger)'
    : onDark ? 'rgb(255 255 255 / 0.85)' : 'var(--color-charcoal)'

  return (
    <button
      ref={ref}
      className={[onDark ? 'on-dark' : '', className ?? ''].filter(Boolean).join(' ')}
      style={{
        width: '44px', height: '44px', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--radius-md)', border: 'none', background: 'transparent',
        color, cursor: 'pointer',
        transition: 'background-color var(--motion-fast) var(--ease-out)',
        ...style,
      }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = hover)}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
      {...rest}
    >
      {children}
    </button>
  )
})

export default IconButton
