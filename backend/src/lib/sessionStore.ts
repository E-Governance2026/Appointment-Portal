// ─── In-memory session store ──────────────────────────────────────────────────
// Server-side session store enforcing idle and absolute timeouts.
// Keys are cryptographically secure session IDs (256-bit).
// Stores ONLY metadata: userId, timestamps, client hashes, auth method, and CSRF token.
// Never stores passwords, tokens, or personal data.

import { randomBytes, createHash } from 'node:crypto'
import { env } from '../config/env.js'

export interface SessionEntry {
  sessionId:          string
  userId:             string
  createdAt:          number   // epoch ms
  lastActivityAt:     number   // epoch ms
  absoluteExpiresAt:  number   // epoch ms
  lastAuthAt:         number   // epoch ms (for recent auth checks, 5m window)
  ipHash:             string
  maskedIp:           string
  userAgentHash:      string
  device:             string
  authMethod:         string   // e.g. 'password', 'google', 'mock'
  csrfToken:          string
  mustChangePassword?: boolean
  mfaPending?:        boolean
  mfaExpiresAt?:      number
  mfaAttempts?:       number
}

const store = new Map<string, SessionEntry>()

/** 256-bit (32-byte) cryptographically secure random hex string. */
export function generateSecureId(): string {
  return randomBytes(32).toString('hex')
}

/** SHA-256 hex hash of a string (IP, user agent, or token). */
export function hashString(val: string): string {
  return createHash('sha256').update(val || '').digest('hex')
}

/** Parse a user-agent string into a clean client device description. */
export function parseDeviceFromUserAgent(ua = ''): string {
  if (!ua) return 'Web Browser'
  let os = 'Unknown OS'
  if (/windows/i.test(ua)) os = 'Windows'
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS'
  else if (/linux/i.test(ua)) os = 'Linux'

  let browser = 'Browser'
  if (/edg/i.test(ua)) browser = 'Edge'
  else if (/chrome/i.test(ua)) browser = 'Chrome'
  else if (/firefox/i.test(ua)) browser = 'Firefox'
  else if (/safari/i.test(ua)) browser = 'Safari'

  return `${browser} on ${os}`
}

