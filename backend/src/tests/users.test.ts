import { describe, it, expect } from 'vitest'
import {
  toUserDto, userCreateSchema, activeSchema,
  countActiveSuperAdmins, newUserId,
  type UserRow,
} from '../routes/userMapper.js'

function row(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u-1', name: 'A', email: 'a@university.edu', employee_id: 'E1',
    department: 'MIS Department', role: 'requester', active: true, ...overrides,
  }
}

// ─── Mapper ───────────────────────────────────────────────────────────────────
describe('users — mapper', () => {
  it('maps employee_id to employeeId and omits auth_user_id', () => {
    const dto = toUserDto(row({ employee_id: 'PU-1' }))
    expect(dto.employeeId).toBe('PU-1')
    expect(dto).not.toHaveProperty('employee_id')
    expect(dto).not.toHaveProperty('auth_user_id')
  })
})

// ─── Schemas ──────────────────────────────────────────────────────────────────
describe('users — create schema', () => {
  it('accepts a valid user', () => {
    expect(userCreateSchema.safeParse({ name: 'X', email: 'x@u.edu', role: 'requester' }).success).toBe(true)
  })

  it('rejects a bad email', () => {
    expect(userCreateSchema.safeParse({ name: 'X', email: 'nope', role: 'requester' }).success).toBe(false)
  })

  it('rejects an unknown role', () => {
    expect(userCreateSchema.safeParse({ name: 'X', email: 'x@u.edu', role: 'reception' }).success).toBe(false)
  })

  it('accepts each of the four roles', () => {
    for (const role of ['requester', 'coordinator_authority', 'admin_dispatcher', 'super_admin']) {
      expect(userCreateSchema.safeParse({ name: 'X', email: 'x@u.edu', role }).success).toBe(true)
    }
  })

  it('active schema requires a boolean', () => {
    expect(activeSchema.safeParse({ active: true }).success).toBe(true)
    expect(activeSchema.safeParse({ active: 'yes' }).success).toBe(false)
  })
})

// ─── Last-super-admin counting ────────────────────────────────────────────────
describe('users — countActiveSuperAdmins', () => {
  const rows: UserRow[] = [
    row({ id: 'u-sup', role: 'super_admin', active: true }),
    row({ id: 'u-sup2', role: 'super_admin', active: false }),
    row({ id: 'u-req', role: 'requester', active: true }),
  ]

  it('counts only active super admins', () => {
    expect(countActiveSuperAdmins(rows)).toBe(1)
  })

  it('excludes a given id (the one being changed)', () => {
    expect(countActiveSuperAdmins(rows, 'u-sup')).toBe(0)
  })

  it('reflects that demoting the only active super admin leaves none', () => {
    // Guard condition: excluding the target leaves zero active super admins.
    expect(countActiveSuperAdmins(rows, 'u-sup') === 0).toBe(true)
  })
})

describe('users — id generator', () => {
  it('produces a u-prefixed id', () => {
    expect(newUserId()).toMatch(/^u-\d{4}$/)
  })
})
