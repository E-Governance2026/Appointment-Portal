import { describe, it, expect, beforeEach } from 'vitest'
import {
  fetchMonthAvailability,
  fetchDaySlots,
  __forceSlotState,
  __clearStores,
} from '../data/bookingApi'
import { BUSINESS_RULES } from '../data/bookingSeeds'

const AUTH_ID = 'auth-ss'
const WORKING_DAYS = new Set(BUSINESS_RULES.workingDays)  // { 1,2,3,4,5 }

// ─── Helper: find the next working day strictly after today (never today) ─────
// Scans forward up to bookingWindowDays to find a Mon-Fri that is not today.
function nextWorkingDay(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  // Start from tomorrow
  for (let i = 1; i <= BUSINESS_RULES.bookingWindowDays; i++) {
    const candidate = new Date(d)
    candidate.setDate(d.getDate() + i)
    if (WORKING_DAYS.has(candidate.getDay())) return candidate
  }
  throw new Error('No working day found within booking window')
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

beforeEach(() => {
  __clearStores()
})

// ─── Month availability ───────────────────────────────────────────────────────
describe('fetchMonthAvailability', () => {
  it('marks past days as closed with reason "Past date"', async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const data  = await fetchMonthAvailability(AUTH_ID, today.getFullYear(), today.getMonth())
    // Only check days strictly before today (today itself is also "past" for same-day edge)
    const past  = data.filter(d => d.date < isoDate(today))
    expect(past.length).toBeGreaterThan(0)
    past.forEach(d => {
      expect(d.open).toBe(false)
      expect(d.reason).toBe('Past date')
    })
  })

  it('marks future weekends as closed with reason "Non-working day"', async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const windowEnd = new Date(today)
    windowEnd.setDate(today.getDate() + BUSINESS_RULES.bookingWindowDays)

    const data = await fetchMonthAvailability(AUTH_ID, today.getFullYear(), today.getMonth())
    // Future weekend days within the booking window
    const futureWeekends = data.filter(d => {
      const day = new Date(d.date + 'T00:00:00').getDay()
      const isWeekend = day === 0 || day === 6
      return isWeekend && d.date > isoDate(today) && d.date <= isoDate(windowEnd)
    })

    if (futureWeekends.length === 0) {
      // No future weekends in this month — test is N/A, skip gracefully
      return
    }

    futureWeekends.forEach(d => {
      expect(d.open).toBe(false)
      expect(d.reason).toBe('Non-working day')
    })
  })

  it('marks dates beyond booking window as closed', async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const windowEnd = new Date(today)
    windowEnd.setDate(today.getDate() + BUSINESS_RULES.bookingWindowDays)

    // Check the month that is 2 months ahead — fully outside the window
    const farYear  = windowEnd.getFullYear()
    const farMonth = (windowEnd.getMonth() + 1) % 12
    const farMonthYear = farMonth === 0 ? farYear + 1 : farYear

    const data = await fetchMonthAvailability(AUTH_ID, farMonthYear, farMonth)
    // All days in this month should be outside the window
    const outOfWindow = data.filter(d => d.date > isoDate(windowEnd))
    if (outOfWindow.length > 0) {
      outOfWindow.forEach(d => {
        expect(d.open).toBe(false)
        expect(d.reason).toBe('Outside booking window')
      })
    }
  })

  it('marks a fully booked working day as closed with reason "No slots"', async () => {
    const target    = nextWorkingDay()
    const dateStr   = isoDate(target)
    // Block every possible slot
    const allSlots  = ['09:00','09:30','10:00','10:30','11:00','11:30',
                       '13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30']
    allSlots.forEach(t => __forceSlotState(AUTH_ID, dateStr, t, 'booked'))

    const data = await fetchMonthAvailability(AUTH_ID, target.getFullYear(), target.getMonth())
    const day  = data.find(d => d.date === dateStr)
    expect(day?.open).toBe(false)
    expect(day?.reason).toBe('No slots')
  })

  it('opens a valid working day that has at least one free slot', async () => {
    const target  = nextWorkingDay()
    const dateStr = isoDate(target)

    const data = await fetchMonthAvailability(AUTH_ID, target.getFullYear(), target.getMonth())
    const day  = data.find(d => d.date === dateStr)
    expect(day?.open).toBe(true)
  })
})

// ─── Day slots ────────────────────────────────────────────────────────────────
describe('fetchDaySlots', () => {
  it('returns 14 slots for a normal working day', async () => {
    const target = nextWorkingDay()
    const slots  = await fetchDaySlots(AUTH_ID, isoDate(target))
    expect(slots.length).toBe(14)
  })

  it('shows held slots with correct label when pendingRequestsReserveSlot is true', async () => {
    const target  = nextWorkingDay()
    const dateStr = isoDate(target)
    __forceSlotState(AUTH_ID, dateStr, '10:00', 'held')
    const slots = await fetchDaySlots(AUTH_ID, dateStr)
    const held  = slots.find(s => s.time === '10:00')
    expect(held?.state).toBe('held')
    if (BUSINESS_RULES.pendingRequestsReserveSlot) {
      expect(held?.label).toBe('Held for a pending request')
    }
  })

  it('shows booked slots with label "Booked"', async () => {
    const target  = nextWorkingDay()
    const dateStr = isoDate(target)
    __forceSlotState(AUTH_ID, dateStr, '09:30', 'booked')
    const slots  = await fetchDaySlots(AUTH_ID, dateStr)
    const booked = slots.find(s => s.time === '09:30')
    expect(booked?.state).toBe('booked')
    expect(booked?.label).toBe('Booked')
  })

  it('throws for a past date', async () => {
    const past = new Date()
    past.setHours(0, 0, 0, 0)
    past.setDate(past.getDate() - 1)
    await expect(fetchDaySlots(AUTH_ID, isoDate(past))).rejects.toThrow()
  })

  it('throws for a date outside the booking window', async () => {
    const far = new Date()
    far.setHours(0, 0, 0, 0)
    far.setDate(far.getDate() + BUSINESS_RULES.bookingWindowDays + 5)
    // Ensure it is a weekday so it fails due to window, not weekend
    while ([0, 6].includes(far.getDay())) far.setDate(far.getDate() + 1)
    await expect(fetchDaySlots(AUTH_ID, isoDate(far))).rejects.toThrow()
  })

  it('returns at least one available slot on a clean working day', async () => {
    const target = nextWorkingDay()
    const slots  = await fetchDaySlots(AUTH_ID, isoDate(target))
    const avail  = slots.find(s => s.state === 'available')
    expect(avail).toBeTruthy()
  })
})
