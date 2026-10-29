// ─── Recent Authentication & Sensitive Action Protection Middleware ─────────
// Requires authentication within the last 5 minutes (300s) for sensitive actions:
// - Changing roles
// - Activating or deactivating users
// - Resetting passwords or MFA
// - Deleting master data
// - Exporting reports
// - Changing integration settings
//
// Also guards against sessions with mustChangePassword=true or mfaPending=true.

import type { Request, Response, NextFunction } from 'express'
import { HttpError } from '../lib/httpError.js'
import { updateSessionAuthTime, getSession } from '../lib/sessionStore.js'
import { getSessionIdFromRequest } from '../lib/sessionCookie.js'
import { getCredential } from '../lib/credentialStore.js'
import { verifyPassword } from '../lib/password.js'
import { verifyTotpCode, decryptAtRest } from '../lib/mfa.js'

export const RECENT_AUTH_MAX_AGE_SECONDS = 300 // 5 minutes

/**
 * Middleware requiring re-authentication within the last 5 minutes.
 * If authentication is stale, checks for inline headers (x-recent-auth-password
 * or x-recent-auth-totp) or returns 403 recent_auth_required.
 */
export function requireRecentAuth(maxAgeSeconds = RECENT_AUTH_MAX_AGE_SECONDS) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = req.session
      if (!session) {
        throw new HttpError('unauthorized', 'Authentication required.')
      }

      const now = Date.now()
      const isFresh = session.lastAuthAt && (now - session.lastAuthAt <= maxAgeSeconds * 1000)

      if (isFresh) {
        return next()
      }

      // Check for inline re-auth proof
      const inlinePass = req.header('x-recent-auth-password') || (req.body && req.body._recentAuthPassword)
      const inlineTotp = req.header('x-recent-auth-totp') || (req.body && req.body._recentAuthTotp)

      if (inlinePass || inlineTotp) {
        const cred = getCredential(session.userId)
        if (cred) {
          let verified = false
          if (inlinePass) {
            const v = await verifyPassword(cred.passwordHash, inlinePass)
            if (v.valid) verified = true
          }
          if (!verified && inlineTotp && cred.totpSecretEncrypted) {
            const secret = decryptAtRest(cred.totpSecretEncrypted)
            const t = verifyTotpCode(secret, inlineTotp, cred.lastUsedTotpStep)
            if (t.valid) {
              cred.lastUsedTotpStep = t.currentStep
              verified = true
            }
          }

          if (verified) {
            updateSessionAuthTime(session.sessionId)
            session.lastAuthAt = Date.now()
            return next()
          }
        }
      }

      // Return structured 403 requiring recent auth dialog
      return res.status(403).json({
        error: {
          code: 'recent_auth_required',
          message: 'This sensitive action requires recent authentication within the last 5 minutes.',
          maxAgeSeconds,
        },
      })
    } catch (err) {
      next(err)
    }
  }
}

/**
 * Middleware ensuring:
 * 1. Sessions in pending MFA state cannot call non-MFA endpoints.
 * 2. Sessions requiring password change cannot call arbitrary endpoints.
 */
export function sessionSecurityPolicyGuard(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.sessionId ?? getSessionIdFromRequest(req)
  const session = req.session ?? (sessionId ? getSession(sessionId) : null)
  if (!session) return next()

  const path = req.path.toLowerCase()

  // 1. Pending MFA state check
  if (session.mfaPending) {
    const isMfaAllowed =
      path.includes('/mfa/verify') ||
      path.includes('/mfa/recovery-code') ||
      path.includes('/logout')

    if (!isMfaAllowed) {
      return res.status(403).json({
        error: {
          code: 'mfa_required',
          message: 'Multi-factor authentication code required before accessing this endpoint.',
        },
      })
    }
  }

  // 2. Forced password change check
  if (session.mustChangePassword) {
    const isChangePassAllowed =
      path.includes('/change-password') ||
      path.includes('/logout')

    if (!isChangePassAllowed) {
      return res.status(403).json({
        error: {
          code: 'password_change_required',
          message: 'You must change your temporary password before proceeding.',
        },
      })
    }
  }

  next()
}
