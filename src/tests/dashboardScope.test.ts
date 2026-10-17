import { describe, it, expect } from 'vitest'
import {
  fetchAllAppointments,
  fetchTodaysAppointments,
  SEED_APPOINTMENTS,
  type Viewer,
} from '../data/mockAppointments'
import { canViewAppointment } from '../config/permissions'

// The demo requester (matches PEOPLE[0] in the seed generator and DEMO_USERS).
const requester: Viewer = { id: 'u-req', name: 'Rohan Mehta', role: 'requester' }
const superAdmin: Viewer = { id: 'u-sup', name: 'Super Admin', role: 'super_admin' }

describe('dashboard data scope — canViewAppointment', () => {
  it('a requester can see only their own appointments', async () => {
    const list = await fetchAllAppointments(requester)
    expect(list.length).toBeGreaterThan(0)   // the requester has some records
    for (const a of list) {
      expect(a.requester).toBe('Rohan Mehta')
    }
  })

  it('FAILS if a requester receives someone else\'s record', async () => {
    const list = await fetchAllAppointments(requester)
    const leaked = list.filter(a => a.requesterId && a.requesterId !== requester.id)
    expect(leaked).toEqual([])
  })

  it('super_admin sees every appointment', async () => {
    const list = await fetchAllAppointments(superAdmin)
    expect(list.length).toBe(SEED_APPOINTMENTS.length)
  })

  it('today scope is also filtered for a requester', async () => {
    const today = await fetchTodaysAppointments(requester)
    for (const a of today) {
      expect(a.requester).toBe('Rohan Mehta')
    }
  })

  it('canViewAppointment blocks a requester from another requester row directly', () => {
    const otherRow = { requester: 'Priya Sharma', requesterId: 'u-1101', assignedRole: 'authority' as const }
    expect(canViewAppointment(requester, otherRow)).toBe(false)
    expect(canViewAppointment(superAdmin, otherRow)).toBe(true)
  })

  it('an authority sees rows assigned to the authority role, not arbitrary requesters', () => {
    const authority: Viewer = { id: 'u-aut', name: 'Dr. Amit Patel', role: 'authority' }
    const assignedToCoordinator = { requester: 'X', requesterId: 'u-x', assignedRole: 'coordinator' as const }
    const assignedToAuthority   = { requester: 'Y', requesterId: 'u-y', assignedRole: 'authority' as const }
    expect(canViewAppointment(authority, assignedToCoordinator)).toBe(false)
    expect(canViewAppointment(authority, assignedToAuthority)).toBe(true)
  })
})
