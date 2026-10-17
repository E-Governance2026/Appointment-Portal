interface Crumb { label: string; href?: string }

interface PageHeaderProps {
  title:        string
  description?: string
  breadcrumb?:  Crumb[]
  actions?:     React.ReactNode
}

// ─── PageHeader ───────────────────────────────────────────────────────────────
// Optional breadcrumb, H1 in Source Serif 4 (28px via .page-title), optional
// 15px description, right-aligned actions. Stacks on mobile.
export default function PageHeader({ title, description, breadcrumb, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div style={{ minWidth: 0 }}>
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" style={{ marginBottom: 'var(--space-1)' }}>
            <ol style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {breadcrumb.map((c, i) => (
                <li key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {c.href ? <a href={c.href} style={{ color: 'inherit' }}>{c.label}</a> : <span>{c.label}</span>}
                  {i < breadcrumb.length - 1 && <span aria-hidden="true">/</span>}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="page-title">{title}</h1>
        {description && (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', lineHeight: 1.5,
            color: 'var(--color-text-secondary)', margin: 'var(--space-1) 0 0 0' }}>
            {description}
          </p>
        )}
      </div>

      {actions && <div className="page-header-actions">{actions}</div>}

      <style>{`
        .page-header {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          margin-bottom: var(--space-6);
        }
        .page-header-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
        @media (min-width: 768px) {
          .page-header {
            flex-direction: row;
            align-items: flex-start;
            justify-content: space-between;
          }
          .page-header-actions { justify-content: flex-end; flex-shrink: 0; }
        }
      `}</style>
    </div>
  )
}
