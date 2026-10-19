import { describe, it, expect, beforeEach } from 'vitest'
import {
  fetchMasterData,
  createDepartment, updateDepartment, deleteDepartment,
  createAppointmentType, deleteAppointmentType,
  createAuthority, updateAuthority, deleteAuthority,
  __resetApprovals,
  __resetMasterData,
  type Actor,
} from '../services/appointmentsService'

// ─── Stub actors ──────────────────────────────────────────────────────────────
const superAdmin: Actor  = { id: 'u-sup', name: 'Super Admin', role: 'super_admin' }
const authority: Actor    = { id: 'u-aut', name: 'Authority',  role: 'coordinator_authority' }

beforeEach(() => {
  __resetApprovals()
  __resetMasterData()
})

// ─── Read + permission ──────────────────────────────────────────────────────────
describe('master data — read + permission', () => {
  it('super_admin can read master data (seeded)', async () => {
    const data = await fetchMasterData(superAdmin)
    expect(data.departments.length).toBeGreaterThan(0)
    expect(data.types.length).toBeGreaterThan(0)
    expect(data.authorities.length).toBeGreaterThan(0)
  })

  it('a non-admin cannot read master data', async () => {
    await expect(fetchMasterData(authority)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('a non-admin cannot create a department', async () => {
    await expect(createDepartment(authority, { name: 'X', code: 'X', active: true }))
      .rejects.toMatchObject({ code: 'forbidden' })
  })
})

// ─── Departments CRUD ───────────────────────────────────────────────────────────
describe('master data — departments', () => {
  it('creates, updates and deletes a department', async () => {
    const created = await createDepartment(superAdmin, { name: 'Library', code: 'LIB', active: true })
    expect(created.id).toBeTruthy()

    const updated = await updateDepartment(superAdmin, { ...created, code: 'LIBR' })
    expect(updated.code).toBe('LIBR')

    await deleteDepartment(superAdmin, created.id)
    const data = await fetchMasterData(superAdmin)
    expect(data.departments.find(d => d.id === created.id)).toBeUndefined()
  })

  it('rejects a blank name', async () => {
    await expect(createDepartment(superAdmin, { name: '   ', code: 'X', active: true }))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('rejects a duplicate name (case-insensitive)', async () => {
    await createDepartment(superAdmin, { name: 'Library', code: 'LIB', active: true })
    await expect(createDepartment(superAdmin, { name: 'library', code: 'L2', active: true }))
      .rejects.toMatchObject({ code: 'duplicate' })
  })

  it('blocks deleting a department still used by an authority', async () => {
    const data = await fetchMasterData(superAdmin)
    const inUse = data.departments.find(d => data.authorities.some(a => a.department === d.name))!
    await expect(deleteDepartment(superAdmin, inUse.id)).rejects.toMatchObject({ code: 'in_use' })
  })
})

// ─── Appointment types CRUD ───────────────────────────────────────────────────
describe('master data — appointment types', () => {
  it('creates a type with a positive duration', async () => {
    const t = await createAppointmentType(superAdmin, {
      name: 'Counselling', description: 'Student counselling', defaultDurationMinutes: 45, active: true,
    })
    expect(t.id).toBeTruthy()
    expect(t.defaultDurationMinutes).toBe(45)
  })

  it('rejects a non-positive duration', async () => {
    await expect(createAppointmentType(superAdmin, {
      name: 'Bad', description: '', defaultDurationMinutes: 0, active: true,
    })).rejects.toMatchObject({ code: 'validation' })
  })

  it('blocks deleting a type handled by an authority', async () => {
    const data = await fetchMasterData(superAdmin)
    // 'academic' is handled by at least one seeded authority.
    const used = data.types.find(t => data.authorities.some(a => a.typeIds.includes(t.id)))!
    await expect(deleteAppointmentType(superAdmin, used.id)).rejects.toMatchObject({ code: 'in_use' })
  })

  it('allows deleting a type no authority handles', async () => {
    const fresh = await createAppointmentType(superAdmin, {
      name: 'Standalone', description: '', defaultDurationMinutes: 15, active: true,
    })
    await deleteAppointmentType(superAdmin, fresh.id)
    const data = await fetchMasterData(superAdmin)
    expect(data.types.find(t => t.id === fresh.id)).toBeUndefined()
  })
})

// ─── Authorities CRUD ───────────────────────────────────────────────────────────
describe('master data — authorities', () => {
  it('creates and updates an authority with type ids', async () => {
    const a = await createAuthority(superAdmin, {
      name: 'Dr. New Person', designation: 'Dean', department: 'Finance', typeIds: ['finance'], active: true,
    })
    expect(a.id).toBeTruthy()
    const u = await updateAuthority(superAdmin, { ...a, typeIds: ['finance', 'general'] })
    expect(u.typeIds).toEqual(['finance', 'general'])
  })

  it('requires a department', async () => {
    await expect(createAuthority(superAdmin, {
      name: 'No Dept', designation: '', department: '', typeIds: [], active: true,
    })).rejects.toMatchObject({ code: 'validation' })
  })

  it('deletes an authority that has no active appointments', async () => {
    const a = await createAuthority(superAdmin, {
      name: 'Temp Authority', designation: '', department: 'Finance', typeIds: [], active: true,
    })
    await deleteAuthority(superAdmin, a.id)
    const data = await fetchMasterData(superAdmin)
    expect(data.authorities.find(x => x.id === a.id)).toBeUndefined()
  })

  it('blocks deleting an authority with active appointments assigned', async () => {
    // Seed authority 'auth-ss' has active (submitted) appointments in the approval store.
    await expect(deleteAuthority(superAdmin, 'auth-ss')).rejects.toMatchObject({ code: 'in_use' })
  })
})
