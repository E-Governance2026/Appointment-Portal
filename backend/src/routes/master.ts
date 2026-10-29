import { Router, type Request, type Response, type NextFunction } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'
import { requireAuth } from '../middleware/auth.js'
import { requireRecentAuth } from '../middleware/recentAuth.js'
import { declarePermission } from '../middleware/permission.js'
import { recordAuditEvent } from '../lib/auditTrail.js'
import {
  toDepartmentDto, toTypeDto, toAuthorityDto,
  departmentCreateSchema, departmentUpdateSchema,
  typeCreateSchema, typeUpdateSchema,
  authorityCreateSchema, authorityUpdateSchema,
  sameName, slugId,
  type DepartmentRow, type TypeRow, type AuthorityRow, type AuthorityTypeRow,
  type AuthorityDto,
} from './masterMapper.js'

// ─── Master data routes (super admin only) ────────────────────────────────────
// GET /master and CRUD for departments / appointment types / authorities.
// Every route requires master.manage permission.
export const masterRouter = Router()

// Terminal statuses do not count as "active" appointments for the delete guard.
const TERMINAL = ['completed', 'cancelled', 'rejected', 'not-reported']

// ── Shared reads ──
async function readDepartments(): Promise<DepartmentRow[]> {
  const { data, error } = await getSupabase().from('departments').select('id, name, code, active').order('name')
  if (error) throw new HttpError('internal_error', error.message)
  return (data ?? []) as DepartmentRow[]
}
async function readTypes(): Promise<TypeRow[]> {
  const { data, error } = await getSupabase().from('appointment_types').select('id, name, description, default_duration_minutes, active').order('name')
  if (error) throw new HttpError('internal_error', error.message)
  return (data ?? []) as TypeRow[]
}
async function readAuthorities(): Promise<AuthorityDto[]> {
  const supabase = getSupabase()
  const [auth, links] = await Promise.all([
    supabase.from('authorities').select('id, name, designation, department, active').order('name'),
    supabase.from('authority_types').select('authority_id, type_id'),
  ])
  if (auth.error) throw new HttpError('internal_error', auth.error.message)
  if (links.error) throw new HttpError('internal_error', links.error.message)
  const byAuthority = new Map<string, string[]>()
  for (const l of (links.data ?? []) as AuthorityTypeRow[]) {
    const list = byAuthority.get(l.authority_id) ?? []
    list.push(l.type_id)
    byAuthority.set(l.authority_id, list)
  }
  return ((auth.data ?? []) as AuthorityRow[]).map(r => toAuthorityDto(r, byAuthority.get(r.id) ?? []))
}

