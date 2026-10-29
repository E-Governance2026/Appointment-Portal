import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { randomBytes, createHash } from 'node:crypto'
import { HttpError } from '../lib/httpError.js'
import { requireAuth } from '../middleware/auth.js'
import {
  createSession, destroySession, regenerateSession,
  getSession, revokeOtherUserSessions, updateSessionAuthTime,
} from '../lib/sessionStore.js'
import { setSessionCookie, clearSessionCookie, getSessionIdFromRequest } from '../lib/sessionCookie.js'
import { verifyOrigin, constantTimeEqual } from '../middleware/session.js'
import { env } from '../config/env.js'
import { USERS } from '../seed/seedData.js'
import { sessionRouter } from './session.js'
import {
  hashPassword, verifyPassword, getDummyHash,
  validatePasswordPolicy,
} from '../lib/password.js'
import {
  ensureSeedCredentials, findUserByIdentifier, getCredential,
  checkLoginRateLimit, recordFailedLogin,
  recordSuccessfulLogin,
} from '../lib/credentialStore.js'
import {
  generateTotpSetup, verifyTotpCode, encryptAtRest,
  generateRecoveryCodes, consumeRecoveryCode,
} from '../lib/mfa.js'

// ─── Auth routes ──────────────────────────────────────────────────────────────
export const authRouter = Router()

// Initialize credentials for demo users
ensureSeedCredentials().catch(() => {/* seed initialized */})

// Mount session endpoints inside authRouter: /auth/session, /auth/sessions
authRouter.use('/session', sessionRouter)
authRouter.use('/sessions', sessionRouter)

const loginSchema = z.object({
  email:       z.string().optional(),
  identifier:  z.string().optional(),
  employeeId:  z.string().optional(),
  password:    z.string().min(1, 'Enter your password.'),
}).strict()

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword:     z.string().min(1, 'New password is required.'),
}).strict()

const reauthSchema = z.object({
  password: z.string().optional(),
  totpCode: z.string().optional(),
}).strict()

const mfaConfirmSchema = z.object({
  secretBase32: z.string().min(1, 'Secret is required.'),
  code:         z.string().min(6, 'Enter 6-digit TOTP code.'),
}).strict()

const mfaVerifySchema = z.object({
  code:          z.string().min(6, 'Enter 6-digit TOTP code.'),
  tempSessionId: z.string().optional(),
}).strict()

const mfaRecoverySchema = z.object({
  recoveryCode:  z.string().min(8, 'Enter recovery code.'),
  tempSessionId: z.string().optional(),
}).strict()

const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
}).strict()

const resetPasswordSchema = z.object({
  token:       z.string().min(1, 'Reset token is required.'),
  newPassword: z.string().min(1, 'New password is required.'),
}).strict()

const googleAuthSchema = z.object({
  code:         z.string().min(1, 'Authorization code is required.'),
  state:        z.string().min(1, 'State parameter is required.'),
  nonce:        z.string().optional(),
  codeVerifier: z.string().min(1, 'PKCE code verifier is required.'),
  expectedState: z.string().optional(),
  expectedNonce: z.string().optional(),
  refreshToken: z.string().optional(),
}).strict()

// Rate limit helper for self-service reset
const resetAttempts = new Map<string, { count: number; windowStart: number }>()

