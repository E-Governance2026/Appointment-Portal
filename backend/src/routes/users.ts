import { Router, type Request, type Response, type NextFunction } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'
import { requireAuth } from '../middleware/auth.js'
import { requireRecentAuth } from '../middleware/recentAuth.js'
import { declarePermission } from '../middleware/permission.js'
import { isSupabaseConfigured } from '../config/env.js'
import { USERS } from '../seed/seedData.js'
import {
  toUserDto, userCreateSchema, userUpdateSchema, activeSchema,
  countActiveSuperAdmins, newUserId,
  type UserRow,
} from './userMapper.js'
import { generateTemporaryPassword, hashPassword } from '../lib/password.js'
import { setCredential, unlockAccount, resetUserMfa, registerUser } from '../lib/credentialStore.js'
import { destroyUserSessions } from '../lib/sessionStore.js'
import { recordAuditEvent } from '../lib/auditTrail.js'

// ─── User management routes (super admin only) ────────────────────────────────
export const usersRouter = Router()

const USER_COLUMNS = 'id, name, email, employee_id, department, role, active'

// Mutable mock memory users for offline/test environments
const memoryUsers: UserRow[] = [...(USERS as unknown as UserRow[])]

async function readUsers(): Promise<UserRow[]> {
  if (!isSupabaseConfigured()) {
    return memoryUsers
  }
  const { data, error } = await getSupabase().from('users').select(USER_COLUMNS).order('name')
  if (error) throw new HttpError('internal_error', error.message)
  return (data ?? []) as UserRow[]
}

// GET /users
usersRouter.get(
  '/',
  requireAuth(),
  declarePermission('GET', '/users', 'user.manage'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await readUsers()
      res.json({ users: rows.map(toUserDto) })
    } catch (err) {
      next(err)
    }
  },
)

// POST /users — create user
usersRouter.post(
  '/',
  requireAuth(),
  declarePermission('POST', '/users', 'user.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = userCreateSchema.safeParse(req.body)
      if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid user.')
      const input = parsed.data

      const rows = await readUsers()
      if (rows.some(u => u.email.trim().toLowerCase() === input.email.toLowerCase())) {
        throw new HttpError('duplicate', 'A user with this email already exists.')
      }

      const row: UserRow = {
        id: newUserId(), name: input.name, email: input.email, employee_id: input.employeeId,
        department: input.department, role: input.role, active: input.active,
      }

      // Register user in credential store
      registerUser(row)

      // Generate one-time temporary password (valid 24h)
      const temporaryPassword = generateTemporaryPassword()
      const passwordHash = await hashPassword(temporaryPassword)

      setCredential(row.id, {
        userId: row.id,
        passwordHash,
        mustChangePassword: true,
        temporaryExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
      })

      await recordAuditEvent({
        req,
        action: 'user_created',
        entityType: 'user',
        entityId: row.id,
        outcome: 'success',
        after: { name: row.name, email: row.email, role: row.role, active: row.active },
      })

      if (!isSupabaseConfigured()) {
        memoryUsers.push(row)
        return res.status(201).json({
          user: toUserDto(row),
          temporaryPassword,
          message: 'User created successfully. Provide the temporary password to the user.',
        })
      }

      const { data, error } = await getSupabase().from('users').insert(row).select(USER_COLUMNS).single()
      if (error) throw new HttpError('internal_error', error.message)

      res.status(201).json({
        user: toUserDto(data as UserRow),
        temporaryPassword,
        message: 'User created successfully. Provide the temporary password to the user.',
      })
    } catch (err) {
      next(err)
    }
  },
)

// PUT /users/:id — update user
usersRouter.put(
  '/:id',
  requireAuth(),
  declarePermission('PUT', '/users/:id', 'user.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = userUpdateSchema.safeParse({ ...req.body, id: req.params.id })
      if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid user.')
      const input = parsed.data

      const rows = await readUsers()
      const current = rows.find(u => u.id === input.id)
      if (!current) throw new HttpError('not_found', 'User not found.')

      // SENSITIVE ACTION CHECK: changing role requires recent authentication
      if (input.role !== current.role) {
        await new Promise<void>((resolve, reject) => {
          requireRecentAuth()(req, res, err => {
            if (err) return reject(err)
            resolve()
          })
        })
      }

      if (rows.some(u => u.id !== input.id && u.email.trim().toLowerCase() === input.email.toLowerCase())) {
        throw new HttpError('duplicate', 'A user with this email already exists.')
      }

      // Do not strip role or deactivate last active super admin
      const losesLastSuperAdmin =
        current.role === 'super_admin' && current.active &&
        (input.role !== 'super_admin' || !input.active) &&
        countActiveSuperAdmins(rows, input.id) === 0
      if (losesLastSuperAdmin) {
        throw new HttpError('in_use', 'At least one active super admin is required.')
      }

      // If role changed, invalidate user's existing sessions
      if (input.role !== current.role) {
        destroyUserSessions(input.id)
        await recordAuditEvent({
          req,
          action: 'user_role_changed',
          entityType: 'user',
          entityId: input.id,
          outcome: 'success',
          before: { role: current.role },
          after: { role: input.role },
        })
      }

      await recordAuditEvent({
        req,
        action: 'user_updated',
        entityType: 'user',
        entityId: input.id,
        outcome: 'success',
        before: current as unknown as Record<string, unknown>,
        after: input as unknown as Record<string, unknown>,
      })

      if (!isSupabaseConfigured()) {
        Object.assign(current, {
          name: input.name, email: input.email, employee_id: input.employeeId,
          department: input.department, role: input.role, active: input.active,
        })
        return res.json({ user: toUserDto(current) })
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
  },
)

// PATCH /users/:id/active — activate / deactivate
usersRouter.patch(
  '/:id/active',
  requireAuth(),
  declarePermission('PATCH', '/users/:id/active', 'user.manage'),
  requireRecentAuth(),
  async (req: Request, res: Response, next: NextFunction) => {
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

      // When deactivating, destroy all active sessions
      if (!active) {
        destroyUserSessions(id)
      }

      await recordAuditEvent({
        req,
        action: active ? 'user_activated' : 'user_deactivated',
        entityType: 'user',
        entityId: id,
        outcome: 'success',
        before: { active: user.active },
        after: { active },
      })

      if (!isSupabaseConfigured()) {
        user.active = active
        return res.json({ user: toUserDto(user) })
      }

      const { data, error } = await getSupabase().from('users')
        .update({ active }).eq('id', id).select(USER_COLUMNS).single()
      if (error) throw new HttpError('internal_error', error.message)
      res.json({ user: toUserDto(data as UserRow) })
    } catch (err) {
      next(err)
    }
  },
)

