// ─── Availability Configuration ───────────────────────────────────────────────
// Working hours, slot length and holidays per authority (PRD §5 "Availability
// and slot configuration"). This mirrors the eventual Supabase tables
// `availability`, `working_hours` and `holidays`. The service layer is the only
// module that reads/writes this; components go through hooks.

// ─── Types ────────────────────────────────────────────────────────────────────
// 0 = Sunday … 6 = Saturday (JS Date.getDay()).
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface WorkingHours {
  weekday: Weekday
  /** Whether the authority works this weekday at all. */
  enabled: boolean
  /** Start/end of the working window, HH:MM 24h. Ignored when disabled. */
  start:   string
  end:     string
}

export interface Holiday {
  date:   string   // ISO yyyy-mm-dd
  label:  string
}

export interface Availability {
  /** Which authority this configuration belongs to. */
  authorityId: string
  /** Length of a bookable slot in minutes. */
  slotMinutes: number
  /** Working hours for each weekday (always 7 entries, Sun..Sat). */
  workingHours: WorkingHours[]
  /** One-off closed dates. */
  holidays:    Holiday[]
}

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
}

// ─── Seed ─────────────────────────────────────────────────────────────────────
// Default: Monday–Friday 09:00–17:00, 30-minute slots, weekends off.
function defaultWorkingHours(): WorkingHours[] {
  return ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map(weekday => ({
    weekday,
    enabled: weekday >= 1 && weekday <= 5,
    start:   '09:00',
    end:     '17:00',
  }))
}

export const SEED_AVAILABILITY: Availability[] = [
  {
    authorityId: 'auth-ss',
    slotMinutes: 30,
    workingHours: defaultWorkingHours(),
    holidays: [
      { date: '2026-10-21', label: 'Institute foundation day' },
    ],
  },
  {
    authorityId: 'auth-nj',
    slotMinutes: 30,
    workingHours: defaultWorkingHours(),
    holidays: [],
  },
  {
    authorityId: 'auth-vm',
    slotMinutes: 45,
    workingHours: defaultWorkingHours(),
    holidays: [],
  },
  {
    authorityId: 'auth-ap',
    slotMinutes: 30,
    workingHours: defaultWorkingHours(),
    holidays: [],
  },
  {
    authorityId: 'auth-pd',
    slotMinutes: 30,
    workingHours: defaultWorkingHours(),
    holidays: [],
  },
]

// ─── Pure helpers ────────────────────────────────────────────────────────────
/** True when the authority has a working window on the given ISO date. */
export function isWorkingDay(av: Availability, isoDate: string): boolean {
  if (av.holidays.some(h => h.date === isoDate)) return false
  const weekday = new Date(isoDate + 'T00:00:00').getDay() as Weekday
  const wh = av.workingHours.find(w => w.weekday === weekday)
  return !!wh?.enabled
}

/**
 * Generate the ordered list of slot start times (HH:MM) for an authority on a
 * given date, based on their working hours and slot length. Returns [] on a
 * non-working day or holiday.
 */
export function generateSlots(av: Availability, isoDate: string): string[] {
  if (!isWorkingDay(av, isoDate)) return []
  const weekday = new Date(isoDate + 'T00:00:00').getDay() as Weekday
  const wh = av.workingHours.find(w => w.weekday === weekday)
  if (!wh || !wh.enabled) return []

  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
  }
  const pad = (n: number) => String(n).padStart(2, '0')

  const startMin = toMinutes(wh.start)
  const endMin   = toMinutes(wh.end)
  const slots: string[] = []
  for (let t = startMin; t + av.slotMinutes <= endMin; t += av.slotMinutes) {
    slots.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`)
  }
  return slots
}