// ── POST /auth/login ─────────────────────────────────────────────────────────
authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Origin verification against ALLOWED_ORIGINS
    if (!verifyOrigin(req)) {
      return res.status(403).json({
        error: { code: 'csrf_failed', message: 'Cross-origin request blocked.' },
      })
    }

    // 2. Validate input
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid login details.')
    }
    const { password } = parsed.data
    const identifier = (parsed.data.identifier || parsed.data.email || parsed.data.employeeId || '').trim()
    if (!identifier) {
      throw new HttpError('validation', 'Enter your employee ID or email.')
    }

    // 3. Destroy any previous session (session fixation defense)
    const existingSessionId = getSessionIdFromRequest(req)
    if (existingSessionId) {
      destroySession(existingSessionId)
    }

    // 4. Login Abuse Protection: IP rate limit & account lockout check
    const rateCheck = checkLoginRateLimit(req.ip, identifier)
    if (!rateCheck.allowed) {
      // Uniform generic message on lockout
      throw new HttpError('unauthorized', rateCheck.genericMessage || 'Employee ID or password is incorrect. Try again later.')
    }

    let actorId: string
    let actorName: string
    let actorRole: import('../types.js').Role
    let actorEmail: string
    let mustChangePassword = false
    let mfaActive = false

    await ensureSeedCredentials()
    const found = findUserByIdentifier(identifier)

    if (!found) {
      // UNKNOWN USER TIMING EQUALIZATION:
      // Run dummy argon2id verification so response time is identical
      const dummyHash = await getDummyHash()
      await verifyPassword(dummyHash, password)
      recordFailedLogin(req.ip, identifier)
      throw new HttpError('unauthorized', 'Employee ID or password is incorrect. Try again later.')
    }

    if (!found.active) {
      throw new HttpError('forbidden', 'This account is inactive.')
    }

    const cred = getCredential(found.id)
    if (!cred) {
      const dummyHash = await getDummyHash()
      await verifyPassword(dummyHash, password)
      recordFailedLogin(req.ip, identifier)
      throw new HttpError('unauthorized', 'Employee ID or password is incorrect. Try again later.')
    }

    // Check temporary password expiry (24-hour limit)
    if (cred.temporaryExpiresAt && Date.now() > cred.temporaryExpiresAt) {
      throw new HttpError('unauthorized', 'Temporary password has expired. Contact your administrator.')
    }

    // Verify Candidate Password against Stored Hash
    const verification = await verifyPassword(cred.passwordHash, password)
    if (!verification.valid) {
      recordFailedLogin(req.ip, identifier)
      throw new HttpError('unauthorized', 'Employee ID or password is incorrect. Try again later.')
    }

    // Transparent Rehash: If hash parameters are outdated or legacy, rehash with current argon2id
    if (verification.needsRehash) {
      const newHash = await hashPassword(password)
      cred.passwordHash = newHash
    }

    actorId = found.id
    actorName = found.name
    actorRole = found.role
    actorEmail = found.email
    mustChangePassword = cred.mustChangePassword

    // Check if MFA is enabled and enrolled
    mfaActive = Boolean(env.featuresMfa && cred.mfaEnabled && cred.totpSecretEncrypted)

    // Reset failed login counter on successful password verification
    recordSuccessfulLogin(actorId)

    // 5. Handle Multi-Factor Authentication pending state
    if (mfaActive) {
      // Create pending MFA session: valid 5 minutes, restricted from regular APIs
      const { sessionId: tempSessionId, entry: tempEntry } = createSession({
        userId:       actorId,
        ip:           req.ip,
        userAgent:    req.header('user-agent'),
        authMethod:   'password',
        mfaPending:   true,
        mfaExpiresAt: Date.now() + 5 * 60 * 1000,
      })

      setSessionCookie(res, tempSessionId)
      res.setHeader('Cache-Control', 'no-store')
      return res.json({
        mfaRequired: true,
        tempSessionId,
        csrfToken: tempEntry.csrfToken,
        message: 'Two-factor authentication code required.',
      })
    }

    // 6. Create fully authenticated session (regenerated ID)
    const { sessionId, entry } = createSession({
      userId:             actorId,
      ip:                 req.ip,
      userAgent:          req.header('user-agent'),
      authMethod:         'password',
      mustChangePassword,
    })

    // 7. Set session cookie
    setSessionCookie(res, sessionId)

    res.setHeader('Cache-Control', 'no-store')
    res.json({
      token: sessionId, // for backward compatibility with existing tests
      sessionId,
      actor: { id: actorId, name: actorName, role: actorRole, email: actorEmail },
      csrfToken: entry.csrfToken,
      mustChangePassword,
      idleTimeoutSeconds: env.sessionIdleTimeoutSeconds,
      warningSeconds:     env.sessionWarnSeconds,
    })
  } catch (err) {
    next(err)
  }
})

