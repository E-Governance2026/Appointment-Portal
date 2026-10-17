// ─── Google Calendar reminder link ───────────────────────────────────────────
// Builds a Google Calendar "add event" template URL from an appointment. Pure
// (no network); the UI renders it as a link on confirmed appointments so the
// requester gets a reminder on the day of the appointment.

export interface CalendarEventInput {
  title:       string
  date:        string   // ISO yyyy-mm-dd
  time:        string   // HH:MM (24h)
  durationMinutes?: number
  details?:    string
  location?:   string
}

function pad(n: number): string { return String(n).padStart(2, '0') }

// Google expects local-time stamps as YYYYMMDDTHHMMSS (no timezone suffix uses
// the viewer's local zone, which is what we want for a campus appointment).
function stamp(date: string, time: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!dm || !tm) return null
  const [, y, mo, d] = dm
  const h = pad(Number(tm[1]))
  const mi = pad(Number(tm[2]))
  return `${y}${mo}${d}T${h}${mi}00`
}

function addMinutes(date: string, time: string, minutes: number): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!dm || !tm) return null
  const dt = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]))
  dt.setMinutes(dt.getMinutes() + minutes)
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`
}

/**
 * Returns a Google Calendar template URL, or null when the appointment has no
 * valid date/time (so the caller can hide the link).
 */
export function googleCalendarUrl(input: CalendarEventInput): string | null {
  const start = stamp(input.date, input.time)
  const end   = addMinutes(input.date, input.time, input.durationMinutes ?? 30)
  if (!start || !end) return null

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text:   input.title,
    dates:  `${start}/${end}`,
  })
  if (input.details)  params.set('details', input.details)
  if (input.location) params.set('location', input.location)

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
