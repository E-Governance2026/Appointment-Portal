import React, { useId } from 'react'
import { Clock, Check, Sun, Sunset } from 'lucide-react'

export interface TimeSlotOption {
  value: string  // '09:00' (24-hour format)
  label: string  // '09:00 AM'
  period: 'morning' | 'afternoon'
}

// ─── 30-minute slots from 09:00 AM to 05:00 PM ─────────────────────────────────
export const STANDARD_TIME_SLOTS: TimeSlotOption[] = [
  // Morning (09:00 AM – 11:30 AM)
  { value: '09:00', label: '09:00 AM', period: 'morning' },
  { value: '09:30', label: '09:30 AM', period: 'morning' },
  { value: '10:00', label: '10:00 AM', period: 'morning' },
  { value: '10:30', label: '10:30 AM', period: 'morning' },
  { value: '11:00', label: '11:00 AM', period: 'morning' },
  { value: '11:30', label: '11:30 AM', period: 'morning' },

  // Afternoon (12:00 PM – 05:00 PM)
  { value: '12:00', label: '12:00 PM', period: 'afternoon' },
  { value: '12:30', label: '12:30 PM', period: 'afternoon' },
  { value: '13:00', label: '01:00 PM', period: 'afternoon' },
  { value: '13:30', label: '01:30 PM', period: 'afternoon' },
  { value: '14:00', label: '02:00 PM', period: 'afternoon' },
  { value: '14:30', label: '02:30 PM', period: 'afternoon' },
  { value: '15:00', label: '03:00 PM', period: 'afternoon' },
  { value: '15:30', label: '03:30 PM', period: 'afternoon' },
  { value: '16:00', label: '04:00 PM', period: 'afternoon' },
  { value: '16:30', label: '04:30 PM', period: 'afternoon' },
  { value: '17:00', label: '05:00 PM', period: 'afternoon' },
]

export function formatSlotLabel(value: string): string {
  if (!value) return ''
  const slot = STANDARD_TIME_SLOTS.find(s => s.value === value)
  if (slot) return slot.label

  // Fallback for custom or 12-hour values
  const parts = value.split(':')
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10)
    const m = parts[1].replace(/[^0-9]/g, '')
    if (!isNaN(h)) {
      const suf = h >= 12 ? 'PM' : 'AM'
      const h12 = h % 12 === 0 ? 12 : h % 12
      return `${String(h12).padStart(2, '0')}:${m.padStart(2, '0')} ${suf}`
    }
  }
  return value
}

interface TimeSlotPickerProps {
  value: string
  onChange: (time: string) => void
  label?: string
  required?: boolean
  error?: string
  disabled?: boolean
  compact?: boolean
  id?: string
}