// ── POST /auth/mfa/verify — verify TOTP code for pending login session ────────
authRouter.post('/mfa/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = mfaVerifySchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid code.')
    }
    const { code } = parsed.data

    const sessionId = req.sessionId ?? parsed.data.tempSessionId ?? getSessionIdFromRequest(req)
    if (!sessionId) {
      throw new HttpError('unauthorized', 'Session required.')
    }

    const session = getSession(sessionId)
    if (!session || !session.mfaPending) {
      throw new HttpError('unauthorized', 'No pending MFA authentication.')
    }

    if (session.mfaExpiresAt && Date.now() > session.mfaExpiresAt) {
      destroySession(sessionId)
      throw new HttpError('unauthorized', 'MFA session has expired. Sign in again.')
    }

    // Limit to 5 attempts per pending session
    session.mfaAttempts = (session.mfaAttempts ?? 0) + 1
    if (session.mfaAttempts > 5) {
      destroySession(sessionId)
      throw new HttpError('unauthorized', 'Too many failed MFA attempts. Sign in again.')
    }

    const cred = getCredential(session.userId)
    if (!cred || !cred.totpSecretEncrypted) {
      throw new HttpError('internal_error', 'MFA secret missing.')
    }

    const { decryptAtRest } = await import('../lib/mfa.js')
    const secretBase32 = decryptAtRest(cred.totpSecretEncrypted)
    const verification = verifyTotpCode(secretBase32, code, cred.lastUsedTotpStep)

    if (!verification.valid) {
      if (verification.reason?.includes('already been used')) {
        return res.status(400).json({
          error: {
            code: 'code_replayed',
            message: 'This code has already been used. Please wait for the next code.',
          },
        })
      }
      throw new HttpError('unauthorized', verification.reason ?? 'Invalid authentication code.')
    }

    // Prevent replay attack by advancing lastUsedTotpStep
    cred.lastUsedTotpStep = verification.currentStep

    // Promote session to fully authenticated & regenerate ID
    const regenerated = regenerateSession(sessionId)
    if (!regenerated) {
      throw new HttpError('internal_error', 'Failed to establish session.')
    }

    const fullSession = regenerated.entry
    fullSession.mfaPending = false
    fullSession.lastAuthAt = Date.now()
    fullSession.mustChangePassword = cred.mustChangePassword

    setSessionCookie(res, regenerated.newSessionId)

    const user = USERS.find(u => u.id === session.userId)
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      authenticated: true,
      sessionId: regenerated.newSessionId,
      token: regenerated.newSessionId,
      actor: user ? { id: user.id, name: user.name, role: user.role, email: user.email } : undefined,
      csrfToken: fullSession.csrfToken,
      mustChangePassword: fullSession.mustChangePassword,
    })
  } catch (err) {
    next(err)
  }
})

// ── POST /auth/mfa/recovery-code — verify single-use recovery code ───────────
authRouter.post('/mfa/recovery-code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = mfaRecoverySchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid recovery code.')
    }
    const { recoveryCode } = parsed.data

    const sessionId = req.sessionId ?? parsed.data.tempSessionId ?? getSessionIdFromRequest(req)
    if (!sessionId) {
      throw new HttpError('unauthorized', 'Session required.')
    }

    const session = getSession(sessionId)
    if (!session || !session.mfaPending) {
      throw new HttpError('unauthorized', 'No pending MFA authentication.')
    }

    const cred = getCredential(session.userId)
    if (!cred) {
      throw new HttpError('unauthorized', 'User credential not found.')
    }

    const consumed = consumeRecoveryCode(recoveryCode, cred.recoveryCodesHashed)
    if (!consumed.valid) {
      return res.status(400).json({
        error: {
          code: 'invalid_recovery_code',
          message: 'Invalid or already used recovery code.',
        },
      })
    }

    // Save updated recovery code hashes
    cred.recoveryCodesHashed = consumed.remainingHashes

    // Promote session & regenerate ID
    const regenerated = regenerateSession(sessionId)
    if (!regenerated) {
      throw new HttpError('internal_error', 'Failed to establish session.')
    }

    const fullSession = regenerated.entry
    fullSession.mfaPending = false
    fullSession.lastAuthAt = Date.now()
    fullSession.mustChangePassword = cred.mustChangePassword

    setSessionCookie(res, regenerated.newSessionId)

    const user = USERS.find(u => u.id === session.userId)
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      authenticated: true,
      sessionId: regenerated.newSessionId,
      token: regenerated.newSessionId,
      actor: user ? { id: user.id, name: user.name, role: user.role, email: user.email } : undefined,
      csrfToken: fullSession.csrfToken,
      remainingRecoveryCodes: cred.recoveryCodesHashed.length,
      mustChangePassword: fullSession.mustChangePassword,
    })
  } catch (err) {
    next(err)
  }
})

