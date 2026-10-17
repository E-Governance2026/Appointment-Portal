import { useRef } from 'react'
import { Upload, X, FileText, Monitor, Phone, MapPin } from 'lucide-react'
import { PURPOSE_OPTIONS, type AppointmentFormData } from '../../types/appointment'

interface Step4Props {
  data: AppointmentFormData
  onChange: (updates: Partial<AppointmentFormData>) => void
  errors: Partial<Record<keyof AppointmentFormData, string>>
}

export default function Step4Details({ data, onChange, errors }: Step4Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    if (!files) return
    const newFiles = Array.from(files).filter(
      f => !data.documents.some(d => d.name === f.name)
    )
    onChange({ documents: [...data.documents, ...newFiles] })
  }

  function removeFile(name: string) {
    onChange({ documents: data.documents.filter(f => f.name !== name) })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  const MEETING_MODES = [
    { id: 'physical', label: 'Physical',  icon: <MapPin size={14} />,    desc: 'In-person meeting'   },
    { id: 'online',   label: 'Online',    icon: <Monitor size={14} />,   desc: 'Video / Online call' },
    { id: 'phone',    label: 'Phone',     icon: <Phone size={14} />,     desc: 'Phone call'          },
  ] as const

  return (
    <div>
      <h2 className="font-bold text-base mb-1" style={{ color: 'var(--color-text)' }}>
        Appointment Details
      </h2>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-muted)' }}>
        Provide details about your appointment so the authority can prepare.
      </p>

      <div className="space-y-4">
        {/* Subject */}
        <div>
          <label className="input-label">Subject *</label>
          <input
            type="text"
            className="input"
            placeholder="Enter appointment subject"
            value={data.subject}
            onChange={e => onChange({ subject: e.target.value })}
          />
          {errors.subject && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>
              {errors.subject}
            </p>
          )}
        </div>

        {/* Purpose */}
        <div>
          <label className="input-label">Purpose *</label>
          <select
            className="input"
            value={data.purpose}
            onChange={e => onChange({ purpose: e.target.value })}
          >
            <option value="">— Select purpose —</option>
            {PURPOSE_OPTIONS.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {errors.purpose && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>
              {errors.purpose}
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="input-label">
            Detailed Description{' '}
            <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
              (optional)
            </span>
          </label>
          <textarea
            className="input resize-none"
            rows={3}
            placeholder="Describe the purpose of your appointment in detail..."
            value={data.description}
            onChange={e => onChange({ description: e.target.value })}
            style={{ lineHeight: 1.6 }}
          />
        </div>

        {/* Meeting Mode */}
        <div>
          <label className="input-label">Meeting Mode *</label>
          <div className="grid grid-cols-3 gap-3">
            {MEETING_MODES.map(mode => {
              const isActive = data.meetingMode === mode.id
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onChange({ meetingMode: mode.id, location: '' })}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all"
                  style={{
                    backgroundColor: isActive ? 'rgba(7,59,53,0.06)' : 'var(--color-surface)',
                    borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border)',
                    color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  }}
                >
                  {mode.icon}
                  <span className="text-xs font-semibold">{mode.label}</span>
                  <span style={{ fontSize: '0.6rem' }}>{mode.desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Location — only for physical */}
        {data.meetingMode === 'physical' && (
          <div>
            <label className="input-label">Location / Room *</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Academic Block – Room 101"
              value={data.location}
              onChange={e => onChange({ location: e.target.value })}
            />
            {errors.location && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>
                {errors.location}
              </p>
            )}
          </div>
        )}

        {/* File Upload */}
        <div>
          <label className="input-label">
            Upload Documents{' '}
            <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
              (optional)
            </span>
          </label>

          {/* Drop zone */}
          <div
            className="border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
            onDragOver={e => {
              e.preventDefault()
              e.currentTarget.style.borderColor = 'var(--color-secondary)'
              e.currentTarget.style.backgroundColor = 'rgba(15,128,107,0.04)'
            }}
            onDragLeave={e => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.backgroundColor = 'var(--color-bg)'
            }}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={22} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
              Drag & drop files here or{' '}
              <span style={{ color: 'var(--color-secondary)' }}>click to browse</span>
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              PDF, DOC, DOCX, JPG, PNG (max 5 MB each)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
          </div>

          {/* Attached files */}
          {data.documents.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {data.documents.map(file => (
                <div
                  key={file.name}
                  className="flex items-center gap-2 p-2 rounded-lg"
                  style={{
                    backgroundColor: 'rgba(15,128,107,0.05)',
                    border: '1px solid rgba(15,128,107,0.15)',
                  }}
                >
                  <FileText size={14} style={{ color: 'var(--color-secondary)', flexShrink: 0 }} />
                  <span className="text-xs flex-1 truncate" style={{ color: 'var(--color-text)' }}>
                    {file.name}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(file.name)}
                    className="p-0.5 rounded transition-colors"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {data.documents.length} file{data.documents.length > 1 ? 's' : ''} attached
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
