// ─── User mapper ──────────────────────────────────────────────────────────────
// ManagedUser DTO + row mapper + validation for the super-admin user-management
// surface. Mirrors src/data/userData.ts. The DB row carries auth_user_id and
// snake_case employee_id; the contract uses employeeId and omits auth_user_id.

import { z } from 'zod'
import { ROLES } from '../domain/permissions.js'
import type { Role } from '../types.js'

export interface ManagedUserDto {
  id:         string
  name:       string
  email:      string
  employeeId: string
  department: string
  role:       Role
  active:     boolean
}

export interface UserRow {
  id:          string
  name:        string
  email:       string
  employee_id: string
  department:  string
  role:        Role
  active:      boolean
}

export function toUserDto(r: UserRow): ManagedUserDto {
  return {
    id:         r.id,
    name:       r.name,
    email:      r.email,
    employeeId: r.employee_id,
    department: r.department,
    role:       r.role,
    active:     r.active,
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────
const roleEnum = z.enum(ROLES as [Role, ...Role[]])

export const userCreateSchema = z.object({
  name:       z.string().trim().min(1, 'Name is required.'),
  email:      z.string().trim().email('A valid email is required.'),
  employeeId: z.string().trim().optional().default(''),
  department: z.string().trim().optional().default(''),
  role:       roleEnum,
  active:     z.boolean().optional().default(true),
}).strict()

export const userUpdateSchema = z.object({
  id:         z.string().min(1),
  name:       z.string().trim().min(1, 'Name is required.'),
  email:      z.string().trim().email('A valid email is required.'),
  employeeId: z.string().trim().optional().default(''),
  department: z.string().trim().optional().default(''),
  role:       roleEnum,
  active:     z.boolean().optional().default(true),
}).strict()

export const activeSchema = z.object({
  active: z.boolean(),
}).strict()

// Count active super admins among the given rows, optionally excluding one id.
// Used by the last-super-admin guards.
export function countActiveSuperAdmins(rows: UserRow[], excludeId?: string): number {
  return rows.filter(u => u.role === 'super_admin' && u.active && u.id !== excludeId).length
}

// A text id for a new user row (e.g. 'u-3821').
export function newUserId(): string {
  return `u-${Math.floor(1000 + Math.random() * 9000)}`
}