// ── GET /master ──
masterRouter.get(
  '/',
  requireAuth(),
  declarePermission('GET', '/master', 'master.manage'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [departments, types, authorities] = await Promise.all([readDepartments(), readTypes(), readAuthorities()])
      res.json({
        master: {
          departments: departments.map(toDepartmentDto),
          types:       types.map(toTypeDto),
          authorities,
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

// ═══ Departments ═══
masterRouter.post(
  '/departments',
  requireAuth(),
  declarePermission('POST', '/master/departments', 'master.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = departmentCreateSchema.safeParse(req.body)
      if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid department.')
      const input = parsed.data
      const existing = await readDepartments()
      if (existing.some(d => sameName(d.name, input.name))) {
        throw new HttpError('duplicate', 'A department with this name already exists.')
      }
      const row = { id: slugId('dept', input.name), name: input.name, code: input.code, active: input.active }
      const { data, error } = await getSupabase().from('departments').insert(row).select('id, name, code, active').single()
      if (error) throw new HttpError('internal_error', error.message)

      await recordAuditEvent({
        req,
        action: 'department_created',
        entityType: 'department',
        entityId: row.id,
        outcome: 'success',
        after: row as unknown as Record<string, unknown>,
      })

      res.status(201).json({ department: toDepartmentDto(data as DepartmentRow) })
    } catch (err) {
      next(err)
    }
  },
)

masterRouter.put(
  '/departments/:id',
  requireAuth(),
  declarePermission('PUT', '/master/departments/:id', 'master.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = departmentUpdateSchema.safeParse({ ...req.body, id: req.params.id })
      if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid department.')
      const input = parsed.data
      const existing = await readDepartments()
      const current = existing.find(d => d.id === input.id)
      if (!current) throw new HttpError('not_found', 'Department not found.')
      if (existing.some(d => d.id !== input.id && sameName(d.name, input.name))) {
        throw new HttpError('duplicate', 'A department with this name already exists.')
      }
      const supabase = getSupabase()
      const { data, error } = await supabase.from('departments')
        .update({ name: input.name, code: input.code, active: input.active })
        .eq('id', input.id).select('id, name, code, active').single()
      if (error) throw new HttpError('internal_error', error.message)

      await recordAuditEvent({
        req,
        action: 'department_updated',
        entityType: 'department',
        entityId: input.id,
        outcome: 'success',
        before: current as unknown as Record<string, unknown>,
        after: input as unknown as Record<string, unknown>,
      })

      res.json({ department: toDepartmentDto(data as DepartmentRow) })
    } catch (err) {
      next(err)
    }
  },
)

masterRouter.delete(
  '/departments/:id',
  requireAuth(),
  declarePermission('DELETE', '/master/departments/:id', 'master.manage'),
  requireRecentAuth(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const supabase = getSupabase()
      const departments = await readDepartments()
      const dept = departments.find(d => d.id === req.params.id)
      if (!dept) throw new HttpError('not_found', 'Department not found.')
      const used = await supabase.from('authorities').select('id').eq('department', dept.name).limit(1)
      if (used.error) throw new HttpError('internal_error', used.error.message)
      if ((used.data ?? []).length > 0) {
        throw new HttpError('in_use', 'This department is assigned to one or more authorities.')
      }
      const del = await supabase.from('departments').delete().eq('id', dept.id)
      if (del.error) throw new HttpError('internal_error', del.error.message)

      await recordAuditEvent({
        req,
        action: 'department_deleted',
        entityType: 'department',
        entityId: dept.id,
        outcome: 'success',
        before: dept as unknown as Record<string, unknown>,
      })

      res.status(204).end()
    } catch (err) {
      next(err)
    }
  },
)

// ═══ Appointment types ═══
masterRouter.post(
  '/types',
  requireAuth(),
  declarePermission('POST', '/master/types', 'master.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = typeCreateSchema.safeParse(req.body)
      if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid type.')
      const input = parsed.data
      const existing = await readTypes()
      if (existing.some(t => sameName(t.name, input.name))) {
        throw new HttpError('duplicate', 'An appointment type with this name already exists.')
      }
      const row = {
        id: slugId('type', input.name), name: input.name, description: input.description,
        default_duration_minutes: input.defaultDurationMinutes, active: input.active,
      }
      const { data, error } = await getSupabase().from('appointment_types')
        .insert(row).select('id, name, description, default_duration_minutes, active').single()
      if (error) throw new HttpError('internal_error', error.message)

      await recordAuditEvent({
        req,
        action: 'type_created',
        entityType: 'type',
        entityId: row.id,
        outcome: 'success',
        after: row as unknown as Record<string, unknown>,
      })

      res.status(201).json({ type: toTypeDto(data as TypeRow) })
    } catch (err) {
      next(err)
    }
  },
)

masterRouter.put(
  '/types/:id',
  requireAuth(),
  declarePermission('PUT', '/master/types/:id', 'master.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = typeUpdateSchema.safeParse({ ...req.body, id: req.params.id })
      if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid type.')
      const input = parsed.data
      const existing = await readTypes()
      const current = existing.find(t => t.id === input.id)
      if (!current) throw new HttpError('not_found', 'Appointment type not found.')
      if (existing.some(t => t.id !== input.id && sameName(t.name, input.name))) {
        throw new HttpError('duplicate', 'An appointment type with this name already exists.')
      }
      const { data, error } = await getSupabase().from('appointment_types')
        .update({ name: input.name, description: input.description, default_duration_minutes: input.defaultDurationMinutes, active: input.active })
        .eq('id', input.id).select('id, name, description, default_duration_minutes, active').single()
      if (error) throw new HttpError('internal_error', error.message)

      await recordAuditEvent({
        req,
        action: 'type_updated',
        entityType: 'type',
        entityId: input.id,
        outcome: 'success',
        before: current as unknown as Record<string, unknown>,
        after: input as unknown as Record<string, unknown>,
      })

      res.json({ type: toTypeDto(data as TypeRow) })
    } catch (err) {
      next(err)
    }
  },
)

masterRouter.delete(
  '/types/:id',
  requireAuth(),
  declarePermission('DELETE', '/master/types/:id', 'master.manage'),
  requireRecentAuth(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const supabase = getSupabase()
      const types = await readTypes()
      const current = types.find(t => t.id === req.params.id)
      if (!current) throw new HttpError('not_found', 'Appointment type not found.')
      const used = await supabase.from('authority_types').select('authority_id').eq('type_id', req.params.id).limit(1)
      if (used.error) throw new HttpError('internal_error', used.error.message)
      if ((used.data ?? []).length > 0) {
        throw new HttpError('in_use', 'This type is handled by one or more authorities.')
      }
      const del = await supabase.from('appointment_types').delete().eq('id', req.params.id)
      if (del.error) throw new HttpError('internal_error', del.error.message)

      await recordAuditEvent({
        req,
        action: 'type_deleted',
        entityType: 'type',
        entityId: req.params.id,
        outcome: 'success',
        before: current as unknown as Record<string, unknown>,
      })

      res.status(204).end()
    } catch (err) {
      next(err)
    }
  },
)

