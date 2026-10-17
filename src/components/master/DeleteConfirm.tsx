import { Loader2 } from 'lucide-react'

interface DeleteConfirmProps {
  label:      string        // what is being deleted, e.g. "Finance"
  errorBanner?: string
  submitting: boolean
  onConfirm:  () => void
  onClose:    () => void
}

// ─── DeleteConfirm ────────────────────────────────────────────────────────────
export default function DeleteConfirm({ label, errorBanner, submitting, onConfirm, onClose }: DeleteConfirmProps) {
  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title"
      style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '1rem',
        backgroundColor: 'rgba(23,37,34,0.45)' }}
      onClick={() => !submitting && onClose()}
    >
      <div className="card" style={{ maxWidth: '400px', width: '100%' }} onClick={e => e.stopPropagation()}>
        <h3 id="delete-confirm-title" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600,
          fontSize: '18px', color: 'var(--color-charcoal)', margin: '0 0 0.5rem 0' }}>
          Delete {label}
        </h3>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)',
          margin: '0 0 1rem 0', lineHeight: 1.5 }}>
          This cannot be undone.
        </p>

        {errorBanner && (
          <div role="alert" style={{ padding: '10px 14px', backgroundColor: '#fce8e6',
            border: '1px solid #f5c6c4', borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#7d1c18', marginBottom: '1rem' }}>
            {errorBanner}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting} style={{ fontSize: '14px' }}>
            Keep
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={submitting}
            style={{ fontSize: '14px', minWidth: '96px', justifyContent: 'center', opacity: submitting ? 0.7 : 1 }}>
            {submitting && <Loader2 size={15} className="spin" aria-hidden="true" />}
            {submitting ? 'Deleting...' : 'Delete'}
          </button>
        </div>

        <style>{`
          .spin { animation: dc-spin 0.8s linear infinite; }
          @keyframes dc-spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  )
}
