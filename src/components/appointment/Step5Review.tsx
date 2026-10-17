import { Pencil, FileText, Calendar, Clock, User, Building2, Monitor, MapPin, Phone } from 'lucide-react'
import { type AppointmentFormData } from '../../types/appointment'

interface Step5Props {
  data: AppointmentFormData
  onChange: (updates: Partial<AppointmentFormData>) => void
  onEditStep: (step: number) => void
}

// ─── Row helper ───────────────────────────────────────────────────────────────
function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
      {icon && (
        <span className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </span>
        <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
          {value || '—'}
        </span>
      </div>
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({
  title,
  step,
  onEdit,
}: {
  title: string
  step: number
  onEdit: (step: number) => void
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2 rounded-t-lg"
      style={{ backgroundColor: 'rgba(7,59,53,0.05)' }}
    >
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>
        {title}
      </p>
      <button
        type="button"
        onClick={() => onEdit(step)}
        className="flex items-center gap-1 text-xs font-semibold transition-colors"
        style={{ color: 'var(--color-secondary)' }}
      >
        <Pencil size={11} /> Edit
      </button>
    </div>
  )
}

// ─── Step5Review Component ────────────────────────────────────────────────────
export default function Step5Review({ data, onChange, onEditStep }: Step5Props) {
  const modeIcon =
    data.meetingMode === 'online'
      ? <Monitor size={14} />
      : data.meetingMode === 'phone'
      ? <Phone size={14} />
      : <MapPin size={14} />

  const formatDate = (iso: string) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  }

  return (
    <div>
      <h2 className="font-bold text-base mb-1" style={{ color: 'var(--color-text)' }}>
        Review &amp; Submit
      </h2>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-muted)' }}>
        Please review all details carefully before submitting.
      </p>

      <div className="space-y-4">
        {/* ── Type ── */}
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          <SectionHeader title="Appointment Type" step={1} onEdit={onEditStep} />
          <div className="px-4">
            <Row
              label="Type"
              value={`${data.appointmentTypeIcon} ${data.appointmentTypeLabel}`}
            />
          </div>
        </div>

        {/* ── Authority ── */}
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          <SectionHeader title="Authority" step={2} onEdit={onEditStep} />
          <div className="px-4">
            <Row label="Department" value={data.departmentLabel}   icon={<Building2 size={14} />} />
            <Row label="Authority"  value={data.authorityName}     icon={<User size={14} />}      />
            <Row label="Designation" value={data.authorityDesignation} />
          </div>
        </div>

        {/* ── Date & Time ── */}
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          <SectionHeader title="Date &amp; Time" step={3} onEdit={onEditStep} />
          <div className="px-4">
            <Row label="Date"      value={formatDate(data.date)} icon={<Calendar size={14} />} />
            <Row label="Time Slot" value={data.timeSlot}         icon={<Clock size={14} />}    />
          </div>
        </div>

        {/* ── Details ── */}
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          <SectionHeader title="Appointment Details" step={4} onEdit={onEditStep} />
          <div className="px-4">
            <Row label="Subject"      value={data.subject}                          />
            <Row label="Purpose"      value={data.purpose}                          />
            <Row
              label="Meeting Mode"
              value={`${data.meetingMode.charAt(0).toUpperCase() + data.meetingMode.slice(1)}`}
              icon={modeIcon}
            />
            {data.meetingMode === 'physical' && (
              <Row label="Location" value={data.location} />
            )}
            {data.description && (
              <Row label="Description" value={data.description} />
            )}
            <Row
              label="Documents"
              value={
                data.documents.length > 0
                  ? `${data.documents.length} file${data.documents.length > 1 ? 's' : ''} attached`
                  : 'None'
              }
              icon={<FileText size={14} />}
            />
          </div>
        </div>

        {/* ── Confirm checkbox ── */}
        <div
          className="flex items-start gap-3 p-4 rounded-xl"
          style={{
            backgroundColor: data.confirmed ? 'rgba(15,128,107,0.06)' : 'var(--color-bg)',
            border: `1.5px solid ${data.confirmed ? 'var(--color-secondary)' : 'var(--color-border)'}`,
            transition: 'all 0.2s',
          }}
        >
          <input
            type="checkbox"
            id="confirm-check"
            checked={data.confirmed}
            onChange={e => onChange({ confirmed: e.target.checked })}
            className="mt-0.5 w-4 h-4 rounded cursor-pointer flex-shrink-0"
            style={{ accentColor: 'var(--color-secondary)' }}
          />
          <label
            htmlFor="confirm-check"
            className="text-xs leading-relaxed cursor-pointer"
            style={{ color: 'var(--color-text)' }}
          >
            I confirm that all the information provided above is correct and accurate.
            I understand that providing false information may result in cancellation of the appointment.
          </label>
        </div>
      </div>
    </div>
  )
}
