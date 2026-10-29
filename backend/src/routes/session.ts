// ─── Session management routes ────────────────────────────────────────────────
// GET  /auth/session                — return remaining idle/absolute seconds (never touches)
// POST /auth/session/touch          — extend the idle timer
// GET  /auth/sessions               — list active sessions for current user
// DELETE /auth/sessions/:sessionId  — revoke a specific session
// POST /auth/sessions/revoke-others — revoke all other sessions for current user
//
// Mounted at /auth/session, /auth/sessions, and /api/auth/session*.

import { Router, type Request, type Response, type NextFunction } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { HttpError } from '../lib/httpError.js'
import {
  getSession, touchSession, getUserSessions,
  destroySession, revokeOtherUserSessions,
  remainingIdleSeconds, remainingAbsoluteSeconds,
} from '../lib/sessionStore.js'
import { getSessionIdFromRequest, clearSessionCookie } from '../lib/sessionCookie.js'
import { env } from '../config/env.js'
import { recordAuditEvent } from '../lib/auditTrail.js'

export const sessionRouter = Router()

function sessionPayload(sessionId: string) {
  const entry = getSession(sessionId)
  if (!entry) throw new HttpError('unauthorized', 'Session not found.')
  return {
    authenticated:            true,
    remainingIdleSeconds:     remainingIdleSeconds(entry),
    remainingAbsoluteSeconds: remainingAbsoluteSeconds(entry),
    idleTimeoutSeconds:       env.sessionIdleTimeoutSeconds,
    warningSeconds:           env.sessionWarnSeconds,
    serverTime:               new Date().toISOString(),
  }
}

// GET /auth/session — read only, never extends the session.
sessionRouter.get('/', requireAuth(), (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.sessionId ?? getSessionIdFromRequest(req)
    if (!sessionId) throw new HttpError('unauthorized', 'Authentication required.')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Pragma',        'no-cache')
    res.json(sessionPayload(sessionId))
  } catch (err) {
    next(err)
  }
})

// POST /auth/session/touch — extend the idle timer.
sessionRouter.post('/touch', requireAuth(), (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.sessionId ?? getSessionIdFromRequest(req)
    if (!sessionId) throw new HttpError('unauthorized', 'Authentication required.')
    touchSession(sessionId)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Pragma',        'no-cache')
    res.json(sessionPayload(sessionId))
  } catch (err) {
    next(err)
  }
})

// GET /auth/sessions — list user's active sessions (device, approximate time, current marker, masked IP)
sessionRouter.get('/all', requireAuth(), (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!
    const currentSessionId = req.sessionId ?? getSessionIdFromRequest(req) ?? undefined
    const sessions = getUserSessions(actor.id, currentSessionId)
    res.setHeader('Cache-Control', 'no-store')
    res.json({ sessions })
  } catch (err) {
    next(err)
  }
})

// DELETE /auth/sessions/:sessionId — revoke a specific session
sessionRouter.delete('/:sessionId', requireAuth(), (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!
    const targetSessionId = req.params.sessionId
    const currentSessionId = req.sessionId ?? getSessionIdFromRequest(req)

    const session = getSession(targetSessionId)
    if (!session || session.userId !== actor.id) {
      throw new HttpError('not_found', 'Session not found or does not belong to you.')
    }

    destroySession(targetSessionId)

    recordAuditEvent({
      req,
      action: 'session_revoked',
      entityType: 'session',
      entityId: targetSessionId,
      outcome: 'success',
    }).catch(() => {})

    // If revoking current session, clear cookie
    if (targetSessionId === currentSessionId) {
      clearSessionCookie(res)
    }

    res.setHeader('Cache-Control', 'no-store')
    res.json({ success: true, message: 'Session revoked.' })
  } catch (err) {
    next(err)
  }
})

// POST /auth/sessions/revoke-others — revoke all other sessions
sessionRouter.post('/revoke-others', requireAuth(), (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!
    const currentSessionId = req.sessionId ?? getSessionIdFromRequest(req) ?? ''
    const count = revokeOtherUserSessions(actor.id, currentSessionId)

    recordAuditEvent({
      req,
      action: 'other_sessions_revoked',
      entityType: 'session',
      entityId: actor.id,
      outcome: 'success',
      after: { revokedCount: count },
    }).catch(() => {})

    res.setHeader('Cache-Control', 'no-store')
    res.json({
      success: true,
      message: 'All other sessions have been signed out.',
      revokedCount: count,
    })
  } catch (err) {
    next(err)
  }
})
