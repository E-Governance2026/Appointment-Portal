import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TimeSlotPicker, { STANDARD_TIME_SLOTS, formatSlotLabel } from '../components/common/TimeSlotPicker'

describe('TimeSlotPicker', () => {
  it('defines 17 standard 30-min slots from 09:00 to 17:00', () => {
    expect(STANDARD_TIME_SLOTS).toHaveLength(17)
    expect(STANDARD_TIME_SLOTS[0]).toEqual({ value: '09:00', label: '09:00 AM', period: 'morning' })
    expect(STANDARD_TIME_SLOTS[16]).toEqual({ value: '17:00', label: '05:00 PM', period: 'afternoon' })
  })

  it('correctly formats slot labels with formatSlotLabel', () => {
    expect(formatSlotLabel('09:00')).toBe('09:00 AM')
    expect(formatSlotLabel('14:30')).toBe('02:30 PM')
    expect(formatSlotLabel('17:00')).toBe('05:00 PM')
    expect(formatSlotLabel('')).toBe('')
  })

  it('renders morning and afternoon sections with all slot buttons', () => {
    render(<TimeSlotPicker value="" onChange={vi.fn()} />)

    expect(screen.getByText(/Morning \(9:00 AM – 11:30 AM\)/i)).toBeTruthy()
    expect(screen.getByText(/Afternoon \(12:00 PM – 5:00 PM\)/i)).toBeTruthy()

    // Radio buttons
    const slots = screen.getAllByRole('radio')
    expect(slots).toHaveLength(17)
  })

  it('calls onChange when a slot is clicked', () => {
    const handleChange = vi.fn()
    render(<TimeSlotPicker value="" onChange={handleChange} />)

    const slot1030 = screen.getByRole('radio', { name: '10:30 AM' })
    fireEvent.click(slot1030)

    expect(handleChange).toHaveBeenCalledWith('10:30')
  })

  it('deselects (clears) when clicking the already selected slot', () => {
    const handleChange = vi.fn()
    render(<TimeSlotPicker value="10:30" onChange={handleChange} />)

    const slot1030 = screen.getByRole('radio', { name: '10:30 AM' })
    expect(slot1030.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(slot1030)
    expect(handleChange).toHaveBeenCalledWith('')
  })

  it('displays the selected badge when a value is provided', () => {
    const handleChange = vi.fn()
    render(<TimeSlotPicker value="14:00" onChange={handleChange} />)

    expect(screen.getByText(/Selected: 02:00 PM/i)).toBeTruthy()

    const clearBtn = screen.getByLabelText(/Clear selected time slot/i)
    fireEvent.click(clearBtn)
    expect(handleChange).toHaveBeenCalledWith('')
  })

  it('displays an error message when provided', () => {
    render(<TimeSlotPicker value="" onChange={vi.fn()} error="Please choose a time slot." />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Please choose a time slot.')
  })
})
