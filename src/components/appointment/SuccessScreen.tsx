import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Copy, Check, CalendarDays, Eye } from 'lucide-react'
import { type AppointmentFormData } from '../../types/appointment'

interface SuccessScreenProps {
  appointmentId: string
  data: AppointmentFormData
}

export default function SuccessScreen({ appointmentId, data }: SuccessScreenProps) {
  const navigate  = useNavigate()
  const [copied, setCopied] = useState(false)

  function copyId() {
    navigator.clipboard.writeText(appointmentId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const formatDate = (iso: string) =>
    iso
      ? new Date(iso).toLocaleDateString('en-IN', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        })
      : '—'

  return (
    <div className="flex flex-col items-center text-center py-4">
      {/* Success icon */}
      <div
        className="w-16 h-16 rounded flex items-center justify-center mb-4"
        style={{ backgroundColor: 'rgba(15,128,107,0.1)' }}
      >
        <CheckCircle2 size={36} style={{ color: 'var(--color-secondary)' }} />
      </div>

      <h2 className="font-bold text-xl mb-1" style={{ color: 'var(--color-text)' }}>
        Appointment Submitted!
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Your appointment has been submitted successfully and is awaiting approval.
      </p>

      {/* Appointment ID card */}
      <div
        className="w-full max-w-sm p-5 mb-6"
        style={{
          backgroundColor: 'var(--color-forest)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>
          Your Appointment ID
        </p>
        <div className="flex items-center justify-center gap-3">
          <p className="text-white font-black text-xl tracking-widest">
            {appointmentId}
          </p>
          <button
            onClick={copyId}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
            style={{
              backgroundColor: copied ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Save this ID to track your appointment status
        </p>
      </div>

      {/* Summary info */}
      <div
        className="w-full max-w-sm rounded-xl overflow-hidden mb-6"
        style={{ border: '1px solid var(--color-border)' }}
      >
        {[
          { label: 'Type',       value: `${data.appointmentTypeIcon} ${data.appointmentTypeLabel}` },
          { label: 'Authority',  value: data.authorityName                                         },
          { label: 'Department', value: data.departmentLabel                                       },
          { label: 'Date',       value: formatDate(data.date)                                      },
          { label: 'Time',       value: data.timeSlot                                              },
          { label: 'Mode',       value: data.meetingMode.charAt(0).toUpperCase() + data.meetingMode.slice(1) },
          { label: 'Status',     value: '⏳ Pending Approval'                                     },
        ].map((row, idx, arr) => (
          <div
            key={row.label}
            className="flex items-center justify-between px-4 py-2.5"
            style={{
              borderBottom: idx < arr.length - 1 ? '1px solid var(--color-border)' : 'none',
              backgroundColor: idx % 2 === 0 ? 'var(--color-bg)' : 'var(--color-surface)',
            }}
          >
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {row.label}
            </span>
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* ── Info note ── */}
      <div
        className="w-full max-w-sm rounded-xl p-3 mb-6 text-left"
        style={{
          backgroundColor: 'rgba(244,163,64,0.08)',
          border: '1px solid rgba(244,163,64,0.25)',
        }}
      >
        <p className="text-xs font-semibold mb-1" style={{ color: '#92400e' }}>
          What happens next?
        </p>
        <ul className="text-xs space-y-1" style={{ color: '#92400e' }}>
          <li>• The authority will review your appointment request.</li>
          <li>• You'll receive a notification once it's approved or rejected.</li>
          <li>• A calendar reminder will be set upon approval.</li>
        </ul>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          onClick={() => navigate('/my-appointments')}
          className="btn-primary flex items-center gap-2"
        >
          <Eye size={14} />
          View My Appointments
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="btn-secondary flex items-center gap-2"
        >
          <CalendarDays size={14} />
          Go to Dashboard
        </button>
      </div>
    </div>
  )
}
