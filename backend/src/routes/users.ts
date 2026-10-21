import { Router, type Request, type Response, type NextFunction } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  toUserDto, userCreateSchema, userUpdateSchema, activeSchema,
  countActiveSuperAdmins, newUserId,
  type UserRow,
} from './userMapper.js'

// ─── User management routes (super admin only) ────────────────────────────────
// GET /users and create/update/activate/delete. Mirrors the user.* functions in
// the mock service, including the "at least one active super admin" guards and
// the "cannot act on your own account" guards.
//
// NOTE: these manage the application `users` table only — the API's source of
// truth for identity and role. A new user does NOT get a Supabase Auth login
// here; linking an auth account (createAuthUsers-style) is a separate step, so
// a freshly created user cannot sign in until that link exists.
export const usersRouter = Router()
usersRouter.use(requireAuth(), requireRole('super_admin'))

const USER_COLUMNS = 'id, name, email, employee_id, department, role, active'

async function readUsers(): Promise<UserRow[]> {
  const { data, error } = await getSupabase().from('users').select(USER_COLUMNS).order('name')
  if (error) throw new HttpError('internal_error', error.message)
  return (data ?? []) as UserRow[]
}

// GET /users
usersRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await readUsers()
    res.json({ users: rows.map(toUserDto) })
  } catch (err) {
    next(err)
  }
})

// POST /users — create. Unique email (case-insensitive via citext column).
usersRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = userCreateSchema.safeParse(req.body)
    if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid user.')
    const input = parsed.data

    const rows = await readUsers()
    if (rows.some(u => u.email.trim().toLowerCase() === input.email.toLowerCase())) {
      throw new HttpError('duplicate', 'A user with this email already exists.')
    }

    const row = {
      id: newUserId(), name: input.name, email: input.email, employee_id: input.employeeId,
      department: input.department, role: input.role, active: input.active,
    }
    const { data, error } = await getSupabase().from('users').insert(row).select(USER_COLUMNS).single()
    if (error) throw new HttpError('internal_error', error.message)
    res.status(201).json({ user: toUserDto(data as UserRow) })
  } catch (err) {
    next(err)
  }
})

// PUT /users/:id — update, with the last-super-admin guard.
usersRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = userUpdateSchema.safeParse({ ...req.body, id: req.params.id })
    if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid user.')
    const input = parsed.data

    const rows = await readUsers()
    const current = rows.find(u => u.id === input.id)
    if (!current) throw new HttpError('not_found', 'User not found.')
    if (rows.some(u => u.id !== input.id && u.email.trim().toLowerCase() === input.email.toLowerCase())) {
      throw new HttpError('duplicate', 'A user with this email already exists.')
    }

    // Do not strip the role or deactivate the last active super admin.
    const losesLastSuperAdmin =
      current.role === 'super_admin' && current.active &&
      (input.role !== 'super_admin' || !input.active) &&
      countActiveSuperAdmins(rows, input.id) === 0
    if (losesLastSuperAdmin) {
      throw new HttpError('in_use', 'At least one active super admin is required.')
    }

    const { data, error } = await getSupabase().from('users')
      .update({
        name: input.name, email: input.email, employee_id: input.employeeId,
        department: input.department, role: input.role, active: input.active,
      })
      .eq('id', input.id).select(USER_COLUMNS).single()
    if (error) throw new HttpError('internal_error', error.message)
    res.json({ user: toUserDto(data as UserRow) })
  } catch (err) {
    next(err)
  }
})

// PATCH /users/:id/active — activate / deactivate.
usersRouter.patch('/:id/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!
    const parsed = activeSchema.safeParse(req.body)
    if (!parsed.success) throw new HttpError('validation', 'Provide active as a boolean.')
    const { active } = parsed.data
    const id = req.params.id

    const rows = await readUsers()
    const user = rows.find(u => u.id === id)
    if (!user) throw new HttpError('not_found', 'User not found.')
    if (!active && id === actor.id) {
      throw new HttpError('in_use', 'You cannot deactivate your own account.')
    }
    if (!active && user.role === 'super_admin' && countActiveSuperAdmins(rows, id) === 0) {
      throw new HttpError('in_use', 'At least one active super admin is required.')
    }

    const { data, error } = await getSupabase().from('users')
      .update({ active }).eq('id', id).select(USER_COLUMNS).single()
    if (error) throw new HttpError('internal_error', error.message)
    res.json({ user: toUserDto(data as UserRow) })
  } catch (err) {
    next(err)
  }
})

// DELETE /users/:id
usersRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!
    const id = req.params.id
    const rows = await readUsers()
    const user = rows.find(u => u.id === id)
    if (!user) throw new HttpError('not_found', 'User not found.')
    if (id === actor.id) {
      throw new HttpError('in_use', 'You cannot delete your own account.')
    }
    if (user.role === 'super_admin' && user.active && countActiveSuperAdmins(rows, id) === 0) {
      throw new HttpError('in_use', 'At least one active super admin is required.')
    }
    const del = await getSupabase().from('users').delete().eq('id', id)
    if (del.error) throw new HttpError('internal_error', del.error.message)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
