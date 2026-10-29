import type { Request, Response, NextFunction } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'
import { getSession, destroySession, checkExpiry, upsertSession } from '../lib/sessionStore.js'
import { getSessionIdFromRequest, clearSessionCookie, parseCookies, getSessionCookieName } from '../lib/sessionCookie.js'

import { USERS } from '../seed/seedData.js'
import { findUserById } from '../lib/credentialStore.js'
import { isSupabaseConfigured } from '../config/env.js'
import { sanitizePostgrestFilter } from '../lib/sanitizer.js'
import type { Actor, Role } from '../types.js'

// ─── Authentication middleware ────────────────────────────────────────────────
// Reads the session cookie (or Bearer fallback), checks the server session store,
// and resolves it to an application user row (the Actor). Attaches req.actor.

/** Resolve a user ID to an application Actor. */
export async function actorFromUserId(userId: string): Promise<Actor> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabase()
      const { data: row, error: rowErr } = await supabase
        .from('users')
        .select('id, name, email, role, active, department')
        .eq('id', userId)
        .limit(1)
        .maybeSingle()

      if (!rowErr && row) {
        if (!row.active) throw new HttpError('forbidden', 'This account is inactive.')
        return {
          id:         row.id as string,
          name:       row.name as string,
          role:       row.role as Role,
          email:      row.email as string,
          department: row.department as string | undefined,
        }
      }
    } catch (e) {
      if (e instanceof HttpError) throw e
      // Fall through to seed/demo data if Supabase unreachable
    }
  }

  // Fallback: check seed and dynamically registered users (for offline dev/test modes)
  const appUser = findUserById(userId)
  if (appUser) {
    if (!appUser.active) throw new HttpError('forbidden', 'This account is inactive.')
    return {
      id:         appUser.id,
      name:       appUser.name,
      role:       appUser.role as Role,
      email:      appUser.email,
      department: appUser.department,
    }
  }

  throw new HttpError('forbidden', 'No application account is linked to this login.')
}

/** Legacy helper: resolve a verified Supabase JWT token to an Actor. */
export async function actorFromToken(token: string): Promise<Actor> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabase()
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) {
      throw new HttpError('unauthorized', 'Invalid or expired session.')
    }
    const authUser = data.user

    const safeAuthUserId = sanitizePostgrestFilter(authUser.id)
    const safeEmail = sanitizePostgrestFilter(authUser.email ?? '')
    const { data: row, error: rowErr } = await supabase
      .from('users')
      .select('id, name, email, role, active, auth_user_id, department')
      .or(`auth_user_id.eq.${safeAuthUserId},email.eq.${safeEmail}`)
      .limit(1)
      .maybeSingle()

    if (rowErr) throw new HttpError('internal_error', rowErr.message)
    if (!row) throw new HttpError('forbidden', 'No application account is linked to this login.')
    if (!row.active) throw new HttpError('forbidden', 'This account is inactive.')

    return {
      id:         row.id as string,
      name:       row.name as string,
      role:       row.role as Role,
      email:      row.email as string,
      department: row.department as string | undefined,
    }
  }

  // Test / dev fallback
  const user = USERS.find(u => u.id === token || u.email === token) ?? USERS[0]
  return {
    id:         user.id,
    name:       user.name,
    role:       user.role as Role,
    email:      user.email,
    department: user.department,
  }
}

/** Express middleware: require a valid session; populates req.actor. */
export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check for malformed authorization header before checking session
      const authHeader = req.header('authorization')
      if (authHeader && !/^Bearer\s+/i.test(authHeader)) {
        throw new HttpError('unauthorized', 'Authentication required.')
      }

      const sessionId = getSessionIdFromRequest(req)
      if (!sessionId) {
        throw new HttpError('unauthorized', 'Authentication required.')
      }

      const cookies = parseCookies(req.headers.cookie)
      const hasCookie = Boolean(cookies[getSessionCookieName()] || cookies['sid'] || cookies['__Host-sid'])

      req.sessionId = sessionId
      let session = getSession(sessionId)

      if (session) {

        // Enforce expiry
        const status = checkExpiry(session)
        if (status !== 'ok') {
          destroySession(sessionId)
          clearSessionCookie(res)
          return res.status(401).json({
            error: {
              code:    'session_expired',
              reason:  status === 'absolute' ? 'session_absolute_timeout' : 'session_idle_timeout',
              message: 'Your session has expired.',
            },
          })
        }
        req.session = session
        req.actor = await actorFromUserId(session.userId)
        return next()
      }

      // A session cookie was provided but it does not exist in the store (destroyed or invalid)
      if (hasCookie) {
        throw new HttpError('unauthorized', 'Invalid or expired session.')
      }

      // If Authorization: Bearer <token> was used, try legacy token verification for tests
      if (authHeader && isSupabaseConfigured()) {
        try {
          const actor = await actorFromToken(sessionId)
          session = upsertSession(sessionId, actor.id)
          req.session = session
          req.actor = actor
          return next()
        } catch {
          throw new HttpError('unauthorized', 'Invalid or expired session.')
        }
      }

      throw new HttpError('unauthorized', 'Authentication required.')

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

