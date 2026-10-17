import { describe, it, expect } from 'vitest'
import {
  canTransition,
  allowedNextStatuses,
  assertTransition,
  isTerminal,
  TERMINAL_STATUSES,
} from '../config/statusMachine'

describe('statusMachine — canTransition', () => {
  it('allows draft → submitted', () => {
    expect(canTransition('draft', 'submitted')).toBe(true)
  })

  it('allows submitted → approved / rejected / additional-info', () => {
    expect(canTransition('submitted', 'approved')).toBe(true)
    expect(canTransition('submitted', 'rejected')).toBe(true)
    expect(canTransition('submitted', 'additional-info')).toBe(true)
  })

  it('does NOT allow submitted → completed (must pass through approval)', () => {
    expect(canTransition('submitted', 'completed')).toBe(false)
  })

  it('enforces approved ≠ confirmed (PRD rule)', () => {
    // Approved can become Confirmed, but it is a separate explicit step.
    expect(canTransition('approved', 'confirmed')).toBe(true)
    // Approved cannot jump straight to completed.
    expect(canTransition('approved', 'completed')).toBe(false)
  })

  it('allows confirmed → completed', () => {
    expect(canTransition('confirmed', 'completed')).toBe(true)
  })

  it('rejects same-status transitions', () => {
    expect(canTransition('submitted', 'submitted')).toBe(false)
  })

  it('does not allow transitions out of terminal states', () => {
    expect(canTransition('rejected', 'submitted')).toBe(false)
    expect(canTransition('cancelled', 'submitted')).toBe(false)
    expect(canTransition('completed', 'confirmed')).toBe(false)
  })

  it('additional-info can go back to submitted', () => {
    expect(canTransition('additional-info', 'submitted')).toBe(true)
  })
})

describe('statusMachine — allowedNextStatuses', () => {
  it('returns the correct set for submitted', () => {
    const next = allowedNextStatuses('submitted')
    expect(next).toContain('approved')
    expect(next).toContain('rejected')
    expect(next).toContain('additional-info')
    expect(next).toContain('rescheduled')
    expect(next).toContain('cancelled')
  })

  it('returns an empty array for terminal states', () => {
    expect(allowedNextStatuses('completed')).toEqual([])
    expect(allowedNextStatuses('rejected')).toEqual([])
    expect(allowedNextStatuses('cancelled')).toEqual([])
  })
})

describe('statusMachine — assertTransition', () => {
  it('does not throw for a legal transition', () => {
    expect(() => assertTransition('draft', 'submitted')).not.toThrow()
  })

  it('throws a descriptive error for an illegal transition', () => {
    expect(() => assertTransition('submitted', 'completed')).toThrow(/Illegal status transition/)
  })
})

describe('statusMachine — isTerminal', () => {
  it('identifies terminal statuses', () => {
    TERMINAL_STATUSES.forEach(s => expect(isTerminal(s)).toBe(true))
  })
  it('non-terminal statuses are not terminal', () => {
    expect(isTerminal('submitted')).toBe(false)
    expect(isTerminal('approved')).toBe(false)
    expect(isTerminal('confirmed')).toBe(false)
  })
})
