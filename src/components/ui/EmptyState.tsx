interface EmptyStateProps {
  icon?:   React.ReactNode
  title:   string
  text?:   string
  action?: React.ReactNode
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
// Centered icon tile, title, supporting text and an optional action. One
// consistent empty/no-results pattern across lists and tables.
export default function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 'var(--space-12) var(--space-6)', gap: 'var(--space-2)',
    }}>
      {icon && (
        <div aria-hidden="true" style={{
          width: '48px', height: '48px', borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-sage)', color: 'var(--color-text-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 'var(--space-1)',
        }}>
          {icon}
        </div>
      )}
      <p style={{ fontFamily: 'var(--font-serif)', fontWeight: 600,
        fontSize: 'var(--text-base)', color: 'var(--color-charcoal)', margin: 0 }}>
        {title}
      </p>
      {text && (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)', margin: 0, maxWidth: '42ch' }}>
          {text}
        </p>
      )}
      {action && <div style={{ marginTop: 'var(--space-2)' }}>{action}</div>}
    </div>
  )
}
