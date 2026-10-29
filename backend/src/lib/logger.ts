import type { Request } from 'express'

// ─── Structured JSON Logger with Sensitive Data Redaction ────────────────────
// Automatically redacts passwords, tokens, cookies, authorization headers,
// CSRF tokens, TOTP codes, meeting URLs, and document names.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const REDACT_KEY_REGEX = /(password|passwd|token|authorization|cookie|csrf|totp|otp|secret|appencryptionkey|meetingurl|meeting_url|documentname|document_name|refreshtoken)/i

/**
 * Deep recursive object sanitizer that replaces sensitive field values with '[REDACTED]'.
 */
export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) return data

  if (typeof data === 'string') {
    // Redact bearer tokens
    if (/bearer\s+[a-zA-Z0-9._-]+/i.test(data)) {
      return data.replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]')
    }
    // Redact session cookies
    if (/(?:sid|__Host-sid)=[a-zA-Z0-9._-]+/i.test(data)) {
      return data.replace(/(?:sid|__Host-sid)=[a-zA-Z0-9._-]+/gi, 'sid=[REDACTED]')
    }
    return data
  }

  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item))
  }

  if (typeof data === 'object') {
    const clean: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      if (REDACT_KEY_REGEX.test(key)) {
        clean[key] = '[REDACTED]'
      } else {
        clean[key] = redactSensitiveData(val)
      }
    }
    return clean
  }

  return data
}

export function formatLogEntry(level: LogLevel, message: string, meta: Record<string, unknown> = {}): string {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...((redactSensitiveData(meta) as Record<string, unknown>) || {}),
  }
  return JSON.stringify(entry)
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.log(formatLogEntry('info', message, meta))
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.warn(formatLogEntry('warn', message, meta))
  },
  error(message: string, meta?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.error(formatLogEntry('error', message, meta))
  },
  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log(formatLogEntry('debug', message, meta))
    }
  },

  /** Log security events at warn level with requestId */
  security(event: string, req: Request | { requestId?: string; ip?: string; originalUrl?: string; actor?: any }, details?: Record<string, unknown>): void {
    const reqId = (req as any).requestId || (req as Request).headers?.['x-request-id'] || 'req-unknown'
    const ip = (req as Request).ip || (req as any).ip || 'unknown'
    const path = (req as Request).originalUrl || (req as any).originalUrl || 'unknown'
    const actorId = (req as Request).actor?.id || (req as any).actor?.id

    this.warn(`[SECURITY EVENT] ${event}`, {
      securityEvent: event,
      requestId: reqId,
      ip,
      path,
      actorId,
      ...details,
    })
  },
}
