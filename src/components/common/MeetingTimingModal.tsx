import { X, CalendarPlus, Video, ExternalLink, Clock, Bell } from 'lucide-react'

interface MeetingTimingModalProps {
  relativeText: string
  formattedDate: string
  formattedTime: string
  authorityName?: string
  subject?: string
  meetUrl: string
  calendarUrl?: string | null
  onClose: () => void
  onJoinAnyway: () => void
}

export default function MeetingTimingModal({
  relativeText,
  formattedDate,
  formattedTime,
  authorityName,
  subject,
  meetUrl,
  calendarUrl,
  onClose,
  onJoinAnyway,
}: MeetingTimingModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="timing-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '500px',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
          animation: 'fadeIn 0.15s ease-out',
        }}
      >
        {/* Header bar */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#E0F2FE',
                color: '#0284C7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Clock size={18} />
            </div>
            <div>
              <h3
                id="timing-modal-title"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#0F172A',
                  margin: 0,
                }}
              >
                Meeting Scheduled
              </h3>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#64748B', margin: 0 }}>
                Online Consultation via Google Meet
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748B',
              padding: '4px',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Main Notice Banner */}
          <div
            style={{
              padding: '1rem 1.125rem',
              backgroundColor: '#F0FDF4',
              borderRadius: '12px',
              border: '1px solid #86EFAC',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: '#DCFCE7',
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '2px',
              }}
            >
              <Bell size={18} />
            </div>
            <div>
              <h4
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#166534',
                  margin: '0 0 4px 0',
                }}
              >
                Your meeting is at {relativeText}
              </h4>
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  color: '#15803D',
                  margin: 0,
                  lineHeight: 1.45,
                }}
              >
                This video session is not live yet. Please join at the scheduled time: <strong>{formattedTime}</strong> ({formattedDate}).
              </p>
            </div>
          </div>

          {/* Details summary */}
          <div
            style={{
              padding: '0.875rem 1rem',
              backgroundColor: '#F8FAFC',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '13px',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {authorityName && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Authority:</span>
                <strong style={{ color: '#0F172A' }}>{authorityName}</strong>
              </div>
            )}
            {subject && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Purpose:</span>
                <strong style={{ color: '#0F172A' }}>{subject}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Scheduled Time:</span>
              <strong style={{ color: '#0F172A' }}>{formattedTime} · {formattedDate}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Meeting Platform:</span>
              <span style={{ fontWeight: 600, color: '#166534' }}>Google Meet</span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {calendarUrl && (
              <a
                href={calendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '0.6rem 1rem',
                  borderRadius: '10px',
                  backgroundColor: '#0284C7',
                  color: '#FFFFFF',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                }}
              >
                <CalendarPlus size={15} /> Add to Google Calendar for Reminder
              </a>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                type="button"
                onClick={onJoinAnyway}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#64748B',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Video size={13} /> Open Room Anyway <ExternalLink size={11} />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="btn-primary"
                style={{
                  fontSize: '13px',
                  padding: '0.45rem 1.1rem',
                  backgroundColor: '#16A34A',
                  borderColor: '#16A34A',
                }}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