// POST /users/:id/reset-password — super admin resets user's password
usersRouter.post(
  '/:id/reset-password',
  requireAuth(),
  declarePermission('POST', '/users/:id/reset-password', 'user.manage'),
  requireRecentAuth(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id
      const rows = await readUsers()
      const user = rows.find(u => u.id === id)
      if (!user) throw new HttpError('not_found', 'User not found.')

      const temporaryPassword = generateTemporaryPassword()
      const passwordHash = await hashPassword(temporaryPassword)

      setCredential(id, {
        userId: id,
        passwordHash,
        mustChangePassword: true,
        temporaryExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
        failedAttempts: 0,
        lockedUntil: null,
      })

      // Invalidate all existing sessions of this user
      destroyUserSessions(id)

      await recordAuditEvent({
        req,
        action: 'user_password_reset_by_admin',
        entityType: 'user',
        entityId: id,
        outcome: 'success',
      })

      res.json({
        success: true,
        temporaryPassword,
        message: 'Password reset successfully. The user must change this password on their next sign-in.',
      })
    } catch (err) {
      next(err)
    }
  },
)

// POST /users/:id/unlock — super admin unlocks account
usersRouter.post(
  '/:id/unlock',
  requireAuth(),
  declarePermission('POST', '/users/:id/unlock', 'user.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!
      const id = req.params.id
      const rows = await readUsers()
      const user = rows.find(u => u.id === id)
      if (!user) throw new HttpError('not_found', 'User not found.')

      unlockAccount(id, actor.id, actor.role)

      await recordAuditEvent({
        req,
        action: 'account_unlocked',
        entityType: 'user',
        entityId: id,
        outcome: 'success',
      })

      res.json({
        success: true,
        message: 'Account has been unlocked successfully.',
      })
    } catch (err) {
      next(err)
    }
  },
)

// POST /users/:id/reset-mfa — super admin resets user MFA
usersRouter.post(
  '/:id/reset-mfa',
  requireAuth(),
  declarePermission('POST', '/users/:id/reset-mfa', 'user.manage'),
  requireRecentAuth(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!
      const id = req.params.id
      const rows = await readUsers()
      const user = rows.find(u => u.id === id)
      if (!user) throw new HttpError('not_found', 'User not found.')

      resetUserMfa(id, actor.id, actor.role)

      await recordAuditEvent({
        req,
        action: 'user_mfa_reset_by_admin',
        entityType: 'user',
        entityId: id,
        outcome: 'success',
      })

      res.json({
        success: true,
        message: 'User multi-factor authentication has been reset.',
      })
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /users/:id/sessions — super admin ends all sessions for a user
usersRouter.delete(
  '/:id/sessions',
  requireAuth(),
  declarePermission('DELETE', '/users/:id/sessions', 'user.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id
      destroyUserSessions(id)

      await recordAuditEvent({
        req,
        action: 'user_sessions_terminated',
        entityType: 'user',
        entityId: id,
        outcome: 'success',
      })

      res.json({
        success: true,
        message: 'All sessions for this user have been terminated.',
      })
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /users/:id — delete user
usersRouter.delete(
  '/:id',
  requireAuth(),
  declarePermission('DELETE', '/users/:id', 'user.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
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

      destroyUserSessions(id)

      await recordAuditEvent({
        req,
        action: 'user_deleted',
        entityType: 'user',
        entityId: id,
        outcome: 'success',
        before: user as unknown as Record<string, unknown>,
      })

      if (!isSupabaseConfigured()) {
        const idx = memoryUsers.findIndex(u => u.id === id)
        if (idx !== -1) memoryUsers.splice(idx, 1)
        return res.status(204).end()
      }

      const del = await getSupabase().from('users').delete().eq('id', id)
      if (del.error) throw new HttpError('internal_error', del.error.message)
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  },
)
