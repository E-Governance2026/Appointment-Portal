import { describe, it, expect } from 'vitest'
import { canTransition } from '../domain/statusMachine.js'
import { hasPermission } from '../domain/permissions.js'

// The B12 workflow endpoints validate bodies with small inline zod schemas and
// rely on the status machine + permission map. These tests cover the transition
// and permission rules the endpoints depend on; the full round trips are in
// check-b12.ts.

describe('workflow2 — transitions', () => {
  it('propose-reschedule is legal from submitted / approved / confirmed', () => {
    expect(canTransition('submitted', 'rescheduled')).toBe(true)
    expect(canTransition('approved', 'rescheduled')).toBe(true)
    expect(canTransition('confirmed', 'rescheduled')).toBe(true)
  })

  it('respond-reschedule can go to confirmed or cancelled', () => {
    expect(canTransition('rescheduled', 'confirmed')).toBe(true)
    expect(canTransition('rescheduled', 'cancelled')).toBe(true)
  })

  it('provide-info moves additional-info back to submitted', () => {
    expect(canTransition('additional-info', 'submitted')).toBe(true)
  })

  it('cancel is legal from active statuses but not from terminal ones', () => {
    expect(canTransition('submitted', 'cancelled')).toBe(true)
    expect(canTransition('approved', 'cancelled')).toBe(true)
    expect(canTransition('confirmed', 'cancelled')).toBe(true)
    expect(canTransition('completed', 'cancelled')).toBe(false)
    expect(canTransition('rejected', 'cancelled')).toBe(false)
  })
})

describe('workflow2 — permissions', () => {
  it('coordinator_authority can forward, remark, propose reschedule', () => {
    expect(hasPermission('coordinator_authority', 'appointment.forward')).toBe(true)
    expect(hasPermission('coordinator_authority', 'appointment.internalRemark')).toBe(true)
    expect(hasPermission('coordinator_authority', 'appointment.proposeReschedule')).toBe(true)
  })

  it('requester can respond to a reschedule, provide info, and request cancel', () => {
    expect(hasPermission('requester', 'appointment.respondReschedule')).toBe(true)
    expect(hasPermission('requester', 'appointment.provideInfo')).toBe(true)
    expect(hasPermission('requester', 'appointment.requestCancel')).toBe(true)
  })

  it('requester cannot forward or add internal remarks', () => {
    expect(hasPermission('requester', 'appointment.forward')).toBe(false)
    expect(hasPermission('requester', 'appointment.internalRemark')).toBe(false)
  })

  it('cancel permission: staff have appointment.cancel, requester has requestCancel', () => {
    expect(hasPermission('coordinator_authority', 'appointment.cancel')).toBe(true)
    expect(hasPermission('admin_dispatcher', 'appointment.cancel')).toBe(true)
    expect(hasPermission('requester', 'appointment.cancel')).toBe(false)
  })
})
