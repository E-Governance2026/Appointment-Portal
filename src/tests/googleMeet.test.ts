import { describe, it, expect } from 'vitest'
import { generateGoogleMeetLink, getAppointmentMeetLink, isCustomMeetLink } from '../utils/googleMeet'
import { googleCalendarUrl } from '../utils/calendar'
import { updateMeetingUrl } from '../services/appointmentsService'

describe('Google Meet utility', () => {
  it('generates a valid Google Meet URL matching standard format', () => {
    const link = generateGoogleMeetLink('APT-2026-1082')
    expect(link).toMatch(/^https:\/\/meet\.google\.com\/apu-[a-z]{4}-[a-z]{3}$/)
  })

  it('is deterministic: same appointment ID produces the same link', () => {
    const link1 = generateGoogleMeetLink('APT-2026-1082')
    const link2 = generateGoogleMeetLink('APT-2026-1082')
    expect(link1).toBe(link2)
  })

  it('produces distinct links for different appointment IDs', () => {
    const link1 = generateGoogleMeetLink('APT-2026-1082')
    const link2 = generateGoogleMeetLink('APT-2026-2001')
    expect(link1).not.toBe(link2)
  })

  it('returns null when mode is physical or phone', () => {
    expect(getAppointmentMeetLink({ id: 'APT-1', mode: 'physical' })).toBeNull()
    expect(getAppointmentMeetLink({ id: 'APT-2', mode: 'phone' })).toBeNull()
    expect(getAppointmentMeetLink(null)).toBeNull()
  })

  it('returns generated link when mode is online', () => {
    const link = getAppointmentMeetLink({ id: 'APT-2026-1082', mode: 'online' })
    expect(link).toBe(generateGoogleMeetLink('APT-2026-1082'))
  })

  it('preserves custom meetingUrl when provided', () => {
    const custom = 'https://meet.google.com/custom-test-meet'
    const link = getAppointmentMeetLink({ id: 'APT-1', mode: 'online', meetingUrl: custom })
    expect(link).toBe(custom)
  })

  it('googleCalendarUrl includes meetingUrl in location and details', () => {
    const meetUrl = 'https://meet.google.com/apu-test-code'
    const url = googleCalendarUrl({
      title: 'Consultation',
      date: '2026-10-22',
      time: '14:30',
      details: 'Discussion on syllabus',
      meetingUrl: meetUrl,
    })
    expect(url).toBeTruthy()
    const u = new URL(url!)
    expect(u.searchParams.get('location')).toBe(meetUrl)
    expect(u.searchParams.get('details')).toContain(`Join Google Meet: ${meetUrl}`)
    expect(u.searchParams.get('details')).toContain('Discussion on syllabus')
  })

  it('identifies custom vs placeholder meet links correctly', () => {
    expect(isCustomMeetLink('https://meet.google.com/apu-test-code')).toBe(false)
    expect(isCustomMeetLink('https://meet.google.com/xyz-abcd-efg')).toBe(true)
    expect(isCustomMeetLink('')).toBe(false)
    expect(isCustomMeetLink(undefined)).toBe(false)
  })

  it('updates meeting link on an appointment via updateMeetingUrl', async () => {
    const actor = { id: 'u-auth', name: 'Dr. Test', role: 'coordinator_authority' as const }
    const rec = await updateMeetingUrl('APT-2026-2001', actor, 'https://meet.google.com/live-room-123')
    expect(rec.meetingUrl).toBe('https://meet.google.com/live-room-123')
  })

  it('dispatches confirmation email with Google Meet link and calendar URL', async () => {
    const { sendAppointmentConfirmationEmail } = await import('../services/emailService')
    const email = sendAppointmentConfirmationEmail({
      id: 'APT-2026-9999',
      requester: 'Rohan Mehta',
      requesterInitials: 'RM',
      requesterCategory: 'Staff',
      typeId: 'academic',
      typeName: 'Academic Consultation',
      purposeLabel: 'Online discussion',
      department: 'Academic Affairs',
      authorityId: 'auth-1',
      authorityName: 'Dr. Amit Patel',
      date: '2026-10-24',
      time: '10:00',
      subject: 'Online syllabus review',
      description: 'Review syllabus',
      mode: 'online',
      locationLabel: '',
      meetingUrl: 'https://meet.google.com/apu-test-code',
      documentsCount: 0,
      status: 'confirmed',
      submittedAt: '2026-10-22T10:00:00Z',
      assignedStage: 'Confirmed',
      assignedRole: 'coordinator_authority',
      assignedToId: 'auth-1',
      updatedAt: '2026-10-22T10:00:00Z',
    })

    expect(email.to).toBe('rohan.mehta@university.edu')
    expect(email.subject).toContain('Confirmed: Online Consultation')
    expect(email.meetingUrl).toBe('https://meet.google.com/apu-test-code')
    expect(email.calendarUrl).toContain('calendar.google.com')
  })

  it('correctly calculates future meeting timing and relative text', async () => {
    const { getRelativeMeetingTiming, parseAppointmentDateTime } = await import('../utils/googleMeet')
    
    // Test parsing
    const parsed = parseAppointmentDateTime('2026-10-23', '10:00 AM')
    expect(parsed).not.toBeNull()
    expect(parsed?.getHours()).toBe(10)
    expect(parsed?.getMinutes()).toBe(0)

    // Current time: Oct 22, 2026 16:00
    const now = new Date(2026, 9, 22, 16, 0, 0)
    const timing = getRelativeMeetingTiming('2026-10-23', '10:00 AM', now)
    expect(timing).not.toBeNull()
    expect(timing?.isFuture).toBe(true)
    expect(timing?.isNow).toBe(false)
    expect(timing?.relativeText).toBe('tomorrow at 10:00 AM')

    // Current time: Oct 23, 2026 09:55 (within 15 min buffer)
    const atMeetingTime = new Date(2026, 9, 23, 9, 55, 0)
    const timingNow = getRelativeMeetingTiming('2026-10-23', '10:00 AM', atMeetingTime)
    expect(timingNow?.isNow).toBe(true)
    expect(timingNow?.isFuture).toBe(false)
  })
})
