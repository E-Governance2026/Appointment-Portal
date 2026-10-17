interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Interactive cards lift + brighten their border on hover and show a focus ring. */
  interactive?: boolean
}

// ─── Card ─────────────────────────────────────────────────────────────────────
// Thin wrapper over the shared .card / .card-interactive classes so callers get
// the one canonical surface. Extra className/style still compose.
export default function Card({ interactive = false, className, children, ...rest }: CardProps) {
  const classes = ['card', interactive ? 'card-interactive' : '', className ?? '']
    .filter(Boolean).join(' ')
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  )
}
