import type { Request, Response, NextFunction } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'
import type { Actor, Role } from '../types.js'

// ─── Authentication middleware ────────────────────────────────────────────────
// Reads the Bearer token, verifies it with Supabase Auth, then resolves it to
// an application user row (the Actor the API trusts). Attaches req.actor.

function bearerToken(req: Request): string | null {
  const h = req.header('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1].trim() : null
}

/** Resolve a verified token to an Actor, or throw HttpError. */
export async function actorFromToken(token: string): Promise<Actor> {
  const supabase = getSupabase()

  // Verify the token with Supabase Auth.
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    throw new HttpError('unauthorized', 'Invalid or expired session.')
  }
  const authUser = data.user

  // Resolve the application user row (by auth_user_id, falling back to email).
  const { data: row, error: rowErr } = await supabase
    .from('users')
    .select('id, name, email, role, active, auth_user_id')
    .or(`auth_user_id.eq.${authUser.id},email.eq.${authUser.email}`)
    .limit(1)
    .maybeSingle()

  if (rowErr) throw new HttpError('internal_error', rowErr.message)
  if (!row) throw new HttpError('forbidden', 'No application account is linked to this login.')
  if (!row.active) throw new HttpError('forbidden', 'This account is inactive.')

  return {
    id:    row.id as string,
    name:  row.name as string,
    role:  row.role as Role,
    email: row.email as string,
  }
}

/** Express middleware: require a valid session; populates req.actor. */
export function requireAuth() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = bearerToken(req)
      if (!token) throw new HttpError('unauthorized', 'Authentication required.')
      req.actor = await actorFromToken(token)
      next()
    } catch (err) {
      next(err)
    }
  }
}

/** Express middleware: require the actor to have one of the given roles. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.actor) return next(new HttpError('unauthorized', 'Authentication required.'))
    if (!roles.includes(req.actor.role)) {
      return next(new HttpError('forbidden', 'You do not have permission to do this.'))
    }
    next()
  }
}
