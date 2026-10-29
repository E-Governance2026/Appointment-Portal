// ─── Credential, Rate Limiting & Account Lockout Store ────────────────────────
// Central store for user credentials (argon2id hashes, mustChangePassword,
// temporary password expiry, MFA secrets, recovery codes) and abuse protection
// (IP rate limits, exponential account lockouts, security audit records, and
// super admin security alerts).

import { USERS } from '../seed/seedData.js'
import { hashPassword } from './password.js'

export interface UserCredential {
  userId:                  string
  passwordHash:            string
  mustChangePassword:      boolean
  temporaryExpiresAt:      number | null // epoch ms
  failedAttempts:          number
  failedWindowStart:       number        // epoch ms
  lockedUntil:             number | null // epoch ms
  lockoutCount:            number
  mfaEnabled:              boolean
  totpSecretEncrypted:     string | null
  recoveryCodesHashed:     string[]
  lastUsedTotpStep:        number
  passwordResetTokenHash:  string | null
  passwordResetExpiresAt:  number | null
}

export interface SecurityAuditEvent {
  id:        string
  timestamp: string
  action:    'failed_login' | 'account_locked' | 'account_unlocked' | 'password_changed' | 'password_reset' | 'mfa_enrolled' | 'mfa_reset' | 'sessions_revoked'
  userId?:   string
  actorId?:  string
  actorRole?: string
  ip?:       string
  detail?:   string
}

export interface SecurityAlert {
  id:         string
  timestamp:  string
  userId:     string
  identifier: string
  message:    string
  dismissed:  boolean
}

// In-memory persistent collections
const credentials = new Map<string, UserCredential>()
const ipAttempts = new Map<string, { count: number; windowStart: number }>()
const securityAuditEvents: SecurityAuditEvent[] = []
const securityAlerts: SecurityAlert[] = []

// Rate limit parameters
const IP_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const IP_MAX_ATTEMPTS = 20
const ACCOUNT_MAX_FAILURES = 5

// Dynamic user registry (seeded from USERS + dynamic admin-created users)
export interface StoredUser {
  id: string
  email: string
  name: string
  employee_id?: string
  department?: string
  role: any
  active: boolean
}

const registeredUsers = new Map<string, StoredUser>()

export function registerUser(user: StoredUser): void {
  registeredUsers.set(user.id, user)
}

// Pre-seed credentials for demo users
let initialized = false

export async function ensureSeedCredentials(): Promise<void> {
  if (initialized) return
  initialized = true

  // Seed registeredUsers map
  for (const u of USERS) {
    registeredUsers.set(u.id, u)
  }

  // Standard demo password hash with argon2id
  const defaultHash = await hashPassword('Portal@2026')

  for (const u of USERS) {
    if (!credentials.has(u.id)) {
      // Default MFA flag enabled for super_admin and admin_dispatcher per spec
      const mfaRoleDefault = u.role === 'super_admin' || u.role === 'admin_dispatcher'

      credentials.set(u.id, {
        userId:                 u.id,
        passwordHash:           defaultHash,
        mustChangePassword:     false,
        temporaryExpiresAt:     null,
        failedAttempts:         0,
        failedWindowStart:      Date.now(),
        lockedUntil:            null,
        lockoutCount:           0,
        mfaEnabled:             mfaRoleDefault, // enabled by default for these two roles
        totpSecretEncrypted:    null,
        recoveryCodesHashed:    [],
        lastUsedTotpStep:       -1,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      })
    }
  }
}

// ── Credential CRUD ──────────────────────────────────────────────────────────

export function getCredential(userId: string): UserCredential | null {
  return credentials.get(userId) ?? null
}

export function findUserById(userId: string): StoredUser | null {
  return registeredUsers.get(userId) ?? USERS.find(u => u.id === userId) ?? null
}

export function findUserByIdentifier(identifier: string): StoredUser | null {
  const clean = identifier.trim().toLowerCase()
  for (const u of registeredUsers.values()) {
    if (u.email.toLowerCase() === clean || (u.employee_id && u.employee_id.toLowerCase() === clean)) {
      return u
    }
  }
  const found = USERS.find(u =>
    u.email.toLowerCase() === clean ||
    (u.employee_id && u.employee_id.toLowerCase() === clean)
  )
  if (found) {
    registeredUsers.set(found.id, found)
    return found
  }
  return null
}

export function setCredential(userId: string, partial: Partial<UserCredential>): UserCredential {
  const existing = credentials.get(userId) ?? {
    userId,
    passwordHash:           '',
    mustChangePassword:     false,
    temporaryExpiresAt:     null,
    failedAttempts:         0,
    failedWindowStart:      Date.now(),
    lockedUntil:            null,
    lockoutCount:           0,
    mfaEnabled:             false,
    totpSecretEncrypted:    null,
    recoveryCodesHashed:    [],
    lastUsedTotpStep:       -1,
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
  }

  const updated: UserCredential = { ...existing, ...partial }
  credentials.set(userId, updated)
  return updated
}

// ── Rate Limiting & Account Lockout ───────────────────────────────────────────

export interface RateLimitCheckResult {
  allowed: boolean
  genericMessage?: string
  isIpBlocked?: boolean
  isAccountLocked?: boolean
}

