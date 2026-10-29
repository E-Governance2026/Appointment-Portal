// ─── Session middleware ───────────────────────────────────────────────────────
// Enforces:
// 1. CACHE-CONTROL: no-store, Pragma: no-cache
// 2. CSRF PROTECTION:
//    - Origin / Referer verification against ALLOWED_ORIGINS
//    - Constant-time comparison of X-CSRF-Token against session-bound CSRF token
// 3. IDLE AND ABSOLUTE TIMEOUTS:
//    - Checks now - lastActivityAt > sessionIdleTimeoutSeconds (session_idle_timeout)
//    - Checks now > absoluteExpiresAt (session_absolute_timeout)
//    - State-changing requests without X-Passive-Request touch the session
//    - GET requests and requests with X-Passive-Request NEVER touch the session

import { timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import {
  getSession, touchSession, destroySession,
  checkExpiry,
} from '../lib/sessionStore.js'
import { getSessionIdFromRequest, clearSessionCookie } from '../lib/sessionCookie.js'
import { env } from '../config/env.js'

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const PASSIVE_HEADER = 'x-passive-request'

/** Compare two strings in constant time. */
export function constantTimeEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Verify request Origin or Referer against allowed origins list. */
export function verifyOrigin(req: Request): boolean {
  const origin = req.header('origin')
  const referer = req.header('referer')
  let check: string | null = null

  if (origin) {
    check = origin
  } else if (referer) {
    try {
      check = new URL(referer).origin
    } catch {
      return false
    }
  }

  // If origin/referer is present, it must be in the allowlist
  if (check) {
    return env.allowedOrigins.includes(check)
  }

  // In production, reject state-changing requests missing both Origin and Referer
  if (env.nodeEnv === 'production') {
    return false
  }

  return true
}

/** Applied on authenticated routes to enforce timeouts, CSRF, and cache headers. */
export function sessionMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // ── 1. Cache-Control: no-store on all authenticated responses ─────────────
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Pragma',        'no-cache')

    const sessionId = getSessionIdFromRequest(req)
    if (!sessionId) {
      // No session credential found — defer to requireAuth for 401
      return next()
    }

    req.sessionId = sessionId
    const session = getSession(sessionId)
    if (!session) {
      return next()
    }

    req.session = session

    // ── 2. CSRF Origin check on state-changing requests ───────────────────────
    if (STATE_CHANGING.has(req.method)) {
      if (!verifyOrigin(req)) {
        return res.status(403).json({
          error: {
            code:    'csrf_failed',
            message: 'Cross-origin request blocked.',
          },
        })
      }

      // ── 3. CSRF Token check on authenticated state-changing requests ─────────
      // If a session exists, require X-CSRF-Token matching the session's token
      const clientCsrf = req.header('x-csrf-token')
      if (!constantTimeEqual(clientCsrf, session.csrfToken)) {
        return res.status(403).json({
          error: {
            code:    'csrf_failed',
            message: 'CSRF token missing or invalid.',
          },
        })
      }
    }

    // ── 4. Server-enforced idle & absolute timeout ────────────────────────────
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

    // ── 5. Idle timer extension ───────────────────────────────────────────────
    // State-changing requests without X-Passive-Request touch the session.
    // GET requests and requests with X-Passive-Request NEVER touch it.
    const isPassive = req.header(PASSIVE_HEADER) === 'true'
    if (STATE_CHANGING.has(req.method) && !isPassive) {
      touchSession(sessionId)
    }

    next()
  }
}

