import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { HttpError } from '../lib/httpError.js'
import { logger } from '../lib/logger.js'
import { isProduction } from '../config/env.js'

// ─── Request ID Middleware ───────────────────────────────────────────────────
/**
 * Attaches a unique, cryptographically random requestId to every request,
 * sets X-Request-Id on the response, and binds it to req for logging.
 */
export function requestIdMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header('x-request-id')
    const reqId = incoming && /^[a-zA-Z0-9.\-_]{8,64}$/.test(incoming)
      ? incoming
      : crypto.randomUUID()

    req.requestId = reqId
    res.setHeader('X-Request-Id', reqId)
    next()
  }
}

// ─── Sanitizer to prevent leaking paths or SQL in responses ───────────────────
function sanitizeErrorMessage(msg: string): string {
  // Strip Windows and UNIX file paths
  let clean = msg.replace(/[a-zA-Z]:\\[^\s:"]+/g, '[internal path]')
  clean = clean.replace(/\/(?:[a-zA-Z0-9._-]+\/)+[a-zA-Z0-9._-]+/g, '[internal path]')
  // Strip SQL keywords and table names
  if (/\b(select|insert|update|delete|drop|alter|truncate|table|column|from|where)\b/i.test(clean)) {
    return 'Database query operation failed.'
  }
  return clean
}

// ─── Centralized Error Handler ───────────────────────────────────────────────
export function centralErrorHandler() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const reqId = req.requestId || (res.getHeader('X-Request-Id') as string) || crypto.randomUUID()
    const isProd = isProduction()

    if (err instanceof HttpError) {
      // Known application domain errors (validation, 404, 403, etc.)
      logger.warn(`[HTTP ${err.status}] ${err.code}: ${err.message}`, {
        requestId: reqId,
        status: err.status,
        code: err.code,
        path: req.originalUrl,
      })

      return res.status(err.status).json({
        error: {
          code: err.code,
          message: sanitizeErrorMessage(err.message),
          requestId: reqId,
        },
      })
    }

    // Unhandled / Internal 500 errors
    const rawMessage = err instanceof Error ? err.message : 'Internal server error.'
    const stack = err instanceof Error ? err.stack : undefined

    // Log complete stack and metadata internally — NEVER sent to client
    logger.error(`[500 Internal Error] ${rawMessage}`, {
      requestId: reqId,
      path: req.originalUrl,
      method: req.method,
      stack,
    })

    const clientMessage = isProd
      ? 'An internal error occurred. Please contact support quoting your Request ID.'
      : sanitizeErrorMessage(rawMessage)

    return res.status(500).json({
      error: {
        code: 'internal_error',
        message: clientMessage,
        requestId: reqId,
      },
    })
  }
}