/** Mask IP address to protect privacy (e.g. 192.168.1.xxx or 2001:db8::xxxx). */
export function maskIp(ip = ''): string {
  if (!ip) return 'Protected IP'
  if (ip.includes('.')) {
    const parts = ip.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`
    }
  }
  if (ip.includes(':')) {
    const parts = ip.split(':')
    return `${parts.slice(0, Math.min(3, parts.length)).join(':')}::xxxx`
  }
  return 'Protected IP'
}

export interface CreateSessionParams {
  userId:              string
  ip?:                 string
  userAgent?:          string
  authMethod?:         string
  mustChangePassword?: boolean
  mfaPending?:         boolean
  mfaExpiresAt?:       number
}

/** Create a new server-side session with at least 128 bits (256 bits used). */
export function createSession(params: CreateSessionParams): { sessionId: string; entry: SessionEntry } {
  const sessionId = generateSecureId()
  const csrfToken = generateSecureId()
  const now = Date.now()

  const entry: SessionEntry = {
    sessionId,
    userId:             params.userId,
    createdAt:          now,
    lastActivityAt:     now,
    absoluteExpiresAt:  now + env.sessionAbsoluteTimeoutSeconds * 1000,
    lastAuthAt:         params.mfaPending ? 0 : now, // not authenticated if mfaPending
    ipHash:             hashString(params.ip ?? ''),
    maskedIp:           maskIp(params.ip ?? ''),
    userAgentHash:      hashString(params.userAgent ?? ''),
    device:             parseDeviceFromUserAgent(params.userAgent ?? ''),
    authMethod:         params.authMethod ?? 'password',
    csrfToken,
    mustChangePassword: params.mustChangePassword,
    mfaPending:         params.mfaPending,
    mfaExpiresAt:       params.mfaExpiresAt,
    mfaAttempts:        0,
  }

  store.set(sessionId, entry)
  return { sessionId, entry }
}

/**
 * Regenerate session id on login or privilege/role change.
 * Prevents session fixation while preserving session metadata.
 */
export function regenerateSession(oldSessionId: string): { newSessionId: string; entry: SessionEntry } | null {
  const existing = store.get(oldSessionId)
  if (!existing) return null

  store.delete(oldSessionId)

  const newSessionId = generateSecureId()
  const now = Date.now()

  const entry: SessionEntry = {
    ...existing,
    sessionId:      newSessionId,
    csrfToken:      generateSecureId(),
    lastActivityAt: now,
    lastAuthAt:     existing.mfaPending ? 0 : now,
  }

  store.set(newSessionId, entry)
  return { newSessionId, entry }
}

/** Update the last authentication timestamp for recent-auth checks. */
export function updateSessionAuthTime(sessionId: string): void {
  const entry = store.get(sessionId)
  if (entry) {
    entry.lastAuthAt = Date.now()
  }
}

/** List active non-expired sessions for a user (safe representation for the client). */
export function getUserSessions(userId: string, currentSessionId?: string) {
  const now = Date.now()
  const idleMs = env.sessionIdleTimeoutSeconds * 1000
  const results = []

  for (const entry of store.values()) {
    if (entry.userId === userId && !entry.mfaPending) {
      if (now - entry.lastActivityAt <= idleMs && now <= entry.absoluteExpiresAt) {
        results.push({
          sessionId:      entry.sessionId,
          device:         entry.device,
          maskedIp:       entry.maskedIp,
          createdAt:      new Date(entry.createdAt).toISOString(),
          lastActivityAt: new Date(entry.lastActivityAt).toISOString(),
          isCurrent:      entry.sessionId === currentSessionId,
        })
      }
    }
  }

  return results
}

/** Revoke all other sessions belonging to a user except the specified session. */
export function revokeOtherUserSessions(userId: string, keepSessionId: string): number {
  let count = 0
  for (const [id, entry] of store) {
    if (entry.userId === userId && id !== keepSessionId) {
      store.delete(id)
      count++
    }
  }
  return count
}

/** Backward compatibility helper for legacy token-based tests. */
export function upsertSession(rawOrId: string, userId = 'u-req'): SessionEntry {
  const existing = store.get(rawOrId)
  if (existing) {
    existing.lastActivityAt = Date.now()
    return existing
  }
  const now = Date.now()
  const entry: SessionEntry = {
    sessionId:         rawOrId,
    userId,
    createdAt:         now,
    lastActivityAt:    now,
    absoluteExpiresAt: now + env.sessionAbsoluteTimeoutSeconds * 1000,
    lastAuthAt:        now,
    ipHash:            '',
    maskedIp:          '127.0.0.1',
    userAgentHash:     '',
    device:            'Local Test Environment',
    authMethod:        'password',
    csrfToken:         generateSecureId(),
  }
  store.set(rawOrId, entry)
  return entry
}

/** Read the session entry for a session ID, or null if invalid/expired. */
export function getSession(sessionId: string): SessionEntry | null {
  return store.get(sessionId) ?? null
}

/** Update lastActivityAt only if more than 5 seconds have passed since last update. */
export function touchSession(sessionId: string): SessionEntry | null {
  const entry = store.get(sessionId)
  if (!entry) return null
  const now = Date.now()
  if (now - entry.lastActivityAt > 5_000) {
    entry.lastActivityAt = now
  }
  return entry
}

/** Remove the session (logout or expiry). */
export function destroySession(sessionId: string): void {
  store.delete(sessionId)
}

/** Destroy all sessions belonging to a specific user (e.g. account disabled). */
export function destroyUserSessions(userId: string): void {
  for (const [id, entry] of store) {
    if (entry.userId === userId) {
      store.delete(id)
    }
  }
}

/** Check whether a session has exceeded the idle or absolute timeout. */
export function checkExpiry(entry: SessionEntry): 'ok' | 'idle' | 'absolute' {
  const now = Date.now()
  if (now > entry.absoluteExpiresAt) return 'absolute'
  if (now - entry.lastActivityAt > env.sessionIdleTimeoutSeconds * 1000) return 'idle'
  return 'ok'
}

/** Seconds until idle timeout fires (never negative). */
export function remainingIdleSeconds(entry: SessionEntry): number {
  const deadline = entry.lastActivityAt + env.sessionIdleTimeoutSeconds * 1000
  return Math.max(0, Math.round((deadline - Date.now()) / 1000))
}

/** Seconds until the absolute timeout fires (never negative). */
export function remainingAbsoluteSeconds(entry: SessionEntry): number {
  return Math.max(0, Math.round((entry.absoluteExpiresAt - Date.now()) / 1000))
}

/** Clear all sessions (used in test teardown). */
export function clearAllSessions(): void {
  store.clear()
}

/** Scheduled cleanup job: deletes expired sessions to prevent memory growth. */
export function cleanupExpiredSessions(): number {
  const now = Date.now()
  const idleMs     = env.sessionIdleTimeoutSeconds     * 1000
  let swept = 0
  for (const [key, entry] of store) {
    if (now - entry.lastActivityAt > idleMs || now > entry.absoluteExpiresAt) {
      store.delete(key)
      swept++
    }
  }
  return swept
}

// Run cleanup every 60 seconds
setInterval(() => {
  cleanupExpiredSessions()
}, 60 * 1000).unref()

