import { useState } from 'react'
import { Video, Copy, Check, ExternalLink, CalendarPlus, Clock, Mail, ShieldCheck } from 'lucide-react'
import { googleCalendarUrl } from '../../utils/calendar'
import { isCustomMeetLink, GOOGLE_MEET_NEW_URL, getRelativeMeetingTiming } from '../../utils/googleMeet'
import EmailPreviewModal from './EmailPreviewModal'
import MeetingTimingModal from './MeetingTimingModal'
import { getSentEmailForAppointment } from '../../services/emailService'
import type { ApprovalRecord } from '../../data/approvalData'

interface GoogleMeetCardProps {
  appointmentId?: string
  meetUrl: string
  date?: string
  time?: string
  rawDate?: string
  rawTime?: string
  subject?: string
  authorityName?: string
  department?: string
  requesterName?: string
  status?: string
  showCalendarButton?: boolean
  appointmentRecord?: ApprovalRecord
}

export default function GoogleMeetCard({
  appointmentId,
  meetUrl,
  date,
  time,
  rawDate,
  rawTime,
  subject,
  authorityName,
  department,
  requesterName,
  status,
  showCalendarButton = true,
  appointmentRecord,
}: GoogleMeetCardProps) {
  const [copied, setCopied] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showTimingModal, setShowTimingModal] = useState(false)

  const hasRealCustomLink = isCustomMeetLink(meetUrl)
  // If custom link provided, open it. Otherwise open Google Meet live room
  const activeJoinUrl = hasRealCustomLink ? meetUrl : GOOGLE_MEET_NEW_URL

  const isConfirmed = status === 'confirmed' || status === 'completed'
  const isApproved = status === 'approved'
  const isPending = !isConfirmed && !isApproved

  // Parse meeting timing to detect future appointments
  const effDate = rawDate || appointmentRecord?.date || date
  const effTime = rawTime || appointmentRecord?.time || time
  const timing = getRelativeMeetingTiming(effDate, effTime)

  function handleCopy() {
    navigator.clipboard.writeText(meetUrl || activeJoinUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleJoinClick(e: React.MouseEvent) {
    if (timing && timing.isFuture) {
      e.preventDefault()
      setShowTimingModal(true)
    }
  }

  function handleJoinAnyway() {
    setShowTimingModal(false)
    window.open(activeJoinUrl, '_blank', 'noopener,noreferrer')
  }

  const calUrl = (showCalendarButton && effDate && effTime)
    ? googleCalendarUrl({
        title: `Appointment: ${subject || 'Video Consultation'}`,
        date: effDate,
        time: effTime,
        details: `Online Video Consultation via Google Meet.\n\nJoin Google Meet: ${activeJoinUrl}\n${authorityName ? `With: ${authorityName}` : ''}`.trim(),
        location: activeJoinUrl,
        meetingUrl: activeJoinUrl,
      })
    : null

  // Resolve sent email for preview modal
  const sentEmail = appointmentRecord
    ? getSentEmailForAppointment(appointmentRecord)
    : (appointmentId
        ? getSentEmailForAppointment({
            id: appointmentId,
            requester: requesterName || 'Requester',
            requesterInitials: 'RQ',
            requesterCategory: 'Staff',
            typeId: 'academic',
            typeName: 'Academic Consultation',
            purposeLabel: subject || 'Consultation',
            department: department || 'Academic Affairs',
            authorityId: 'auth-1',
            authorityName: authorityName || 'Authority',
            date: effDate || '',
            time: effTime || '',
            subject: subject || 'Consultation',
            description: '',
            mode: 'online',
            locationLabel: meetUrl,
            meetingUrl: meetUrl,
            documentsCount: 0,
            status: (status as any) || 'confirmed',
            submittedAt: new Date().toISOString(),
            assignedStage: 'Confirmed',
            assignedRole: 'coordinator_authority',
            assignedToId: 'auth-1',
            updatedAt: new Date().toISOString(),
          })
        : null)

  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '1.125rem',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: '#F0FDF4',
        border: '1px solid #BBF7D0',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.875rem',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: '#DCFCE7',
              color: '#15803D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Video size={18} aria-hidden="true" />
          </div>
          <div>
            <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px', color: '#166534', margin: 0 }}>
              Google Meet Video Consultation
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#15803D', margin: '1px 0 0 0' }}>
              {isPending
                ? 'Online consultation scheduled upon confirmation'
                : 'Automated video room with calendar reminder'}
            </p>
          </div>
        </div>

        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '999px',
            backgroundColor: isPending ? '#E0F2FE' : '#DCFCE7',
            color: isPending ? '#0369A1' : '#166534',
            border: `1px solid ${isPending ? '#BAE6FD' : '#86EFAC'}`,
          }}
        >
          {isPending ? 'Scheduled on Confirmation' : (isConfirmed ? 'Confirmed · Online' : 'Approved · Online')}
        </span>
      </div>

      {/* State 1: When pending approval / slot */}
      {isPending ? (
        <div
          style={{
            padding: '0.75rem 0.875rem',
            backgroundColor: '#FFFFFF',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #BAE6FD',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <Clock size={15} style={{ color: '#0284C7', marginTop: '2px', flexShrink: 0 }} />
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: '#0369A1', margin: 0, lineHeight: 1.5 }}>
              The Google Meet link will be <strong>automatically generated and emailed to the requester</strong> with an <strong>Add to Google Calendar</strong> reminder as soon as the appointment is approved and confirmed.
            </p>
          </div>
        </div>
      ) : (
        /* State 2: When approved or confirmed */
        <>
          {/* Meet link row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '0.5rem 0.75rem',
              backgroundColor: '#FFFFFF',
              border: '1px solid #86EFAC',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <ShieldCheck size={14} style={{ color: '#16A34A', flexShrink: 0 }} />
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#14532D',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  userSelect: 'all',
                }}
                title={meetUrl}
              >
                {meetUrl || activeJoinUrl}
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? 'Link copied' : 'Copy Google Meet link'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '0.25rem 0.55rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid #86EFAC',
                backgroundColor: copied ? '#DCFCE7' : '#F0FDF4',
                color: '#15803D',
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'all 0.15s ease',
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Slot reminder */}
          {date && time && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#166534' }}>
                <Clock size={13} aria-hidden="true" />
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: '#166534' }}>
                  Consultation slot: <strong>{time}</strong> on <strong>{date}</strong>
                </span>
              </div>

              {/* Relative timing badge */}
              {timing && timing.isFuture && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '2px 8px',
                    backgroundColor: '#FEF3C7',
                    borderRadius: '6px',
                    border: '1px solid #FDE68A',
                    width: 'fit-content',
                    marginTop: '2px',
                  }}
                >
                  <Clock size={11} style={{ color: '#B45309' }} />
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#92400E', fontWeight: 500 }}>
                    Scheduled for <strong>{timing.relativeText}</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
            <a
              href={activeJoinUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleJoinClick}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0.45rem 0.95rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: '#16A34A',
                color: '#FFFFFF',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 600,
                textDecoration: 'none',
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#15803D')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#16A34A')}
            >
              <Video size={14} aria-hidden="true" />
              Join Google Meet
              <ExternalLink size={12} aria-hidden="true" style={{ opacity: 0.8 }} />
            </a>

            {calUrl && (
              <a
                href={calUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0.45rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #BBF7D0',
                  color: '#166534',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  fontWeight: 500,
                  textDecoration: 'none',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F0FDF4')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
              >
                <CalendarPlus size={14} aria-hidden="true" />
                Add to Google Calendar
              </a>
            )}

            {sentEmail && (
              <button
                type="button"
                onClick={() => setShowEmailModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0.45rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#475569',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
              >
                <Mail size={14} aria-hidden="true" />
                View Sent Email
              </button>
            )}
          </div>
        </>
      )}

      {/* Meeting Timing Guard Modal */}
      {showTimingModal && timing && (
        <MeetingTimingModal
          relativeText={timing.relativeText}
          formattedDate={timing.formattedDate}
          formattedTime={timing.formattedTime}
          authorityName={authorityName}
          subject={subject}
          meetUrl={meetUrl || activeJoinUrl}
          calendarUrl={calUrl}
          onClose={() => setShowTimingModal(false)}
          onJoinAnyway={handleJoinAnyway}
        />
      )}

      {/* Email Preview Modal */}
      {showEmailModal && sentEmail && (
        <EmailPreviewModal email={sentEmail} onClose={() => setShowEmailModal(false)} />
      )}
    </div>
  )
}