/** Check IP rate limit and account lock status before attempting password check. */
export function checkLoginRateLimit(ip = '', identifier = ''): RateLimitCheckResult {
  const now = Date.now()

  // 1. IP check (20 per 15 minutes)
  if (ip) {
    const ipRec = ipAttempts.get(ip)
    if (ipRec) {
      if (now - ipRec.windowStart > IP_WINDOW_MS) {
        ipAttempts.set(ip, { count: 0, windowStart: now })
      } else if (ipRec.count >= IP_MAX_ATTEMPTS) {
        return {
          allowed: false,
          genericMessage: 'Too many login attempts from this network. Try again later.',
          isIpBlocked: true,
        }
      }
    }
  }

  // 2. Account Lock check
  if (identifier) {
    const user = findUserByIdentifier(identifier)
    if (user) {
      const cred = credentials.get(user.id)
      if (cred && cred.lockedUntil) {
        if (now < cred.lockedUntil) {
          // Locked: return the EXACT SAME GENERIC MESSAGE per spec
          return {
            allowed: false,
            genericMessage: 'Employee ID or password is incorrect. Try again later.',
            isAccountLocked: true,
          }
        } else {
          // Lock period expired: clear lock
          cred.lockedUntil = null
          cred.failedAttempts = 0
        }
      }
    }
  }

  return { allowed: true }
}

/** Record a failed login attempt for an IP and account. */
export function recordFailedLogin(ip = '', identifier = ''): { locked: boolean; lockoutCount: number } {
  const now = Date.now()

  // 1. Record IP attempt
  if (ip) {
    const ipRec = ipAttempts.get(ip)
    if (!ipRec || now - ipRec.windowStart > IP_WINDOW_MS) {
      ipAttempts.set(ip, { count: 1, windowStart: now })
    } else {
      ipRec.count += 1
    }
  }

  // Record audit log entry (NEVER log candidate password)
  securityAuditEvents.push({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    action: 'failed_login',
    ip,
    detail: `Failed login attempt for identifier [${identifier}].`,
  })

  // 2. Account failure tracking
  const user = findUserByIdentifier(identifier)
  if (!user) {
    return { locked: false, lockoutCount: 0 }
  }

  const cred = setCredential(user.id, {})
  if (now - cred.failedWindowStart > IP_WINDOW_MS) {
    cred.failedAttempts = 1
    cred.failedWindowStart = now
  } else {
    cred.failedAttempts += 1
  }

  if (cred.failedAttempts >= ACCOUNT_MAX_FAILURES) {
    cred.lockoutCount += 1
    // Exponential increase: 15min, 30min, maximum 60min
    const minutes = Math.min(60, 15 * Math.pow(2, cred.lockoutCount - 1))
    cred.lockedUntil = now + minutes * 60 * 1000

    securityAuditEvents.push({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      action: 'account_locked',
      userId: user.id,
      ip,
      detail: `Account locked for ${minutes} minutes after ${cred.failedAttempts} consecutive failed attempts (lockout #${cred.lockoutCount}).`,
    })

    // In-app alert for super admin when an account is locked repeatedly (>= 2)
    if (cred.lockoutCount >= 2) {
      securityAlerts.push({
        id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        userId: user.id,
        identifier: user.email,
        message: `Account [${user.email}] has been repeatedly locked (${cred.lockoutCount} times). Potential brute-force attack detected.`,
        dismissed: false,
      })
    }

    return { locked: true, lockoutCount: cred.lockoutCount }
  }

  return { locked: false, lockoutCount: cred.lockoutCount }
}

/** Reset failure count upon successful login. */
export function recordSuccessfulLogin(userId: string): void {
  const cred = credentials.get(userId)
  if (cred) {
    cred.failedAttempts = 0
    cred.lockedUntil = null
  }
}

/** Admin unlock action. */
export function unlockAccount(userId: string, actorId: string, actorRole: string): boolean {
  const cred = credentials.get(userId)
  if (!cred) return false

  cred.failedAttempts = 0
  cred.lockedUntil = null

  securityAuditEvents.push({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    action: 'account_unlocked',
    userId,
    actorId,
    actorRole,
    detail: `Account unlocked by super admin [${actorId}].`,
  })

  return true
}

/** Reset user MFA settings. */
export function resetUserMfa(userId: string, actorId: string, actorRole: string): boolean {
  const cred = credentials.get(userId)
  if (!cred) return false

  cred.mfaEnabled = false
  cred.totpSecretEncrypted = null
  cred.recoveryCodesHashed = []
  cred.lastUsedTotpStep = -1

  securityAuditEvents.push({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    action: 'mfa_reset',
    userId,
    actorId,
    actorRole,
    detail: `MFA reset by super admin [${actorId}].`,
  })

  return true
}

/** Get all security audit logs. */
export function getSecurityAuditEvents(): SecurityAuditEvent[] {
  return [...securityAuditEvents]
}

/** Get active security alerts. */
export function getSecurityAlerts(): SecurityAlert[] {
  return securityAlerts.filter(a => !a.dismissed)
}

/** Dismiss an alert. */
export function dismissSecurityAlert(alertId: string): void {
  const a = securityAlerts.find(item => item.id === alertId)
  if (a) a.dismissed = true
}

/** Teardown helper for tests. */
export function __resetCredentialStore(): void {
  credentials.clear()
  ipAttempts.clear()
  securityAuditEvents.length = 0
  securityAlerts.length = 0
  registeredUsers.clear()
  initialized = false
}
