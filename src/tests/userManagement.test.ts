import { describe, it, expect, beforeEach } from 'vitest'
import {
  fetchUsers, createUser, updateUser, deleteUser, setUserActive,
  __resetUsers,
  type Actor,
} from '../services/appointmentsService'
import { seedUsers } from '../data/userData'

// ─── Stub actors ──────────────────────────────────────────────────────────────
// u-sup is the seeded super admin (from authStore DEMO_USERS).
const superAdmin: Actor  = { id: 'u-sup', name: 'Super Admin', role: 'super_admin' }
const authority: Actor    = { id: 'u-aut', name: 'Authority',  role: 'authority' }

beforeEach(() => {
  __resetUsers()
})

// ─── Read + permission ──────────────────────────────────────────────────────────
describe('user management — read + permission', () => {
  it('super_admin can read users (seeded)', async () => {
    const users = await fetchUsers(superAdmin)
    expect(users.length).toBe(seedUsers().length)
  })

  it('a non-admin cannot read users', async () => {
    await expect(fetchUsers(authority)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('a non-admin cannot create a user', async () => {
    await expect(createUser(authority, {
      name: 'X', email: 'x@university.edu', employeeId: '', department: 'Finance', role: 'requester', active: true,
    })).rejects.toMatchObject({ code: 'forbidden' })
  })
})

// ─── CRUD ────────────────────────────────────────────────────────────────────
describe('user management — CRUD', () => {
  it('creates, updates and deletes a user', async () => {
    const created = await createUser(superAdmin, {
      name: 'New User', email: 'new.user@university.edu', employeeId: 'PU-9', department: 'Finance', role: 'requester', active: true,
    })
    expect(created.id).toBeTruthy()

    const updated = await updateUser(superAdmin, { ...created, role: 'coordinator' })
    expect(updated.role).toBe('coordinator')

    await deleteUser(superAdmin, created.id)
    const users = await fetchUsers(superAdmin)
    expect(users.find(u => u.id === created.id)).toBeUndefined()
  })

  it('can activate and deactivate a user', async () => {
    const created = await createUser(superAdmin, {
      name: 'Toggle User', email: 'toggle@university.edu', employeeId: '', department: 'Finance', role: 'reception', active: true,
    })
    const off = await setUserActive(superAdmin, created.id, false)
    expect(off.active).toBe(false)
    const on = await setUserActive(superAdmin, created.id, true)
    expect(on.active).toBe(true)
  })
})

// ─── Validation ────────────────────────────────────────────────────────────────
describe('user management — validation', () => {
  it('rejects a blank name', async () => {
    await expect(createUser(superAdmin, {
      name: '  ', email: 'a@university.edu', employeeId: '', department: 'Finance', role: 'requester', active: true,
    })).rejects.toMatchObject({ code: 'validation' })
  })

  it('rejects an invalid email', async () => {
    await expect(createUser(superAdmin, {
      name: 'Bad Email', email: 'not-an-email', employeeId: '', department: 'Finance', role: 'requester', active: true,
    })).rejects.toMatchObject({ code: 'validation' })
  })

  it('rejects a duplicate email (case-insensitive)', async () => {
    const existing = (await fetchUsers(superAdmin))[0]
    await expect(createUser(superAdmin, {
      name: 'Clash', email: existing.email.toUpperCase(), employeeId: '', department: 'Finance', role: 'requester', active: true,
    })).rejects.toMatchObject({ code: 'duplicate' })
  })
})

// ─── Guards: last super admin + self ─────────────────────────────────────────
describe('user management — guards', () => {
  it('cannot deactivate the last active super admin', async () => {
    // Seed has exactly one super admin (u-sup).
    await expect(setUserActive(superAdmin, 'u-sup', false)).rejects.toMatchObject({ code: 'in_use' })
  })

  it('cannot deactivate your own account', async () => {
    // Add a second super admin so the "last super admin" guard is not what triggers.
    await createUser(superAdmin, {
      name: 'Second Admin', email: 'second.admin@university.edu', employeeId: '', department: 'MIS Department', role: 'super_admin', active: true,
    })
    await expect(setUserActive(superAdmin, 'u-sup', false)).rejects.toMatchObject({ code: 'in_use' })
  })

  it('cannot delete your own account', async () => {
    await expect(deleteUser(superAdmin, 'u-sup')).rejects.toMatchObject({ code: 'in_use' })
  })

  it('cannot demote the last super admin via update', async () => {
    await expect(updateUser(superAdmin, {
      id: 'u-sup', name: 'Super Admin', email: 'super.admin@university.edu',
      employeeId: 'PU-2010-000', department: 'MIS Department', role: 'coordinator', active: true,
    })).rejects.toMatchObject({ code: 'in_use' })
  })

  it('allows demoting a super admin when another active one exists', async () => {
    await createUser(superAdmin, {
      name: 'Backup Admin', email: 'backup.admin@university.edu', employeeId: '', department: 'MIS Department', role: 'super_admin', active: true,
    })
    const demoted = await updateUser(superAdmin, {
      id: 'u-sup', name: 'Super Admin', email: 'super.admin@university.edu',
      employeeId: 'PU-2010-000', department: 'MIS Department', role: 'coordinator', active: true,
    })
    expect(demoted.role).toBe('coordinator')
  })
})
