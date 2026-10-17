import { AlertTriangle, X } from 'lucide-react'

interface CancelModalProps {
  appointmentId: string
  onConfirm: () => void
  onClose: () => void
}

export default function CancelModal({ appointmentId, onConfirm, onClose }: CancelModalProps) {
  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(23,37,34,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      {/* Modal card */}
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: '#fee2e2' }}
            >
              <AlertTriangle size={16} style={{ color: '#dc2626' }} />
            </div>
            <h3 className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
              Cancel Appointment
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-border)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm mb-1" style={{ color: 'var(--color-text)' }}>
            Are you sure you want to cancel this appointment?
          </p>
          <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Appointment ID:{' '}
            <span className="font-semibold" style={{ color: 'var(--color-text)' }}>
              {appointmentId}
            </span>
          </p>
          <div
            className="p-3 rounded-xl text-xs mb-4"
            style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', color: '#92400e' }}
          >
            ⚠️ This action cannot be undone. The authority will be notified of the cancellation.
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="btn-secondary flex-1 justify-center py-2.5 text-xs"
            >
              Keep Appointment
            </button>
            <button
              onClick={onConfirm}
              className="btn-danger flex-1 justify-center py-2.5 text-xs"
            >
              Yes, Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
