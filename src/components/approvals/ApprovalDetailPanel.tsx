import { useState } from 'react'
import { X, Check, Ban, HelpCircle, CheckCircle2, MessageSquarePlus, CircleDot, CalendarClock, XSquare, UserX, ThumbsUp, ThumbsDown } from 'lucide-react'
import { CalendarPlus } from 'lucide-react'
import StatusChip from '../common/StatusChip'
import ActionDialog from './ActionDialog'
import RescheduleDialog from './RescheduleDialog'
import { useAuthStore } from '../../store/authStore'
import { hasPermission } from '../../config/permissions'
import { allowedNextStatuses } from '../../config/statusMachine'
import { googleCalendarUrl } from '../../utils/calendar'
import GoogleMeetCard from '../common/GoogleMeetCard'
import { getAppointmentMeetLink } from '../../utils/googleMeet'
import {
  useApproval, useAppointmentTimeline, useApprove, useReject, useRequestInfo,
  useConfirm, useAddRemark, useProposeReschedule, useRespondReschedule,
  useCancel, useMarkNotReported,
} from '../../hooks/useApprovals'

interface ApprovalDetailPanelProps {
  id:      string
  onClose: () => void
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suf = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2,'0')} ${suf}`
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px',
      padding: '8px 0', borderBottom: '1px solid var(--color-sage)' }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-charcoal)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

type DialogKind = 'reject' | 'info' | 'remark' | 'reschedule' | 'cancel' | 'approve-slot' | null

// ─── ApprovalDetailPanel ──────────────────────────────────────────────────────
export default function ApprovalDetailPanel({ id, onClose }: ApprovalDetailPanelProps) {
  const user = useAuthStore(s => s.user)
  const { data: rec, isLoading } = useApproval(id)
  const { data: timeline = [] }  = useAppointmentTimeline(id)

  const approve     = useApprove()
  const reject      = useReject()
  const requestInfo = useRequestInfo()
  const confirm     = useConfirm()
  const addRemark   = useAddRemark()
  const reschedule  = useProposeReschedule()
  const respond     = useRespondReschedule()
  const cancel      = useCancel()
  const notReported = useMarkNotReported()

  const [dialog, setDialog] = useState<DialogKind>(null)
  const [banner, setBanner] = useState('')

  if (isLoading || !rec) {
    return (
      <aside style={panelStyle}>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)', padding: '1rem' }}>
          Loading request...
        </p>
      </aside>
    )
  }

  const role = user?.role ?? 'requester'
  const nexts = allowedNextStatuses(rec.status)

  // An action button shows only if: the role has permission AND the status
  // machine allows the resulting transition (or it is a non-transition action).
  // Unified approve & confirm: one single "Approve" button handles approving and confirming.
  const showApprove    = hasPermission(role, 'appointment.approve') &&
    (nexts.includes('approved') || rec.status === 'submitted' || rec.status === 'approved')
  const showReject     = hasPermission(role, 'appointment.reject')  && nexts.includes('rejected')
  const showInfo       = hasPermission(role, 'appointment.requestInfo') && nexts.includes('additional-info')
  const showReschedule = hasPermission(role, 'appointment.proposeReschedule') && nexts.includes('rescheduled')
  const showCancel     = (hasPermission(role, 'appointment.cancel') || hasPermission(role, 'appointment.requestCancel')) && nexts.includes('cancelled')
  const showNotReported = hasPermission(role, 'appointment.markNotReported') && nexts.includes('not-reported')
  const showRemark     = hasPermission(role, 'appointment.internalRemark')
  // Requester response to a pending reschedule proposal.
  const showRespond    = rec.status === 'rescheduled' && hasPermission(role, 'appointment.respondReschedule')

  const anyAction = showApprove || showReject || showInfo ||
    showReschedule || showCancel || showNotReported || showRemark || showRespond
  const busy = approve.isPending || reject.isPending || requestInfo.isPending ||
    confirm.isPending || addRemark.isPending || reschedule.isPending ||
    respond.isPending || cancel.isPending || notReported.isPending

  function handleError(err: unknown) {
    setBanner(err instanceof Error ? err.message : 'Something went wrong.')
  }

  return (
    <aside style={panelStyle} aria-label="Request detail">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-sage)', gap: '12px' }}>
        <div>
          <p style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '16px',
            color: 'var(--color-charcoal)', margin: '0 0 4px 0' }}>
            {rec.subject}
          </p>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px',
            color: 'var(--color-text-secondary)', margin: 0 }}>
            {rec.id}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close detail"
          style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer',
            borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', flexShrink: 0 }}
          onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
          onBlur={e  => (e.currentTarget.style.outline = 'none')}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Body (scrolls) */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
        {banner && (
          <div role="alert" style={{ padding: '10px 14px', backgroundColor: '#fce8e6',
            border: '1px solid #f5c6c4', borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#7d1c18', marginBottom: '1rem' }}>
            {banner}
          </div>
        )}

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '1rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--color-sage)' }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Current status
          </span>
          <StatusChip status={rec.status} size="md" />
        </div>

        {/* Details */}
        <Row label="Requester"   value={`${rec.requester} (${rec.requesterCategory})`} />
        <Row label="Type"        value={rec.typeName} />
        <Row label="Purpose"     value={rec.purposeLabel} />
        <Row label="Department"  value={rec.department} />
        <Row label="Authority"   value={rec.authorityName} />
        {rec.date && rec.time ? (
          <>
            <Row label="Date" value={new Date(rec.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
            <Row label="Time" value={fmtTime(rec.time)} />
          </>
        ) : (
          <Row label="Schedule" value="To be set by the authority at approval" />
        )}
        <Row label="Mode"        value={rec.mode.charAt(0).toUpperCase() + rec.mode.slice(1)} />
        {rec.mode === 'physical' && <Row label="Location" value={rec.locationLabel} />}
        <Row label="Documents"   value={rec.documentsCount > 0 ? `${rec.documentsCount} attached` : 'None'} />
        {rec.description && <Row label="Description" value={rec.description} />}
        {rec.status === 'rescheduled' && rec.proposedDate && rec.proposedTime && (
          <Row
            label="Proposed slot"
            value={`${new Date(rec.proposedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} at ${fmtTime(rec.proposedTime)}`}
          />
        )}

        {/* Google Meet Consultation Card */}
        {rec.mode === 'online' && (
          <GoogleMeetCard
            appointmentId={rec.id}
            meetUrl={getAppointmentMeetLink(rec) || ''}
            date={rec.date ? new Date(rec.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : undefined}
            time={rec.time ? fmtTime(rec.time) : undefined}
            rawDate={rec.date}
            rawTime={rec.time}
            subject={rec.subject}
            authorityName={rec.authorityName}
            department={rec.department}
            requesterName={rec.requester}
            status={rec.status}
            showCalendarButton={rec.status === 'confirmed'}
            appointmentRecord={rec}
          />
        )}

        {/* Google Calendar reminder — available once confirmed for physical */}
        {rec.mode !== 'online' && rec.status === 'confirmed' && rec.date && rec.time && (() => {
          const url = googleCalendarUrl({
            title: `Appointment: ${rec.subject}`,
            date: rec.date, time: rec.time,
            details: `With ${rec.authorityName}. ${rec.description ?? ''}`.trim(),
            location: rec.locationLabel || undefined,
          })
          if (!url) return null
          return (
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="btn-secondary btn-sm"
              style={{ marginTop: '1rem', textDecoration: 'none' }}>
              <CalendarPlus size={14} aria-hidden="true" /> Add to Google Calendar
            </a>
          )
        })()}

        {/* Timeline */}
        <h4 style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600,
          color: 'var(--color-text-secondary)', textTransform: 'uppercase',
          letterSpacing: '0.05em', margin: '1.5rem 0 0.75rem 0' }}>
          Activity timeline
        </h4>
        {timeline.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            No activity recorded yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {timeline.map(ev => (
              <div key={ev.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <CircleDot size={14} style={{ color: 'var(--color-emerald)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600,
                    color: 'var(--color-charcoal)', margin: 0 }}>
                    {ev.summary}
                    {!ev.visibleToRequester && (
                      <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {' '}· internal
                      </span>
                    )}
                  </p>
                  {ev.detail && (
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px',
                      color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
                      {ev.detail}
                    </p>
                  )}
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px',
                    color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
                    {new Date(ev.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action bar — gated by permission + status machine */}
      {anyAction && (
        <div style={{ borderTop: '1px solid var(--color-sage)', padding: '0.875rem 1.25rem',
          display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {showApprove && (
            <button className="btn-primary" disabled={busy} style={{ fontSize: '13px' }}
              onClick={() => {
                if (rec.status === 'approved') {
                  // Legacy approved requests: clicking Approve completes confirmation immediately
                  confirm.mutate({ id: rec.id }, { onError: handleError })
                } else {
                  // Submitted requests: open dialog to select/confirm date & time, then approve & confirm
                  setDialog('approve-slot')
                }
              }}>
              <Check size={14} aria-hidden="true" /> Approve
            </button>
          )}
          {showRespond && (
            <>
              <button className="btn-primary" disabled={busy} style={{ fontSize: '13px' }}
                onClick={() => respond.mutate({ id: rec.id, decision: 'accept' }, { onError: handleError })}>
                <ThumbsUp size={14} aria-hidden="true" /> Accept new time
              </button>
              <button className="btn-secondary" disabled={busy} style={{ fontSize: '13px' }}
                onClick={() => respond.mutate({ id: rec.id, decision: 'decline' }, { onError: handleError })}>
                <ThumbsDown size={14} aria-hidden="true" /> Decline
              </button>
            </>
          )}
          {showInfo && (
            <button className="btn-secondary" disabled={busy} style={{ fontSize: '13px' }}
              onClick={() => setDialog('info')}>
              <HelpCircle size={14} aria-hidden="true" /> Request information
            </button>
          )}
          {showReschedule && (
            <button className="btn-secondary" disabled={busy} style={{ fontSize: '13px' }}
              onClick={() => setDialog('reschedule')}>
              <CalendarClock size={14} aria-hidden="true" /> Propose new time
            </button>
          )}
          {showNotReported && (
            <button className="btn-secondary" disabled={busy} style={{ fontSize: '13px' }}
              onClick={() => notReported.mutate({ id: rec.id }, { onError: handleError })}>
              <UserX size={14} aria-hidden="true" /> Mark not reported
            </button>
          )}
          {showRemark && (
            <button className="btn-secondary" disabled={busy} style={{ fontSize: '13px' }}
              onClick={() => setDialog('remark')}>
              <MessageSquarePlus size={14} aria-hidden="true" /> Internal remark
            </button>
          )}
          {showCancel && (
            <button className="btn-secondary" disabled={busy} style={{ fontSize: '13px' }}
              onClick={() => setDialog('cancel')}>
              <XSquare size={14} aria-hidden="true" /> Cancel appointment
            </button>
          )}
          {showReject && (
            <button className="btn-danger" disabled={busy} style={{ fontSize: '13px', marginLeft: 'auto' }}
              onClick={() => setDialog('reject')}>
              <Ban size={14} aria-hidden="true" /> Reject
            </button>
          )}
        </div>
      )}

      {/* Dialogs */}
      {dialog === 'reject' && (
        <ActionDialog
          title="Reject request"
          description="The requester will be notified. This cannot be undone."
          fieldLabel="Reason for rejection"
          placeholder="Explain why this request is being rejected..."
          required
          confirmLabel="Reject request"
          variant="danger"
          submitting={reject.isPending}
          onConfirm={text => reject.mutate({ id: rec.id, reason: text }, {
            onSuccess: () => setDialog(null),
            onError: (e) => { handleError(e); setDialog(null) },
          })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'info' && (
        <ActionDialog
          title="Request additional information"
          description="The request moves to 'Additional information required' and the requester is asked to respond."
          fieldLabel="What information is needed?"
          placeholder="Describe the information or documents required..."
          required
          confirmLabel="Send request"
          submitting={requestInfo.isPending}
          onConfirm={text => requestInfo.mutate({ id: rec.id, message: text }, {
            onSuccess: () => setDialog(null),
            onError: (e) => { handleError(e); setDialog(null) },
          })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'remark' && (
        <ActionDialog
          title="Add internal remark"
          description="Internal remarks are visible to staff only, never to the requester."
          fieldLabel="Remark"
          placeholder="Add a note for other reviewers..."
          required
          confirmLabel="Add remark"
          submitting={addRemark.isPending}
          onConfirm={text => addRemark.mutate({ id: rec.id, text }, {
            onSuccess: () => setDialog(null),
            onError: (e) => { handleError(e); setDialog(null) },
          })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'reschedule' && (
        <RescheduleDialog
          currentDate={rec.date}
          currentTime={rec.time}
          submitting={reschedule.isPending}
          onConfirm={(date, time, note) => reschedule.mutate({ id: rec.id, date, time, note }, {
            onSuccess: () => setDialog(null),
            onError: (e) => { handleError(e); setDialog(null) },
          })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'approve-slot' && (
        <RescheduleDialog
          title="Approve appointment"
          description="Select the date and time to approve and confirm this request. The appointment will be confirmed and the requester notified immediately with calendar and meeting details."
          confirmLabel="Approve"
          currentDate={rec.date}
          currentTime={rec.time}
          mode={rec.mode}
          currentMeetingUrl={rec.meetingUrl || (rec.mode === 'online' && rec.locationLabel?.startsWith('http') ? rec.locationLabel : '')}
          submitting={approve.isPending}
          onConfirm={(date, time, note, meetingUrl) => approve.mutate({ id: rec.id, date, time, note, meetingUrl, confirm: true }, {
            onSuccess: () => setDialog(null),
            onError: (e) => { handleError(e); setDialog(null) },
          })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'cancel' && (
        <ActionDialog
          title="Cancel appointment"
          description="The appointment will be cancelled and the requester notified. This cannot be undone."
          fieldLabel="Reason for cancellation"
          placeholder="Explain why this appointment is being cancelled..."
          required
          confirmLabel="Cancel appointment"
          variant="danger"
          submitting={cancel.isPending}
          onConfirm={text => cancel.mutate({ id: rec.id, reason: text }, {
            onSuccess: () => setDialog(null),
            onError: (e) => { handleError(e); setDialog(null) },
          })}
          onClose={() => setDialog(null)}
        />
      )}
    </aside>
  )
}

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'var(--color-ivory)',
  border: '1px solid var(--color-sage)',
  borderRadius: 'var(--radius-lg)',
  height: '100%',
  minHeight: 0,
  overflow: 'hidden',
}
