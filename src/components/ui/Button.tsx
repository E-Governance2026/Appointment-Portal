import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?:    Size
  loading?: boolean
  /** Opt into the white focus ring for dark/forest surfaces. */
  onDark?:  boolean
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary:   'btn-primary',
  secondary: 'btn-secondary',
  ghost:     'btn-ghost',
  danger:    'btn-danger',
  accent:    'btn-accent',
}
const SIZE_CLASS: Record<Size, string> = { sm: 'btn-sm', md: 'btn-md', lg: 'btn-lg' }

// ─── Button ───────────────────────────────────────────────────────────────────
// One button for the app. States (hover, pressed, focus, disabled) come from
// the shared CSS classes; loading shows a spinner and keeps the label so the
// width does not jump.
export default function Button({
  variant = 'primary', size = 'md', loading = false, onDark = false,
  disabled, className, children, style, ...rest
}: ButtonProps) {
  const classes = [
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    onDark ? 'on-dark' : '',
    className ?? '',
  ].filter(Boolean).join(' ')

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      style={style}
      {...rest}
    >
      {loading && <Loader2 size={size === 'lg' ? 17 : 15} className="spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