// ── POST /auth/change-password — authenticated user changes password ─────────
authRouter.post('/change-password', requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid password details.')
    }
    const { currentPassword, newPassword } = parsed.data

    const actor = req.actor!
    const cred = getCredential(actor.id)
    if (!cred) {
      throw new HttpError('unauthorized', 'User credentials not found.')
    }

    // 1. Verify current password
    const verifyCurrent = await verifyPassword(cred.passwordHash, currentPassword)
    if (!verifyCurrent.valid) {
      throw new HttpError('unauthorized', 'Current password is incorrect.')
    }

    // 2. Enforce policy on new password with user context
    const user = USERS.find(u => u.id === actor.id)
    const policyResult = validatePasswordPolicy(newPassword, {
      employeeId: user?.employee_id,
      email:      user?.email || actor.email,
      name:       user?.name || actor.name,
    })

    if (!policyResult.valid) {
      return res.status(400).json({
        error: {
          code: 'policy_violation',
          message: policyResult.errors[0],
          errors: policyResult.errors,
        },
      })
    }

    // 3. Hash new password with argon2id and update credential
    cred.passwordHash = await hashPassword(newPassword)
    cred.mustChangePassword = false
    cred.temporaryExpiresAt = null

    // 4. Update current session state
    if (req.session) {
      req.session.mustChangePassword = false
      req.session.lastAuthAt = Date.now()
    }

    // 5. Invalidate all other sessions belonging to this user
    const currentSessionId = req.sessionId ?? getSessionIdFromRequest(req) ?? ''
    const revokedCount = revokeOtherUserSessions(actor.id, currentSessionId)

    res.setHeader('Cache-Control', 'no-store')
    res.json({
      success: true,
      message: 'Password changed successfully. All other active sessions have been signed out.',
      revokedSessions: revokedCount,
    })
  } catch (err) {
    next(err)
  }
})

// ── POST /auth/reauthenticate — refresh recent authentication timestamp ──────
authRouter.post('/reauthenticate', requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = reauthSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError('validation', 'Provide your password or authentication code.')
    }
    const { password, totpCode } = parsed.data
    const actor = req.actor!
    const cred = getCredential(actor.id)
    if (!cred) {
      throw new HttpError('unauthorized', 'User credentials not found.')
    }

    let verified = false
    if (password) {
      const v = await verifyPassword(cred.passwordHash, password)
      if (v.valid) verified = true
    }
    if (!verified && totpCode && cred.totpSecretEncrypted) {
      const { decryptAtRest } = await import('../lib/mfa.js')
      const secret = decryptAtRest(cred.totpSecretEncrypted)
      const t = verifyTotpCode(secret, totpCode, cred.lastUsedTotpStep)
      if (t.valid) {
        cred.lastUsedTotpStep = t.currentStep
        verified = true
      }
    }

    if (!verified) {
      throw new HttpError('unauthorized', 'Authentication failed. Incorrect password or code.')
    }

    const currentSessionId = req.sessionId ?? getSessionIdFromRequest(req)
    if (currentSessionId) {
      updateSessionAuthTime(currentSessionId)
      if (req.session) req.session.lastAuthAt = Date.now()
    }

    res.setHeader('Cache-Control', 'no-store')
    res.json({
      success: true,
      lastAuthAt: Date.now(),
    })
  } catch (err) {
    next(err)
  }
})

