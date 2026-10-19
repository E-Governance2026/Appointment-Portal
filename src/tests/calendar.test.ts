import { describe, it, expect, beforeEach } from 'vitest'
import {
  fetchCalendarAppointments,
  fetchDayAppointments,
  fetchAvailability,
  updateAvailability,
  ServiceError,
  __resetApprovals,
  __resetAvailability,
  type Actor,
} from '../services/appointmentsService'
import {
  generateSlots, isWorkingDay, type Availability,
} from '../data/availabilityData'

// ─── Stub actors ──────────────────────────────────────────────────────────────
const superAdmin: Actor  = { id: 'u-sup', name: 'Super Admin',    role: 'super_admin' }
const authority: Actor   = { id: 'auth-ss', name: 'Prof. Sneha Shah', role: 'coordinator_authority' }
const requester: Actor   = { id: 'u-req', name: 'Requester',      role: 'requester' }

// Today, used by the seed records.
const TODAY = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
})()

beforeEach(() => {
  __resetApprovals()
  __resetAvailability()
})

// ─── Calendar range ─────────────────────────────────────────────────────────────
describe('calendar — range', () => {
  it('super_admin sees appointments within the given range', async () => {
    const recs = await fetchCalendarAppointments(superAdmin, { from: '2026-01-01', to: '2026-12-31' })
    expect(recs.length).toBeGreaterThan(0)
    recs.forEach(r => {
      expect(r.date >= '2026-01-01' && r.date <= '2026-12-31').toBe(true)
    })
  })

  it('excludes appointments outside the range', async () => {
    const narrow = await fetchCalendarAppointments(superAdmin, { from: '1999-01-01', to: '1999-12-31' })
    expect(narrow).toEqual([])
  })
})

// ─── Day filter ─────────────────────────────────────────────────────────────────
describe('calendar — day', () => {
  it('returns the day appointments ordered by time', async () => {
    const day = await fetchDayAppointments(superAdmin, TODAY)
    expect(day.length).toBeGreaterThan(0)
    const times = day.map(d => d.time)
    const sorted = [...times].sort((a, b) => a.localeCompare(b))
    expect(times).toEqual(sorted)
  })
})

// ─── Availability read ────────────────────────────────────────────────────────
describe('availability — read', () => {
  it('returns the seeded config for an authority', async () => {
    const av = await fetchAvailability('auth-ss')
    expect(av).toBeDefined()
    expect(av!.slotMinutes).toBe(30)
    expect(av!.workingHours).toHaveLength(7)
  })

  it('returns undefined for an unknown authority', async () => {
    const av = await fetchAvailability('does-not-exist')
    expect(av).toBeUndefined()
  })
})

// ─── Availability update permission gate ──────────────────────────────────────
describe('availability — update permissions', () => {
  it('super_admin (manageAny) can update any authority', async () => {
    const av = (await fetchAvailability('auth-ss'))!
    const next: Availability = { ...av, slotMinutes: 20 }
    const saved = await updateAvailability(superAdmin, next)
    expect(saved.slotMinutes).toBe(20)
  })

  it('a requester cannot update availability', async () => {
    const av = (await fetchAvailability('auth-ss'))!
    await expect(updateAvailability(requester, { ...av, slotMinutes: 15 })).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('an authority can only update their own config', async () => {
    // authority actor id 'auth-ss' matches the owned record -> allowed.
    const own = (await fetchAvailability('auth-ss'))!
    const savedOwn = await updateAvailability(authority, { ...own, slotMinutes: 25 })
    expect(savedOwn.slotMinutes).toBe(25)

    // A different authority's config -> forbidden (manageOwn only).
    const other = (await fetchAvailability('auth-vm'))!
    await expect(updateAvailability(authority, { ...other, slotMinutes: 25 })).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('rejects a non-positive slot length', async () => {
    const av = (await fetchAvailability('auth-ss'))!
    await expect(updateAvailability(superAdmin, { ...av, slotMinutes: 0 })).rejects.toBeInstanceOf(ServiceError)
  })
})

// ─── Slot generation (pure helpers) ───────────────────────────────────────────
describe('availability — slot generation', () => {
  const av: Availability = {
    authorityId: 'x',
    slotMinutes: 30,
    workingHours: [
      { weekday: 0, enabled: false, start: '09:00', end: '17:00' }, // Sun
      { weekday: 1, enabled: true,  start: '09:00', end: '11:00' }, // Mon
      { weekday: 2, enabled: true,  start: '09:00', end: '17:00' },
      { weekday: 3, enabled: true,  start: '09:00', end: '17:00' },
      { weekday: 4, enabled: true,  start: '09:00', end: '17:00' },
      { weekday: 5, enabled: true,  start: '09:00', end: '17:00' },
      { weekday: 6, enabled: false, start: '09:00', end: '17:00' }, // Sat
    ],
    holidays: [{ date: '2026-01-05', label: 'Closed' }],
  }

  it('generates 30-minute slots within the working window', () => {
    // 2026-01-06 is a Tuesday (working 09:00-17:00) -> 16 slots.
    const slots = generateSlots(av, '2026-01-06')
    expect(slots[0]).toBe('09:00')
    expect(slots[1]).toBe('09:30')
    expect(slots).toHaveLength(16)
  })

  it('respects a shorter window', () => {
    // 2026-01-05 is a Monday but it is a holiday -> no slots.
    expect(generateSlots(av, '2026-01-05')).toEqual([])
    // 2026-01-12 is the next Monday (09:00-11:00) -> 4 slots.
    expect(generateSlots(av, '2026-01-12')).toEqual(['09:00', '09:30', '10:00', '10:30'])
  })

  it('returns no slots on a disabled weekday', () => {
    // 2026-01-10 is a Saturday (disabled).
    expect(generateSlots(av, '2026-01-10')).toEqual([])
  })

  it('isWorkingDay reflects holidays and disabled weekdays', () => {
    expect(isWorkingDay(av, '2026-01-06')).toBe(true)   // Tuesday
    expect(isWorkingDay(av, '2026-01-05')).toBe(false)  // holiday
    expect(isWorkingDay(av, '2026-01-10')).toBe(false)  // Saturday
  })
})
