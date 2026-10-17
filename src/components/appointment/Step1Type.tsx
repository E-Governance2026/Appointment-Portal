import { APPOINTMENT_TYPES, type AppointmentFormData } from '../../types/appointment'

interface Step1Props {
  data: AppointmentFormData
  onChange: (updates: Partial<AppointmentFormData>) => void
}

export default function Step1Type({ data, onChange }: Step1Props) {
  return (
    <div>
      <h2 className="font-bold text-base mb-1" style={{ color: 'var(--color-text)' }}>
        Select Appointment Type
      </h2>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-muted)' }}>
        Choose the category that best describes your appointment purpose.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {APPOINTMENT_TYPES.map(type => {
          const isSelected = data.appointmentType === type.id

          return (
            <button
              key={type.id}
              type="button"
              onClick={() =>
                onChange({
                  appointmentType:      type.id,
                  appointmentTypeLabel: type.label,
                  appointmentTypeIcon:  type.emoji,
                })
              }
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-150 text-center"
              style={{
                backgroundColor: isSelected ? type.bg : 'var(--color-surface)',
                borderColor: isSelected ? type.color : 'var(--color-border)',
                boxShadow: isSelected ? `0 0 0 3px ${type.color}20` : 'none',
                transform: isSelected ? 'scale(1.03)' : 'scale(1)',
              }}
              onMouseEnter={e => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = type.color
                  e.currentTarget.style.backgroundColor = type.bg
                }
              }}
              onMouseLeave={e => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.backgroundColor = 'var(--color-surface)'
                }
              }}
            >
              {/* Emoji icon */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all"
                style={{
                  backgroundColor: isSelected ? type.color : type.bg,
                }}
              >
                {type.emoji}
              </div>

              {/* Label */}
              <span
                className="text-xs font-semibold leading-tight"
                style={{
                  color: isSelected ? type.color : 'var(--color-text)',
                }}
              >
                {type.label}
              </span>

              {/* Selected indicator */}
              {isSelected && (
                <span
                  className="text-xs px-2 py-0.5 rounded font-semibold"
                  style={{ backgroundColor: type.color, color: '#fff' }}
                >
                  ✓ Selected
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Selection hint */}
      {!data.appointmentType && (
        <p
          className="mt-4 text-xs text-center"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Please select one appointment type to continue.
        </p>
      )}
    </div>
  )
}
