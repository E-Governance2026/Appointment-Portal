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

  it('coordinator can request info and forward, but cannot approve', () => {
    expect(hasPermission('coordinator', 'appointment.requestInfo')).toBe(true)
    expect(hasPermission('coordinator', 'appointment.forward')).toBe(true)
    expect(hasPermission('coordinator', 'appointment.approve')).toBe(false)
  })

  it('authority can approve, reject and confirm', () => {
    expect(hasPermission('authority', 'appointment.approve')).toBe(true)
    expect(hasPermission('authority', 'appointment.reject')).toBe(true)
    expect(hasPermission('authority', 'appointment.confirm')).toBe(true)
  })

  it('reception can check in and out, but cannot approve or manage masters', () => {
    expect(hasPermission('reception', 'visitor.checkIn')).toBe(true)
    expect(hasPermission('reception', 'visitor.checkOut')).toBe(true)
    expect(hasPermission('reception', 'appointment.approve')).toBe(false)
    expect(hasPermission('reception', 'master.manage')).toBe(false)
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

  it('reception cannot access the booking flow', () => {
    expect(canAccessRoute('reception', '/book')).toBe(false)
  })

  it('requester cannot access approvals', () => {
    expect(canAccessRoute('requester', '/approvals')).toBe(false)
  })

  it('authority can access approvals', () => {
    expect(canAccessRoute('authority', '/approvals')).toBe(true)
  })

  it('only super_admin can access master and user management', () => {
    ROLES.forEach(r => {
      const expected = r === 'super_admin'
      expect(canAccessRoute(r, '/master-management')).toBe(expected)
      expect(canAccessRoute(r, '/user-management')).toBe(expected)
    })
  })

  it('reception can access visitor management', () => {
    expect(canAccessRoute('reception', '/visitor-management')).toBe(true)
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
