import { describe, it, expect } from 'vitest'
import {
  canTransition, allowedNextStatuses, isTerminal, TERMINAL_STATUSES,
} from '../domain/statusMachine.js'
import {
  hasPermission, canViewAppointment, ROLES,
} from '../domain/permissions.js'

// ─── Status machine parity ──────────────────────────────────────────────────
describe('domain — status machine', () => {
  it('allows submitted → approved / rejected / additional-info / rescheduled / cancelled', () => {
    for (const to of ['approved', 'rejected', 'additional-info', 'rescheduled', 'cancelled'] as const) {
      expect(canTransition('submitted', to)).toBe(true)
    }
  })

  it('does not allow submitted → completed (must pass through approval)', () => {
    expect(canTransition('submitted', 'completed')).toBe(false)
  })

  it('approved → confirmed is allowed but approved → completed is not', () => {
    expect(canTransition('approved', 'confirmed')).toBe(true)
    expect(canTransition('approved', 'completed')).toBe(false)
  })

  it('confirmed can complete, reschedule, cancel or become not-reported', () => {
    for (const to of ['completed', 'rescheduled', 'cancelled', 'not-reported'] as const) {
      expect(canTransition('confirmed', to)).toBe(true)
    }
  })

  it('rejects same-status transitions', () => {
    expect(canTransition('submitted', 'submitted')).toBe(false)
  })

  it('terminal states have no outgoing transitions', () => {
    for (const s of TERMINAL_STATUSES) {
      expect(allowedNextStatuses(s)).toEqual([])
      expect(isTerminal(s)).toBe(true)
    }
  })
})

// ─── Permissions parity ───────────────────────────────────────────────────────
describe('domain — permissions', () => {
  it('requester can create/view own, cannot approve', () => {
    expect(hasPermission('requester', 'appointment.create')).toBe(true)
    expect(hasPermission('requester', 'appointment.viewOwn')).toBe(true)
    expect(hasPermission('requester', 'appointment.approve')).toBe(false)
  })

  it('coordinator_authority can request info, forward, approve, reject, confirm', () => {
    expect(hasPermission('coordinator_authority', 'appointment.requestInfo')).toBe(true)
    expect(hasPermission('coordinator_authority', 'appointment.forward')).toBe(true)
    expect(hasPermission('coordinator_authority', 'appointment.approve')).toBe(true)
    expect(hasPermission('coordinator_authority', 'appointment.reject')).toBe(true)
    expect(hasPermission('coordinator_authority', 'appointment.confirm')).toBe(true)
  })

  it('coordinator_authority cannot manage masters or run reports.viewAll', () => {
    expect(hasPermission('coordinator_authority', 'master.manage')).toBe(false)
    expect(hasPermission('coordinator_authority', 'reports.viewAll')).toBe(false)
  })

  it('admin_dispatcher runs the reception desk (check in/out), cannot manage masters', () => {
    expect(hasPermission('admin_dispatcher', 'visitor.checkIn')).toBe(true)
    expect(hasPermission('admin_dispatcher', 'visitor.checkOut')).toBe(true)
    expect(hasPermission('admin_dispatcher', 'master.manage')).toBe(false)
  })

  it('only super_admin can manage masters and users', () => {
    const masters = ROLES.filter(r => hasPermission(r, 'master.manage'))
    const users = ROLES.filter(r => hasPermission(r, 'user.manage'))
    expect(masters).toEqual(['super_admin'])
    expect(users).toEqual(['super_admin'])
  })
})

// ─── Row-level visibility parity ────────────────────────────────────────────
describe('domain — canViewAppointment', () => {
  const requester = { id: 'u-req', name: 'Rohan Mehta', role: 'requester' as const }
  const coordinatorAuthority = { id: 'u-ca', name: 'Dr. Amit Patel', role: 'coordinator_authority' as const }
  const superAdmin = { id: 'u-sup', name: 'Super Admin', role: 'super_admin' as const }

  it('requester sees only their own rows', () => {
    expect(canViewAppointment(requester, { requesterId: 'u-req' })).toBe(true)
    expect(canViewAppointment(requester, { requesterId: 'u-other' })).toBe(false)
  })

  it('super_admin sees everything', () => {
    expect(canViewAppointment(superAdmin, { requesterId: 'u-other', assignedRole: 'coordinator_authority' })).toBe(true)
  })

  it('coordinator_authority sees rows assigned to their role only', () => {
    expect(canViewAppointment(coordinatorAuthority, { assignedRole: 'coordinator_authority' })).toBe(true)
    expect(canViewAppointment(coordinatorAuthority, { assignedRole: 'admin_dispatcher' })).toBe(false)
  })

  it('no user → no access', () => {
    expect(canViewAppointment(null, { requesterId: 'u-req' })).toBe(false)
  })
})
