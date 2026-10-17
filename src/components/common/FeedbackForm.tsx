import { useState } from 'react'
import { Star, Send, CheckCircle2 } from 'lucide-react'

interface FeedbackFormProps {
  appointmentId: string
  onSubmit: (rating: number, comment: string) => void
  onClose: () => void
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
}

export default function FeedbackForm({ appointmentId, onSubmit, onClose }: FeedbackFormProps) {
  const [rating, setRating]     = useState(0)
  const [hovered, setHovered]   = useState(0)
  const [comment, setComment]   = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit() {
    if (rating === 0) return
    onSubmit(rating, comment)
    setSubmitted(true)
  }

  const displayRating = hovered || rating

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(23,37,34,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {submitted ? (
          /* ── Thank you screen ── */
          <div className="p-8 text-center">
            <div
              className="w-14 h-14 rounded flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: 'rgba(15,128,107,0.1)' }}
            >
              <CheckCircle2 size={28} style={{ color: 'var(--color-secondary)' }} />
            </div>
            <h3 className="font-bold text-base mb-2" style={{ color: 'var(--color-text)' }}>
              Thank You!
            </h3>
            <p className="text-xs mb-5" style={{ color: 'var(--color-text-muted)' }}>
              Your feedback has been submitted successfully. It helps us improve the appointment experience.
            </p>
            <button onClick={onClose} className="btn-primary w-full justify-center py-2.5 text-xs">
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              className="px-5 py-4 border-b"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <h3 className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
                Rate Your Experience
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                Appointment: <span className="font-semibold">{appointmentId}</span>
              </p>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4">
              {/* Stars */}
              <div className="text-center">
                <p className="text-xs font-medium mb-3" style={{ color: 'var(--color-text)' }}>
                  How was your appointment experience?
                </p>

                <div className="flex items-center justify-center gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHovered(star)}
                      onMouseLeave={() => setHovered(0)}
                      className="transition-all duration-100"
                      style={{ transform: displayRating >= star ? 'scale(1.15)' : 'scale(1)' }}
                    >
                      <Star
                        size={32}
                        style={{
                          fill: displayRating >= star ? '#F4A340' : 'transparent',
                          color: displayRating >= star ? '#F4A340' : 'var(--color-border)',
                          transition: 'all 0.1s',
                        }}
                      />
                    </button>
                  ))}
                </div>

                {displayRating > 0 && (
                  <p
                    className="text-xs font-semibold"
                    style={{ color: 'var(--color-secondary)' }}
                  >
                    {RATING_LABELS[displayRating]}
                  </p>
                )}
              </div>

              {/* Comment */}
              <div>
                <label className="input-label">
                  Comments{' '}
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
                    (optional)
                  </span>
                </label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  placeholder="Share your experience or suggestions..."
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="btn-secondary flex-1 justify-center py-2.5 text-xs"
                >
                  Skip
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={rating === 0}
                  className="btn-primary flex-1 justify-center py-2.5 text-xs gap-1.5"
                  style={{ opacity: rating === 0 ? 0.5 : 1, cursor: rating === 0 ? 'not-allowed' : 'pointer' }}
                >
                  <Send size={12} />
                  Submit Feedback
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