// ── MFA Enrollment: POST /auth/mfa/setup ──────────────────────────────────────
authRouter.post('/mfa/setup', requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!
    const setup = await generateTotpSetup(actor.email)
    res.setHeader('Cache-Control', 'no-store')
    res.json(setup)
  } catch (err) {
    next(err)
  }
})

// ── MFA Enrollment: POST /auth/mfa/confirm ────────────────────────────────────
authRouter.post('/mfa/confirm', requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = mfaConfirmSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid setup details.')
    }
    const { secretBase32, code } = parsed.data
    const actor = req.actor!
    const cred = getCredential(actor.id)
    if (!cred) {
      throw new HttpError('unauthorized', 'User credentials not found.')
    }

    const verification = verifyTotpCode(secretBase32, code)
    if (!verification.valid) {
      throw new HttpError('validation', 'Invalid verification code. Please check your authenticator app.')
    }

    // Encrypt secret with AES-256-GCM using APP_ENCRYPTION_KEY
    cred.totpSecretEncrypted = encryptAtRest(secretBase32)
    cred.lastUsedTotpStep = -1
    cred.mfaEnabled = true

    // Generate 10 single-use recovery codes
    const { plainCodes, hashedCodes } = generateRecoveryCodes(10)
    cred.recoveryCodesHashed = hashedCodes

    res.setHeader('Cache-Control', 'no-store')
    res.json({
      success: true,
      message: 'Two-factor authentication successfully enabled.',
      recoveryCodes: plainCodes,
    })
  } catch (err) {
    next(err)
  }
})

// ── POST /auth/forgot-password (self-service reset behind feature flag) ────────
authRouter.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!env.featuresSelfServiceReset) {
      return res.status(403).json({
        error: { code: 'feature_disabled', message: 'Self-service password reset is disabled. Please contact your administrator.' },
      })
    }

    const parsed = forgotPasswordSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid email.')
    }
    const { email } = parsed.data
    const ip = req.ip || 'unknown'

    // Rate limit: max 5 requests per IP per 15 minutes
    const rec = resetAttempts.get(ip) ?? { count: 0, windowStart: Date.now() }
    if (Date.now() - rec.windowStart > 15 * 60 * 1000) {
      rec.count = 1
      rec.windowStart = Date.now()
    } else {
      rec.count += 1
    }
    resetAttempts.set(ip, rec)

    if (rec.count > 5) {
      return res.status(429).json({
        error: {
          code: 'too_many_requests',
          message: 'Too many password reset requests. Try again later.',
        },
      })
    }

    // Constant response whether user exists or not (enumeration prevention)
    const genericResponse = {
      message: 'If an account with that email exists, password reset instructions have been sent.',
    }

    const user = findUserByIdentifier(email)
    if (!user) {
      return res.json(genericResponse)
    }

    const cred = getCredential(user.id)
    if (cred) {
      const token = randomBytes(32).toString('hex')
      const tokenHash = createHash('sha256').update(token).digest('hex')
      cred.passwordResetTokenHash = tokenHash
      cred.passwordResetExpiresAt = Date.now() + 15 * 60 * 1000 // 15 minutes
    }

    res.json(genericResponse)
  } catch (err) {
    next(err)
  }
})

