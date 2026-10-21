// ─── Service error ────────────────────────────────────────────────────────────
// Shared error type for the data layer. Extracted so both the mock service and
// the API client can throw/consume it without an import cycle.

export type ServiceErrorCode =
  | 'forbidden'
  | 'illegal_transition'
  | 'duplicate'
  | 'not_found'
  | 'validation'
  | 'in_use'

export class ServiceError extends Error {
  constructor(public code: ServiceErrorCode, message: string) {
    super(message)
  }
}
