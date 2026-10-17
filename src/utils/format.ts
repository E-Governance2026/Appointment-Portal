// ─── Preference-driven formatting ────────────────────────────────────────────
// Pure functions: given an ISO date / HH:MM time and the user's preferences,
// return a display string. No I/O, so fully unit-testable.

import type { DateFormat, TimeFormat } from '../store/preferencesStore'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Format an ISO date (yyyy-mm-dd) per the chosen date format.
 * Returns the original string if it is not a valid ISO date.
 */
export function formatDate(iso: string, dateFormat: DateFormat): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const [, y, mo, d] = m
  switch (dateFormat) {
    case 'mm-dd-yyyy': return `${mo}/${d}/${y}`
    case 'iso':        return `${y}-${mo}-${d}`
    case 'dd-mm-yyyy':
    default:           return `${d}/${mo}/${y}`
  }
}

/**
 * Format an HH:MM (24h) time per the chosen time format.
 * Returns the original string if it is not a valid time.
 */
export function formatTime(hhmm: string, timeFormat: TimeFormat): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return hhmm
  if (timeFormat === '24h') {
    return `${pad(h)}:${pad(min)}`
  }
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${pad(min)} ${suffix}`
}
