import { describe, it, expect } from 'vitest'
import { googleCalendarUrl } from '../utils/calendar'

describe('googleCalendarUrl', () => {
  it('builds a template URL with encoded title and a 30-minute default window', () => {
    const url = googleCalendarUrl({ title: 'Appointment: Project guidance', date: '2026-10-20', time: '14:30' })
    expect(url).toBeTruthy()
    const u = new URL(url!)
    expect(u.hostname).toBe('calendar.google.com')
    expect(u.searchParams.get('action')).toBe('TEMPLATE')
    expect(u.searchParams.get('text')).toBe('Appointment: Project guidance')
    // 14:30 -> 15:00 (default 30 min)
    expect(u.searchParams.get('dates')).toBe('20261020T143000/20261020T150000')
  })

  it('honors a custom duration', () => {
    const url = googleCalendarUrl({ title: 'X', date: '2026-01-05', time: '09:00', durationMinutes: 45 })
    const u = new URL(url!)
    expect(u.searchParams.get('dates')).toBe('20260105T090000/20260105T094500')
  })

  it('includes details and location when provided', () => {
    const url = googleCalendarUrl({ title: 'X', date: '2026-01-05', time: '09:00', details: 'With Prof. A', location: 'Room 204' })
    const u = new URL(url!)
    expect(u.searchParams.get('details')).toBe('With Prof. A')
    expect(u.searchParams.get('location')).toBe('Room 204')
  })

  it('returns null for an invalid date or time', () => {
    expect(googleCalendarUrl({ title: 'X', date: '', time: '09:00' })).toBeNull()
    expect(googleCalendarUrl({ title: 'X', date: '2026-01-05', time: '' })).toBeNull()
    expect(googleCalendarUrl({ title: 'X', date: 'nope', time: '09:00' })).toBeNull()
  })

  it('rolls over the hour correctly', () => {
    const url = googleCalendarUrl({ title: 'X', date: '2026-01-05', time: '16:45', durationMinutes: 30 })
    const u = new URL(url!)
    expect(u.searchParams.get('dates')).toBe('20260105T164500/20260105T171500')
  })
})
