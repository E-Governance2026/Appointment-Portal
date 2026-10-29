// ─── HttpError ────────────────────────────────────────────────────────────────
// A typed error carrying an HTTP status + a stable error code, so the central
// error handler can produce consistent { error: { code, message } } responses.
// Codes mirror the frontend ServiceError codes plus auth-specific ones.

export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'csrf_failed'
  | 'validation'
  | 'not_found'
  | 'duplicate'
  | 'conflict'
  | 'illegal_transition'
  | 'in_use'
  | 'rate_limited'
  | 'internal_error'

const STATUS: Record<ErrorCode, number> = {
  bad_request:        400,
  unauthorized:       401,
  forbidden:          403,
  csrf_failed:        403,
  validation:         400,
  not_found:          404,
  duplicate:          409,
  conflict:           409,
  illegal_transition: 409,
  in_use:             409,
  rate_limited:       429,
  internal_error:     500,
}

export class HttpError extends Error {
  readonly status: number
  constructor(public code: ErrorCode, message: string) {
    super(message)
    this.status = STATUS[code]
  }
}