export default function TimeSlotPicker({
  value,
  onChange,
  label = 'Preferred time slot',
  required = false,
  error,
  disabled = false,
  compact = false,
  id,
}: TimeSlotPickerProps) {
  const generatedId = useId()
  const componentId = id || generatedId

  const selectedSlot = STANDARD_TIME_SLOTS.find(s => s.value === value)
  const morningSlots = STANDARD_TIME_SLOTS.filter(s => s.period === 'morning')
  const afternoonSlots = STANDARD_TIME_SLOTS.filter(s => s.period === 'afternoon')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} id={componentId}>
      {/* Header with label & selected badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <label
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: compact ? '13px' : '14px',
            color: 'var(--color-charcoal)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            margin: 0,
          }}
        >
          <Clock size={compact ? 14 : 15} style={{ color: 'var(--color-emerald)' }} aria-hidden="true" />
          <span>{label}</span>
          {required && <span style={{ color: 'var(--color-danger)' }}>*</span>}
        </label>

        {value && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(15, 128, 107, 0.1)',
              border: '1px solid rgba(15, 128, 107, 0.25)',
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--color-forest)',
            }}
          >
            <Check size={12} aria-hidden="true" />
            <span>Selected: {formatSlotLabel(value)}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange('')}
                aria-label="Clear selected time slot"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  padding: '0 2px',
                  fontSize: '13px',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {/* Slots container */}
      <div
        role="radiogroup"
        aria-label={label}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? '10px' : '12px',
          padding: compact ? '10px' : '12px',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: `1.5px solid ${error ? 'var(--color-danger)' : 'var(--color-sage)'}`,
        }}
      >
        {/* Morning slots section */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '6px',
            }}
          >
            <Sun size={13} style={{ color: '#D97706' }} aria-hidden="true" />
            <span>Morning (9:00 AM – 11:30 AM)</span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: compact ? 'repeat(4, 1fr)' : 'repeat(auto-fill, minmax(90px, 1fr))',
              gap: compact ? '5px' : '6px',
            }}
          >
            {morningSlots.map(slot => {
              const isSelected = value === slot.value
              return (
                <button
                  key={slot.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={disabled}
                  onClick={() => onChange(isSelected ? '' : slot.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: compact ? '6px 2px' : '8px 6px',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: compact ? '11.5px' : '13px',
                    fontWeight: isSelected ? 700 : 500,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    transition: 'all 120ms ease-out',
                    border: `1.5px solid ${
                      isSelected
                        ? 'var(--color-forest)'
                        : 'var(--color-sage)'
                    }`,
                    backgroundColor: isSelected
                      ? 'var(--color-forest)'
                      : 'var(--color-ivory)',
                    color: isSelected ? '#ffffff' : 'var(--color-charcoal)',
                    boxShadow: isSelected ? 'var(--elevation-1)' : 'none',
                    opacity: disabled ? 0.6 : 1,
                  }}
                  onMouseEnter={e => {
                    if (!isSelected && !disabled) {
                      e.currentTarget.style.borderColor = 'var(--color-emerald)'
                      e.currentTarget.style.backgroundColor = 'rgba(15, 128, 107, 0.05)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected && !disabled) {
                      e.currentTarget.style.borderColor = 'var(--color-sage)'
                      e.currentTarget.style.backgroundColor = 'var(--color-ivory)'
                    }
                  }}
                >
                  {slot.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Afternoon slots section */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '6px',
            }}
          >
            <Sunset size={13} style={{ color: '#EA580C' }} aria-hidden="true" />
            <span>Afternoon (12:00 PM – 5:00 PM)</span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: compact ? 'repeat(4, 1fr)' : 'repeat(auto-fill, minmax(90px, 1fr))',
              gap: compact ? '5px' : '6px',
            }}
          >
            {afternoonSlots.map(slot => {
              const isSelected = value === slot.value
              return (
                <button
                  key={slot.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={disabled}
                  onClick={() => onChange(isSelected ? '' : slot.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: compact ? '6px 2px' : '8px 6px',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: compact ? '11.5px' : '13px',
                    fontWeight: isSelected ? 700 : 500,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    transition: 'all 120ms ease-out',
                    border: `1.5px solid ${
                      isSelected
                        ? 'var(--color-forest)'
                        : 'var(--color-sage)'
                    }`,
                    backgroundColor: isSelected
                      ? 'var(--color-forest)'
                      : 'var(--color-ivory)',
                    color: isSelected ? '#ffffff' : 'var(--color-charcoal)',
                    boxShadow: isSelected ? 'var(--elevation-1)' : 'none',
                    opacity: disabled ? 0.6 : 1,
                  }}
                  onMouseEnter={e => {
                    if (!isSelected && !disabled) {
                      e.currentTarget.style.borderColor = 'var(--color-emerald)'
                      e.currentTarget.style.backgroundColor = 'rgba(15, 128, 107, 0.05)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected && !disabled) {
                      e.currentTarget.style.borderColor = 'var(--color-sage)'
                      e.currentTarget.style.backgroundColor = 'var(--color-ivory)'
                    }
                  }}
                >
                  {slot.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p
          role="alert"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: 'var(--color-danger)',
            margin: '2px 0 0 0',
          }}
        >
          {error}
        </p>
      )}
    </div>
  )
}
