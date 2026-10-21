import { describe, it, expect } from 'vitest'
import {
  toTypeDto, toAuthorityDto,
  departmentCreateSchema, typeCreateSchema, authorityCreateSchema,
  sameName, slugId,
  type TypeRow, type AuthorityRow,
} from '../routes/masterMapper.js'

// ─── Mappers ──────────────────────────────────────────────────────────────────
describe('master — mappers', () => {
  it('maps default_duration_minutes to defaultDurationMinutes', () => {
    const row: TypeRow = { id: 'academic', name: 'Academic', description: 'd', default_duration_minutes: 30, active: true }
    const dto = toTypeDto(row)
    expect(dto.defaultDurationMinutes).toBe(30)
    expect(dto).not.toHaveProperty('default_duration_minutes')
  })

  it('assembles authority typeIds from the join rows', () => {
    const row: AuthorityRow = { id: 'auth-ss', name: 'Shivendra sir', designation: 'x', department: 'Academic Affairs', active: true }
    const dto = toAuthorityDto(row, ['academic', 'research'])
    expect(dto.typeIds).toEqual(['academic', 'research'])
  })
})

// ─── Schemas ──────────────────────────────────────────────────────────────────
describe('master — department schema', () => {
  it('requires name and code', () => {
    expect(departmentCreateSchema.safeParse({ name: 'Finance', code: 'FIN' }).success).toBe(true)
    expect(departmentCreateSchema.safeParse({ name: '', code: 'FIN' }).success).toBe(false)
    expect(departmentCreateSchema.safeParse({ name: 'Finance', code: '' }).success).toBe(false)
  })
})

describe('master — type schema', () => {
  it('requires a positive duration', () => {
    expect(typeCreateSchema.safeParse({ name: 'X', defaultDurationMinutes: 30 }).success).toBe(true)
    expect(typeCreateSchema.safeParse({ name: 'X', defaultDurationMinutes: 0 }).success).toBe(false)
    expect(typeCreateSchema.safeParse({ name: 'X', defaultDurationMinutes: -5 }).success).toBe(false)
  })

  it('requires a name', () => {
    expect(typeCreateSchema.safeParse({ name: '  ', defaultDurationMinutes: 30 }).success).toBe(false)
  })
})

describe('master — authority schema', () => {
  it('requires name and department, defaults typeIds to []', () => {
    const parsed = authorityCreateSchema.safeParse({ name: 'Dr X', department: 'Finance' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.typeIds).toEqual([])
  })

  it('rejects a missing department', () => {
    expect(authorityCreateSchema.safeParse({ name: 'Dr X', department: '' }).success).toBe(false)
  })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────
describe('master — helpers', () => {
  it('sameName is case- and whitespace-insensitive', () => {
    expect(sameName('Finance', '  finance ')).toBe(true)
    expect(sameName('Finance', 'Admissions')).toBe(false)
  })

  it('slugId produces a prefixed, url-safe id', () => {
    const id = slugId('dept', 'Academic Affairs!')
    expect(id.startsWith('dept-academic-affairs')).toBe(true)
    expect(id).toMatch(/^[a-z0-9-]+$/)
  })
})
