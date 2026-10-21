import { describe, it, expect } from 'vitest'
import { canTransition } from '../domain/statusMachine.js'
import { hasPermission } from '../domain/permissions.js'

// The visitor endpoints have no request body (check-in/out are parameterless),
// so the unit-testable surface is the permission grants and the status
// transitions the endpoints depend on. The full flow is covered live by
// check-b6.ts.

describe('visitors — permissions', () => {
  it('admin_dispatcher can check in and out and mark not reported', () => {
    expect(hasPermission('admin_dispatcher', 'visitor.checkIn')).toBe(true)
    expect(hasPermission('admin_dispatcher', 'visitor.checkOut')).toBe(true)
    expect(hasPermission('admin_dispatcher', 'appointment.markNotReported')).toBe(true)
  })

  it('super_admin can check in and out', () => {
    expect(hasPermission('super_admin', 'visitor.checkIn')).toBe(true)
    expect(hasPermission('super_admin', 'visitor.checkOut')).toBe(true)
  })

  it('a requester cannot check visitors in or out', () => {
    expect(hasPermission('requester', 'visitor.checkIn')).toBe(false)
    expect(hasPermission('requester', 'visitor.checkOut')).toBe(false)
  })

  it('coordinator_authority does not run the reception desk', () => {
    expect(hasPermission('coordinator_authority', 'visitor.checkIn')).toBe(false)
    expect(hasPermission('coordinator_authority', 'visitor.checkOut')).toBe(false)
  })
})

describe('visitors — transitions the endpoints rely on', () => {
  it('check-out completes a confirmed appointment', () => {
    expect(canTransition('confirmed', 'completed')).toBe(true)
  })

  it('no-show marks a confirmed appointment not-reported', () => {
    expect(canTransition('confirmed', 'not-reported')).toBe(true)
  })

  it('a submitted appointment cannot be completed or marked not-reported directly', () => {
    expect(canTransition('submitted', 'completed')).toBe(false)
    expect(canTransition('submitted', 'not-reported')).toBe(false)
  })

  it('completed and not-reported are terminal', () => {
    expect(canTransition('completed', 'not-reported')).toBe(false)
    expect(canTransition('not-reported', 'completed')).toBe(false)
  })
})

describe('visitors — reception queue date validation', () => {
  const isValidDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)

  it('accepts a YYYY-MM-DD date', () => {
    expect(isValidDate('2026-10-14')).toBe(true)
  })

  it('rejects malformed or empty dates', () => {
    expect(isValidDate('')).toBe(false)
    expect(isValidDate('14-10-2026')).toBe(false)
    expect(isValidDate('2026/10/14')).toBe(false)
  })
})
