import { describe, it, expect } from 'vitest'
import {
  hasPermission,
  canAccessRoute,
  actionsFor,
  ROLES,
} from '../config/permissions'

describe('permissions — hasPermission', () => {
  it('requester can create and view own, but cannot approve', () => {
    expect(hasPermission('requester', 'appointment.create')).toBe(true)
    expect(hasPermission('requester', 'appointment.viewOwn')).toBe(true)
    expect(hasPermission('requester', 'appointment.approve')).toBe(false)
  })

  it('coordinator_authority can request info, forward, approve, reject and confirm', () => {
    expect(hasPermission('coordinator_authority', 'appointment.requestInfo')).toBe(true)
    expect(hasPermission('coordinator_authority', 'appointment.forward')).toBe(true)
    expect(hasPermission('coordinator_authority', 'appointment.approve')).toBe(true)
    expect(hasPermission('coordinator_authority', 'appointment.reject')).toBe(true)
    expect(hasPermission('coordinator_authority', 'appointment.confirm')).toBe(true)
  })

  it('coordinator_authority cannot manage masters', () => {
    expect(hasPermission('coordinator_authority', 'master.manage')).toBe(false)
  })

  it('admin_dispatcher runs the reception desk (check in/out), cannot manage masters', () => {
    expect(hasPermission('admin_dispatcher', 'visitor.checkIn')).toBe(true)
    expect(hasPermission('admin_dispatcher', 'visitor.checkOut')).toBe(true)
    expect(hasPermission('admin_dispatcher', 'appointment.approve')).toBe(true)
    expect(hasPermission('admin_dispatcher', 'master.manage')).toBe(false)
  })

  it('super_admin can manage masters and users', () => {
    expect(hasPermission('super_admin', 'master.manage')).toBe(true)
    expect(hasPermission('super_admin', 'user.manage')).toBe(true)
    expect(hasPermission('super_admin', 'reports.viewAll')).toBe(true)
  })

  it('only super_admin can manage masters', () => {
    const canManage = ROLES.filter(r => hasPermission(r, 'master.manage'))
    expect(canManage).toEqual(['super_admin'])
  })
})

describe('permissions — canAccessRoute', () => {
  it('everyone can access the dashboard', () => {
    ROLES.forEach(r => expect(canAccessRoute(r, '/dashboard')).toBe(true))
  })

  it('requester can access the booking flow', () => {
    expect(canAccessRoute('requester', '/book')).toBe(true)
  })

  it('requester cannot access approvals', () => {
    expect(canAccessRoute('requester', '/approvals')).toBe(false)
  })

  it('coordinator_authority can access approvals', () => {
    expect(canAccessRoute('coordinator_authority', '/approvals')).toBe(true)
  })

  it('only super_admin can access master and user management', () => {
    ROLES.forEach(r => {
      const expected = r === 'super_admin'
      expect(canAccessRoute(r, '/master-management')).toBe(expected)
      expect(canAccessRoute(r, '/user-management')).toBe(expected)
    })
  })

  it('admin_dispatcher can access visitor management', () => {
    expect(canAccessRoute('admin_dispatcher', '/visitor-management')).toBe(true)
  })

  it('requester cannot access visitor management', () => {
    expect(canAccessRoute('requester', '/visitor-management')).toBe(false)
  })
})

describe('permissions — actionsFor', () => {
  it('every role has at least one action', () => {
    ROLES.forEach(r => expect(actionsFor(r).length).toBeGreaterThan(0))
  })
})
