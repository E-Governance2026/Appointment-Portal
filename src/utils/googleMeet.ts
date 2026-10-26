 // ─── Google Meet Utility ────────────────────────────────────────────────────────
// Generates and manages Google Meet links for online appointments.
// Produces standard Google Meet URL format: https://meet.google.com/xxx-yyyy-zzz

/**
 * Deterministically generates a standard Google Meet URL from an appointment ID.
 * Example: "APT-2026-1082" -> "https://meet.google.com/apu-vjkr-mep"
 */
export function generateGoogleMeetLink(appointmentId: string): string {
  if (!appointmentId) return 'https://meet.google.com/apu-meet-live'

  const clean = appointmentId.toLowerCase().replace(/[^a-z0-9]/g, '')
  let h = 0
  for (let i = 0; i < clean.length; i++) {
    h = (Math.imul(31, h) + clean.charCodeAt(i)) | 0
  }
  const abs = Math.abs(h)

  const letters = 'abcdefghijklmnopqrstuvwxyz'
  const p1 = 'apu' // Parul University standard prefix

  let p2 = ''
  let seed2 = (abs >>> 3) + 4321
  for (let i = 0; i < 4; i++) {
    p2 += letters[seed2 % 26]
    seed2 = Math.floor(seed2 / 26) + (i + 1) * 7
  }

  let p3 = ''
  let seed3 = (abs >>> 7) + 8765
  for (let i = 0; i < 3; i++) {
    p3 += letters[seed3 % 26]
    seed3 = Math.floor(seed3 / 26) + (i + 1) * 11
  }

  return `https://meet.google.com/${p1}-${p2}-${p3}`
}

export const GOOGLE_MEET_NEW_URL = 'https://meet.google.com/new'

/**
 * Checks if a meeting URL is an explicitly set / valid custom meeting link
 * (i.e. not the placeholder apu- format).
 */
export function isCustomMeetLink(url?: string): boolean {
  if (!url || !url.startsWith('http')) return false
  if (url.includes('meet.google.com/apu-')) return false
  return true
}

/**
 * Returns the Google Meet link for an appointment if mode is 'online',
 * returning null otherwise.
 */
export function getAppointmentMeetLink(appointment?: {
  id?: string
  mode?: string
  meetingUrl?: string
  locationLabel?: string
} | null): string | null {
  if (!appointment || appointment.mode !== 'online') return null
  if (appointment.meetingUrl && appointment.meetingUrl.startsWith('http')) {
    return appointment.meetingUrl
  }
  if (appointment.locationLabel && appointment.locationLabel.startsWith('http')) {
    return appointment.locationLabel
  }
  return appointment.id ? generateGoogleMeetLink(appointment.id) : 'https://meet.google.com/apu-meet-live'
}

/**
 * Robustly parses appointment date and time strings into a JavaScript Date object.
 */
export function parseAppointmentDateTime(dateStr?: string, timeStr?: string): Date | null {
  if (!dateStr || !timeStr) return null

  let y = 0, m = 0, d = 0
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim())
  if (isoMatch) {
    y = parseInt(isoMatch[1], 10)
    m = parseInt(isoMatch[2], 10) - 1
    d = parseInt(isoMatch[3], 10)
  } else {
    const dt = new Date(dateStr)
    if (isNaN(dt.getTime())) return null
    y = dt.getFullYear()
    m = dt.getMonth()
    d = dt.getDate()
  }

  const timeMatch = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(timeStr.trim())
  if (!timeMatch) return null

  let hours = parseInt(timeMatch[1], 10)
  const minutes = parseInt(timeMatch[2], 10)
  const meridiem = timeMatch[3]?.toUpperCase()

  if (meridiem === 'PM' && hours < 12) hours += 12
  if (meridiem === 'AM' && hours === 12) hours = 0

  return new Date(y, m, d, hours, minutes, 0)
}

export interface MeetingTimingInfo {
  isFuture: boolean
  isNow: boolean
  isPast: boolean
  relativeText: string
  formattedDate: string
  formattedTime: string
  scheduledDate: Date
}

/**
 * Computes whether the meeting is scheduled in the future, currently happening, or past,
 * along with friendly relative phrasing (e.g. "tomorrow at 10:00 AM", "today at 2:00 PM").
 */
export function getRelativeMeetingTiming(
  dateStr?: string,
  timeStr?: string,
  currentTime: Date = new Date()
): MeetingTimingInfo | null {
  const scheduled = parseAppointmentDateTime(dateStr, timeStr)
  if (!scheduled) return null

  const nowMs = currentTime.getTime()
  const startMs = scheduled.getTime()
  const endMs = startMs + 30 * 60 * 1000 // 30 min standard duration
  const bufferEarlyMs = 15 * 60 * 1000 // 15 min early join window

  const isFuture = nowMs < (startMs - bufferEarlyMs)
  const isNow = nowMs >= (startMs - bufferEarlyMs) && nowMs <= endMs
  const isPast = nowMs > endMs

  const formattedTime = scheduled.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  const formattedDate = scheduled.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  // Compare calendar days in local timezone
  const today = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate())
  const schedDay = new Date(scheduled.getFullYear(), scheduled.getMonth(), scheduled.getDate())
  const diffDays = Math.round((schedDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  let relativeText = ''
  if (diffDays === 0) {
    relativeText = `today at ${formattedTime}`
  } else if (diffDays === 1) {
    relativeText = `tomorrow at ${formattedTime}`
  } else if (diffDays === -1) {
    relativeText = `yesterday at ${formattedTime}`
  } else {
    relativeText = `on ${formattedDate} at ${formattedTime}`
  }

  return {
    isFuture,
    isNow,
    isPast,
    relativeText,
    formattedDate,
    formattedTime,
    scheduledDate: scheduled,
  }
}

