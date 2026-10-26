import { X, CalendarPlus, ExternalLink, Mail, CheckCircle2, Video } from 'lucide-react'
import type { SentEmail } from '../../services/emailService'

interface EmailPreviewModalProps {
  email: SentEmail
  onClose: () => void
}

export default function EmailPreviewModal({ email, onClose }: EmailPreviewModalProps) {
  const formattedDate = email.date
    ? new Date(email.date + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Scheduled Date'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-preview-title"
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
          maxWidth: '620px',
          maxHeight: '90vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
        }}
      >
        {/* Modal Top Bar */}
        <div
          style={{
            padding: '0.875rem 1.25rem',
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
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                backgroundColor: '#DCFCE7',
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Mail size={15} />
            </div>
            <div>
              <h3 id="email-preview-title" style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 600, color: '#0F172A', margin: 0 }}>
                Automated Confirmation Email
              </h3>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#64748B', margin: 0 }}>
                Dispatched automatically to the requester upon confirmation
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close email preview"
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

        {/* Email Header Metadata */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
            backgroundColor: '#F1F5F9',
            borderBottom: '1px solid #E2E8F0',
            fontSize: '12px',
            fontFamily: 'var(--font-sans)',
            color: '#475569',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div>
            <strong style={{ color: '#0F172A' }}>From: </strong> {email.from}
          </div>
          <div>
            <strong style={{ color: '#0F172A' }}>To: </strong> {email.recipientName} &lt;{email.to}&gt;
          </div>
          <div>
            <strong style={{ color: '#0F172A' }}>Subject: </strong>{' '}
            <span style={{ fontWeight: 600, color: '#0F172A' }}>{email.subject}</span>
          </div>
          <div style={{ fontSize: '11px', color: '#64748B' }}>
            <strong>Sent: </strong> {new Date(email.sentAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        </div>

        {/* Email Body (Rendered as styled university email) */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* University Letterhead */}
          <div
            style={{
              borderBottom: '2px solid #0284C7',
              paddingBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                Parul University
              </h2>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#64748B', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Management Information System · Appointment Portal
              </p>
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '999px',
                backgroundColor: '#DCFCE7',
                color: '#166534',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={12} /> Confirmed
            </span>
          </div>

          {/* Salutation & Intro */}
          <div>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#1E293B', margin: '0 0 0.5rem 0', fontWeight: 500 }}>
              Dear {email.recipientName},
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
              Your appointment request <strong>{email.appointmentId}</strong> has been approved and confirmed.
              {email.mode === 'online'
                ? ' An official Google Meet video conference link has been generated for your session below.'
                : ' Please report to campus at the scheduled time.'}
            </p>
          </div>

          {/* Appointment Summary Box */}
          <div
            style={{
              padding: '1rem',
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
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Appointment ID:</span>
              <strong style={{ color: '#0F172A' }}>{email.appointmentId}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Authority:</span>
              <strong style={{ color: '#0F172A' }}>{email.authorityName} ({email.department})</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Date:</span>
              <strong style={{ color: '#0F172A' }}>{formattedDate}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Time Slot:</span>
              <strong style={{ color: '#0F172A' }}>{email.time}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Consultation Method:</span>
              <span style={{ fontWeight: 600, color: email.mode === 'online' ? '#166534' : '#0F172A' }}>
                {email.mode === 'online' ? '🎥 Online Video (Google Meet)' : '🏛️ Physical (Campus Office)'}
              </span>
            </div>
          </div>

          {/* Online Meet Box inside Email */}
          {email.mode === 'online' && email.meetingUrl && (
            <div
              style={{
                padding: '1.125rem',
                backgroundColor: '#F0FDF4',
                borderRadius: '12px',
                border: '1px solid #86EFAC',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Video size={16} color="#166534" />
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                  Official Google Meet Video Room
                </span>
              </div>

              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '6px',
                  border: '1px solid #BBF7D0',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  color: '#14532D',
                  fontWeight: 600,
                  wordBreak: 'break-all',
                }}
              >
                {email.meetingUrl}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                <a
                  href={email.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    backgroundColor: '#16A34A',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <Video size={14} /> Join Google Meet <ExternalLink size={12} />
                </a>

                <a
                  href={email.calendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '0.5rem 0.9rem',
                    borderRadius: '8px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #86EFAC',
                    color: '#15803D',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <CalendarPlus size={14} /> Add to Google Calendar & Meet
                </a>
              </div>

              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#15803D', margin: 0 }}>
                💡 Click <strong>Add to Google Calendar</strong> to automatically sync this appointment and receive meeting reminders on your phone and computer.
              </p>
            </div>
          )}

          {/* Email Footer Note */}
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#94A3B8', margin: 0, borderTop: '1px solid #E2E8F0', paddingTop: '0.75rem' }}>
            This is an automated notification from the Parul University MIS Appointment Portal.
            If you need to reschedule or cancel, please visit the portal using your Appointment ID.
          </p>
        </div>
      </div>
    </div>
  )
}