// ═══ Authorities ═══
async function setAuthorityTypes(authorityId: string, typeIds: string[]): Promise<void> {
  const supabase = getSupabase()
  const del = await supabase.from('authority_types').delete().eq('authority_id', authorityId)
  if (del.error) throw new HttpError('internal_error', del.error.message)
  if (typeIds.length > 0) {
    const ins = await supabase.from('authority_types').insert(typeIds.map(type_id => ({ authority_id: authorityId, type_id })))
    if (ins.error) throw new HttpError('internal_error', ins.error.message)
  }
}

async function assertDepartmentExists(name: string): Promise<void> {
  const { data, error } = await getSupabase().from('departments').select('name').eq('name', name).maybeSingle()
  if (error) throw new HttpError('internal_error', error.message)
  if (!data) throw new HttpError('validation', 'That department does not exist.')
}

masterRouter.post(
  '/authorities',
  requireAuth(),
  declarePermission('POST', '/master/authorities', 'master.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = authorityCreateSchema.safeParse(req.body)
      if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid authority.')
      const input = parsed.data
      const existing = await readAuthorities()
      if (existing.some(a => sameName(a.name, input.name))) {
        throw new HttpError('duplicate', 'An authority with this name already exists.')
      }
      await assertDepartmentExists(input.department)
      const id = slugId('auth', input.name)
      const { data, error } = await getSupabase().from('authorities')
        .insert({ id, name: input.name, designation: input.designation, department: input.department, active: input.active })
        .select('id, name, designation, department, active').single()
      if (error) throw new HttpError('internal_error', error.message)
      await setAuthorityTypes(id, input.typeIds)

      await recordAuditEvent({
        req,
        action: 'authority_created',
        entityType: 'authority',
        entityId: id,
        outcome: 'success',
        after: input as unknown as Record<string, unknown>,
      })

      res.status(201).json({ authority: toAuthorityDto(data as AuthorityRow, input.typeIds) })
    } catch (err) {
      next(err)
    }
  },
)

masterRouter.put(
  '/authorities/:id',
  requireAuth(),
  declarePermission('PUT', '/master/authorities/:id', 'master.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = authorityUpdateSchema.safeParse({ ...req.body, id: req.params.id })
      if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid authority.')
      const input = parsed.data
      const existing = await readAuthorities()
      const current = existing.find(a => a.id === input.id)
      if (!current) throw new HttpError('not_found', 'Authority not found.')
      if (existing.some(a => a.id !== input.id && sameName(a.name, input.name))) {
        throw new HttpError('duplicate', 'An authority with this name already exists.')
      }
      await assertDepartmentExists(input.department)
      const { data, error } = await getSupabase().from('authorities')
        .update({ name: input.name, designation: input.designation, department: input.department, active: input.active })
        .eq('id', input.id).select('id, name, designation, department, active').single()
      if (error) throw new HttpError('internal_error', error.message)
      await setAuthorityTypes(input.id, input.typeIds)

      await recordAuditEvent({
        req,
        action: 'authority_updated',
        entityType: 'authority',
        entityId: input.id,
        outcome: 'success',
        before: current as unknown as Record<string, unknown>,
        after: input as unknown as Record<string, unknown>,
      })

      res.json({ authority: toAuthorityDto(data as AuthorityRow, input.typeIds) })
    } catch (err) {
      next(err)
    }
  },
)

masterRouter.delete(
  '/authorities/:id',
  requireAuth(),
  declarePermission('DELETE', '/master/authorities/:id', 'master.manage'),
  requireRecentAuth(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const supabase = getSupabase()
      const authorities = await readAuthorities()
      const current = authorities.find(a => a.id === req.params.id)
      if (!current) throw new HttpError('not_found', 'Authority not found.')
      const active = await supabase
        .from('appointments')
        .select('id')
        .eq('authority_id', req.params.id)
        .not('status', 'in', `(${TERMINAL.join(',')})`)
        .limit(1)
      if (active.error) throw new HttpError('internal_error', active.error.message)
      if ((active.data ?? []).length > 0) {
        throw new HttpError('in_use', 'This authority has active appointments assigned.')
      }
      const del = await supabase.from('authorities').delete().eq('id', req.params.id)
      if (del.error) throw new HttpError('internal_error', del.error.message)

      await recordAuditEvent({
        req,
        action: 'authority_deleted',
        entityType: 'authority',
        entityId: req.params.id,
        outcome: 'success',
        before: current as unknown as Record<string, unknown>,
      })

      res.status(204).end()
    } catch (err) {
      next(err)
    }
  },
)
