// ─── Availability mapper ──────────────────────────────────────────────────────
// Translates the three DB tables (availability, working_hours, holidays) to the
// frontend Availability contract (src/data/availabilityData.ts) and validates
// the PUT body. DB uses snake_case (slot_minutes, start_time, end_time); the
// contract uses camelCase (slotMinutes, start, end).

import { z } from 'zod'

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface WorkingHoursDto {
  weekday: Weekday
  enabled: boolean
  start:   string   // HH:MM
  end:     string   // HH:MM
}

export interface HolidayDto {
  date:  string     // ISO yyyy-mm-dd
  label: string
}

export interface AvailabilityDto {
  authorityId:  string
  slotMinutes:  number
  workingHours: WorkingHoursDto[]   // always 7 entries, Sun..Sat
  holidays:     HolidayDto[]
}

// DB row shapes.
export interface AvailabilityRow {
  authority_id: string
  slot_minutes: number
}
export interface WorkingHoursRow {
  authority_id: string
  weekday:      number
  enabled:      boolean
  start_time:   string
  end_time:     string
}
export interface HolidayRow {
  authority_id: string
  date:         string
  label:        string
}

const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

// Default working hours when an authority has no rows yet: Mon–Fri 09:00–17:00.
function defaultWorkingHours(): WorkingHoursDto[] {
  return WEEKDAYS.map(weekday => ({
    weekday,
    enabled: weekday >= 1 && weekday <= 5,
    start:   '09:00',
    end:     '17:00',
  }))
}

/**
 * Build the Availability contract from DB rows. Always returns 7 working-hours
 * entries (Sun..Sat): any weekday missing in the DB is filled with a sensible
 * default so the booking flow always has a complete week.
 */
export function toAvailabilityDto(
  authorityId: string,
  availability: AvailabilityRow | null,
  workingHours: WorkingHoursRow[],
  holidays: HolidayRow[],
): AvailabilityDto {
  const byWeekday = new Map<number, WorkingHoursRow>()
  for (const w of workingHours) byWeekday.set(w.weekday, w)

  const hours: WorkingHoursDto[] = WEEKDAYS.map(weekday => {
    const row = byWeekday.get(weekday)
    if (!row) {
      return { weekday, enabled: weekday >= 1 && weekday <= 5, start: '09:00', end: '17:00' }
    }
    return { weekday, enabled: row.enabled, start: row.start_time, end: row.end_time }
  })

  return {
    authorityId,
    slotMinutes:  availability?.slot_minutes ?? 30,
    workingHours: availability ? hours : defaultWorkingHours(),
    holidays:     holidays.map(h => ({ date: h.date, label: h.label })),
  }
}

// ─── PUT body validation ──────────────────────────────────────────────────────
const timeRe = /^\d{2}:\d{2}$/
export const availabilityBodySchema = z.object({
  slotMinutes: z.number().int().positive('Slot length must be greater than zero.'),
  workingHours: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    enabled: z.boolean(),
    start:   z.string().regex(timeRe, 'Use HH:MM.'),
    end:     z.string().regex(timeRe, 'Use HH:MM.'),
  })).length(7, 'Provide all seven weekdays.'),
  holidays: z.array(z.object({
    date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
    label: z.string().trim().min(1, 'A holiday needs a label.'),
  })),
})

export type AvailabilityBody = z.infer<typeof availabilityBodySchema>
