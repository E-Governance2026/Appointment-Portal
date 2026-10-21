// ─── Master data mapper ───────────────────────────────────────────────────────
// DTOs + row mappers + validation for departments, appointment types and
// authorities. Mirrors src/data/masterData.ts. DB uses snake_case
// (default_duration_minutes) and a join table (authority_types); the contract
// uses camelCase (defaultDurationMinutes) and an inline typeIds array.

import { z } from 'zod'

// ─── DTOs (the frontend contract) ─────────────────────────────────────────────
export interface DepartmentDto {
  id:     string
  name:   string
  code:   string
  active: boolean
}
export interface AppointmentTypeDto {
  id:          string
  name:        string
  description: string
  defaultDurationMinutes: number
  active:      boolean
}
export interface AuthorityDto {
  id:          string
  name:        string
  designation: string
  department:  string
  typeIds:     string[]
  active:      boolean
}
export interface MasterDataDto {
  departments: DepartmentDto[]
  types:       AppointmentTypeDto[]
  authorities: AuthorityDto[]
}

// ─── DB row shapes ────────────────────────────────────────────────────────────
export interface DepartmentRow { id: string; name: string; code: string; active: boolean }
export interface TypeRow { id: string; name: string; description: string; default_duration_minutes: number; active: boolean }
export interface AuthorityRow { id: string; name: string; designation: string; department: string; active: boolean }
export interface AuthorityTypeRow { authority_id: string; type_id: string }

// ─── Mappers ──────────────────────────────────────────────────────────────────
export function toDepartmentDto(r: DepartmentRow): DepartmentDto {
  return { id: r.id, name: r.name, code: r.code, active: r.active }
}

export function toTypeDto(r: TypeRow): AppointmentTypeDto {
  return {
    id: r.id, name: r.name, description: r.description,
    defaultDurationMinutes: r.default_duration_minutes, active: r.active,
  }
}

// typeIds is assembled from the authority_types join rows for this authority.
export function toAuthorityDto(r: AuthorityRow, typeIds: string[]): AuthorityDto {
  return {
    id: r.id, name: r.name, designation: r.designation,
    department: r.department, typeIds, active: r.active,
  }
}

// ─── Validation schemas ───────────────────────────────────────────────────────
export const departmentCreateSchema = z.object({
  name:   z.string().trim().min(1, 'Department name is required.'),
  code:   z.string().trim().min(1, 'Department code is required.'),
  active: z.boolean().optional().default(true),
})
export const departmentUpdateSchema = departmentCreateSchema.extend({
  id: z.string().min(1),
})

export const typeCreateSchema = z.object({
  name:        z.string().trim().min(1, 'Type name is required.'),
  description: z.string().trim().optional().default(''),
  defaultDurationMinutes: z.number().int().positive('Duration must be greater than zero.'),
  active:      z.boolean().optional().default(true),
})
export const typeUpdateSchema = typeCreateSchema.extend({
  id: z.string().min(1),
})

export const authorityCreateSchema = z.object({
  name:        z.string().trim().min(1, 'Authority name is required.'),
  designation: z.string().trim().optional().default(''),
  department:  z.string().trim().min(1, 'Department is required.'),
  typeIds:     z.array(z.string()).optional().default([]),
  active:      z.boolean().optional().default(true),
})
export const authorityUpdateSchema = authorityCreateSchema.extend({
  id: z.string().min(1),
})

// Case-insensitive trimmed equality for uniqueness checks (mirrors sameName).
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

// A url-safe slug used when generating ids for new master rows.
export function slugId(prefix: string, name: string): string {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `${prefix}-${slug || 'item'}-${rand}`
}