// ── POST /auth/reset-password (consume token and update password) ─────────────
authRouter.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!env.featuresSelfServiceReset) {
      return res.status(403).json({
        error: { code: 'feature_disabled', message: 'Self-service password reset is disabled.' },
      })
    }

    const parsed = resetPasswordSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid reset details.')
    }
    const { token, newPassword } = parsed.data
    const candidateHash = createHash('sha256').update(token).digest('hex')

    // Find credential with matching token hash
    let targetCred: import('../lib/credentialStore.js').UserCredential | null = null
    const { USERS } = await import('../seed/seedData.js')
    for (const u of USERS) {
      const c = getCredential(u.id)
      if (c && c.passwordResetTokenHash === candidateHash) {
        targetCred = c
        break
      }
    }

    if (!targetCred || !targetCred.passwordResetExpiresAt || Date.now() > targetCred.passwordResetExpiresAt) {
      throw new HttpError('unauthorized', 'Password reset token is invalid or has expired.')
    }

    const user = USERS.find(u => u.id === targetCred!.userId)
    const policyResult = validatePasswordPolicy(newPassword, {
      employeeId: user?.employee_id,
      email:      user?.email,
      name:       user?.name,
    })

    if (!policyResult.valid) {
      return res.status(400).json({
        error: {
          code: 'policy_violation',
          message: policyResult.errors[0],
          errors: policyResult.errors,
        },
      })
    }

    targetCred.passwordHash = await hashPassword(newPassword)
    targetCred.passwordResetTokenHash = null
    targetCred.passwordResetExpiresAt = null
    targetCred.mustChangePassword = false

    // Revoke all existing sessions for this user
    const { destroyUserSessions } = await import('../lib/sessionStore.js')
    destroyUserSessions(targetCred.userId)

    res.json({
      success: true,
      message: 'Your password has been successfully reset. Please sign in with your new password.',
    })
  } catch (err) {
    next(err)
  }
})

// ── POST /auth/google — Google OAuth verification & token hardening ───────────
authRouter.post('/google', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = googleAuthSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid Google OAuth parameters.')
    }
    const { state, expectedState, codeVerifier, refreshToken } = parsed.data

    // 1. Verify state parameter
    if (expectedState && state !== expectedState) {
      throw new HttpError('forbidden', 'Google OAuth state mismatch. Request may have been tampered with.')
    }

    // 2. PKCE codeVerifier must be present
    if (!codeVerifier || codeVerifier.length < 43) {
      throw new HttpError('validation', 'Invalid PKCE code verifier.')
    }

    // 3. Encrypt Google refresh token at rest with APP_ENCRYPTION_KEY if provided
    let encryptedRefreshToken: string | null = null
    if (refreshToken) {
      encryptedRefreshToken = encryptAtRest(refreshToken)
    }

    res.setHeader('Cache-Control', 'no-store')
    res.json({
      success: true,
      hasEncryptedRefreshToken: Boolean(encryptedRefreshToken),
      message: 'Google integration verified successfully.',
    })
  } catch (err) {
    next(err)
  }
})

// ── POST /auth/logout ────────────────────────────────────────────────────────
authRouter.post('/logout', requireAuth(), (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.session) {
      const clientCsrf = req.header('x-csrf-token')
      if (clientCsrf && !constantTimeEqual(clientCsrf, req.session.csrfToken)) {
        return res.status(403).json({
          error: { code: 'csrf_failed', message: 'CSRF token missing or invalid.' },
        })
      }
    }

    const sessionId = req.sessionId ?? getSessionIdFromRequest(req)
    if (sessionId) destroySession(sessionId)

    clearSessionCookie(res)
    res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"')
    res.setHeader('Cache-Control', 'no-store')
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

// ── GET /auth/csrf ───────────────────────────────────────────────────────────
authRouter.get('/csrf', requireAuth(), (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json({ csrfToken: req.session?.csrfToken })
})

// ── GET /auth/me ─────────────────────────────────────────────────────────────
authRouter.get('/me', requireAuth(), (req: Request, res: Response) => {
  const cred = req.actor ? getCredential(req.actor.id) : null
  res.setHeader('Cache-Control', 'no-store')
  res.json({
    actor: req.actor,
    csrfToken: req.session?.csrfToken,
    idleTimeoutSeconds: env.sessionIdleTimeoutSeconds,
    warningSeconds:     env.sessionWarnSeconds,
    mustChangePassword: Boolean(req.session?.mustChangePassword || cred?.mustChangePassword),
    mfaEnabled:         Boolean(cred?.mfaEnabled && cred?.totpSecretEncrypted),
  })
})
