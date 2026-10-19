// ─── HttpError ────────────────────────────────────────────────────────────────
// A typed error carrying an HTTP status + a stable error code, so the central
// error handler can produce consistent { error: { code, message } } responses.
// Codes mirror the frontend ServiceError codes plus auth-specific ones.

export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'validation'
  | 'not_found'
  | 'duplicate'
  | 'illegal_transition'
  | 'in_use'
  | 'internal_error'

const STATUS: Record<ErrorCode, number> = {
  unauthorized:       401,
  forbidden:          403,
  validation:         400,
  not_found:          404,
  duplicate:          409,
  illegal_transition: 409,
  in_use:             409,
  internal_error:     500,
}

export class HttpError extends Error {
  readonly status: number
  constructor(public code: ErrorCode, message: string) {
    super(message)
    this.status = STATUS[code]
  }
}
