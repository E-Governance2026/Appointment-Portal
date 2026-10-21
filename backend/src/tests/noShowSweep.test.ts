import { describe, it, expect } from 'vitest'
import { isPastSlot } from '../domain/noShowSweep.js'

const NOW = new Date('2026-10-14T12:00:00')

describe('no-show sweep — isPastSlot', () => {
  it('is true for a slot earlier today', () => {
    expect(isPastSlot('2026-10-14', '09:00', NOW)).toBe(true)
  })

  it('is false for a slot later today', () => {
    expect(isPastSlot('2026-10-14', '15:00', NOW)).toBe(false)
  })

  it('is true for any time on a past date', () => {
    expect(isPastSlot('2026-10-13', '23:00', NOW)).toBe(true)
  })

  it('is false for a future date', () => {
    expect(isPastSlot('2026-10-20', '08:00', NOW)).toBe(false)
  })

  it('is false when the slot is missing (no date or no time)', () => {
    expect(isPastSlot(null, '09:00', NOW)).toBe(false)
    expect(isPastSlot('2026-10-14', null, NOW)).toBe(false)
    expect(isPastSlot('', '', NOW)).toBe(false)
  })

  it('is false for a malformed date or time', () => {
    expect(isPastSlot('14-10-2026', '09:00', NOW)).toBe(false)
    expect(isPastSlot('2026-10-14', '9am', NOW)).toBe(false)
  })

  it('treats the exact current minute as not yet past', () => {
    // slot == now is not strictly before now.
    expect(isPastSlot('2026-10-14', '12:00', NOW)).toBe(false)
  })
})

// The calendar/day/sweep endpoints validate dates with this shape.
describe('B10 — date query validation', () => {
  const isValidDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
  it('accepts YYYY-MM-DD and rejects other shapes', () => {
    expect(isValidDate('2026-10-14')).toBe(true)
    expect(isValidDate('2026-1-4')).toBe(false)
    expect(isValidDate('')).toBe(false)
  })
})
