import { describe, it, expect } from 'vitest'
import {
  toAvailabilityDto, availabilityBodySchema,
  type WorkingHoursRow, type HolidayRow,
} from '../routes/availabilityMapper.js'

// A full 7-day working-hours set in DB shape.
function dbWeek(): WorkingHoursRow[] {
  return [0, 1, 2, 3, 4, 5, 6].map(weekday => ({
    authority_id: 'auth-ss',
    weekday,
    enabled: weekday >= 1 && weekday <= 5,
    start_time: '09:00',
    end_time: '17:00',
  }))
}

// ─── Mapper ───────────────────────────────────────────────────────────────────
describe('availability — mapper', () => {
  it('maps slot_minutes/start_time/end_time to the camelCase contract', () => {
    const dto = toAvailabilityDto('auth-ss', { authority_id: 'auth-ss', slot_minutes: 45 }, dbWeek(), [])
    expect(dto.slotMinutes).toBe(45)
    expect(dto.workingHours).toHaveLength(7)
    const monday = dto.workingHours.find(w => w.weekday === 1)!
    expect(monday.enabled).toBe(true)
    expect(monday.start).toBe('09:00')
    expect(monday.end).toBe('17:00')
  })

  it('always returns 7 weekday entries, filling any missing weekday', () => {
    const partial = dbWeek().filter(w => w.weekday !== 3)   // drop Wednesday
    const dto = toAvailabilityDto('auth-ss', { authority_id: 'auth-ss', slot_minutes: 30 }, partial, [])
    expect(dto.workingHours).toHaveLength(7)
    expect(dto.workingHours.find(w => w.weekday === 3)).toBeDefined()
  })

  it('falls back to defaults when there is no availability row', () => {
    const dto = toAvailabilityDto('auth-new', null, [], [])
    expect(dto.slotMinutes).toBe(30)
    expect(dto.workingHours).toHaveLength(7)
    // Mon–Fri enabled, weekend off by default.
    expect(dto.workingHours.find(w => w.weekday === 1)!.enabled).toBe(true)
    expect(dto.workingHours.find(w => w.weekday === 0)!.enabled).toBe(false)
  })

  it('maps holidays', () => {
    const hols: HolidayRow[] = [{ authority_id: 'auth-ss', date: '2026-10-21', label: 'Foundation day' }]
    const dto = toAvailabilityDto('auth-ss', { authority_id: 'auth-ss', slot_minutes: 30 }, dbWeek(), hols)
    expect(dto.holidays).toEqual([{ date: '2026-10-21', label: 'Foundation day' }])
  })
})

// ─── PUT body schema ──────────────────────────────────────────────────────────
function body(overrides: Record<string, unknown> = {}) {
  return {
    slotMinutes: 30,
    workingHours: [0, 1, 2, 3, 4, 5, 6].map(weekday => ({
      weekday, enabled: weekday >= 1 && weekday <= 5, start: '09:00', end: '17:00',
    })),
    holidays: [],
    ...overrides,
  }
}

describe('availability — PUT body schema', () => {
  it('accepts a complete, valid config', () => {
    expect(availabilityBodySchema.safeParse(body()).success).toBe(true)
  })

  it('rejects a non-positive slot length', () => {
    expect(availabilityBodySchema.safeParse(body({ slotMinutes: 0 })).success).toBe(false)
    expect(availabilityBodySchema.safeParse(body({ slotMinutes: -15 })).success).toBe(false)
  })

  it('requires all seven weekdays', () => {
    const six = body().workingHours.slice(0, 6)
    expect(availabilityBodySchema.safeParse(body({ workingHours: six })).success).toBe(false)
  })

  it('rejects a malformed time', () => {
    const wh = body().workingHours
    wh[1] = { ...wh[1], start: '9am' }
    expect(availabilityBodySchema.safeParse(body({ workingHours: wh })).success).toBe(false)
  })

  it('rejects a holiday with no label or a bad date', () => {
    expect(availabilityBodySchema.safeParse(body({ holidays: [{ date: '2026-10-21', label: '' }] })).success).toBe(false)
    expect(availabilityBodySchema.safeParse(body({ holidays: [{ date: '21-10-2026', label: 'x' }] })).success).toBe(false)
  })
})
