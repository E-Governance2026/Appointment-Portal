interface PageContainerProps {
  children: React.ReactNode
}

// ─── PageContainer ────────────────────────────────────────────────────────────
// Caps content at 1440px and applies the standard page padding (24px, 32px from
// 768px up). One wrapper so every route has the same gutters and max width.
export default function PageContainer({ children }: PageContainerProps) {
  return (
    <div className="page-container">
      {children}
      <style>{`
        .page-container {
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          padding: var(--space-6) var(--space-6);
        }
        @media (min-width: 768px) {
          .page-container { padding: var(--space-6) var(--space-8); }
        }
      `}</style>
    </div>
  )
}
