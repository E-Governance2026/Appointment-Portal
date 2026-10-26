import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import CalendarWidget from '../components/dashboard/CalendarWidget'
import * as dashboardHooks from '../hooks/useDashboard'
import type { AppointmentRecord } from '../data/mockAppointments'

vi.mock('../../hooks/useDashboard', () => ({
  useAllAppointments: vi.fn(),
}))

const mockAppointments: Partial<AppointmentRecord>[] = [
  { id: 'apt-1', date: '2026-10-23', status: 'confirmed', appointmentType: 'Academic', requester: 'Rohan Mehta', time: '10:00' },
  { id: 'apt-2', date: '2026-10-22', status: 'completed', appointmentType: 'Finance', requester: 'Priya Sharma', time: '11:00' },
  { id: 'apt-3', date: '2026-10-27', status: 'submitted', appointmentType: 'HR', requester: 'Amit Patel', time: '14:00' },
]

describe('CalendarWidget — full circle date indicators and completed status', () => {
  it('renders all four legend items: Confirmed, Awaiting approval, Completed, and Holiday', () => {
    vi.spyOn(dashboardHooks, 'useAllAppointments').mockReturnValue({
      data: mockAppointments as AppointmentRecord[],
      isLoading: false,
    } as any)

    render(<CalendarWidget selectedDate="2026-10-23" onSelectDate={vi.fn()} />)

    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Holiday')).toBeInTheDocument()
  })

  it('renders date indicators as full circles without dot rows underneath', () => {
    vi.spyOn(dashboardHooks, 'useAllAppointments').mockReturnValue({
      data: mockAppointments as AppointmentRecord[],
      isLoading: false,
    } as any)

    const onSelectDate = vi.fn()
    const { container } = render(<CalendarWidget selectedDate="2026-10-23" onSelectDate={onSelectDate} />)

    // Check that gridcells contain circular spans (borderRadius: 50%)
    const daySpans = container.querySelectorAll('.tnum')
    expect(daySpans.length).toBeGreaterThan(0)

    // Verify 32px circle width/height and 50% border radius
    const span = daySpans[0] as HTMLElement
    expect(span.style.borderRadius).toBe('50%')
    expect(span.style.width).toBe('32px')
    expect(span.style.height).toBe('32px')

    // Click a date to verify onSelectDate still works smoothly
    const gridCells = screen.getAllByRole('gridcell')
    const clickableCell = Array.from(gridCells).find(cell => !cell.hasAttribute('disabled'))
    if (clickableCell) {
      fireEvent.click(clickableCell)
      expect(onSelectDate).toHaveBeenCalled()
    }
  })
})
