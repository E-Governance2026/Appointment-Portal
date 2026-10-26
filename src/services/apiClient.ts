// ─── API client ───────────────────────────────────────────────────────────────
// Thin fetch wrapper for the backend. Attaches the bearer token (stored by the
// auth layer), sends/parses JSON, and turns the backend's structured error
// envelope { error: { code, message } } into a ServiceError the UI already
// understands. Only the supabase branch of appointmentsService uses this; the
// mock branch is untouched so tests keep running offline.

import { ServiceError, type ServiceErrorCode } from './serviceError'

// Where the token lives. The auth layer writes it here on login and clears it
// on logout; the client reads it on every request. Kept as a module function so
// there is no import cycle with the auth store.
const TOKEN_KEY = 'at_auth_token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore storage errors (private mode, etc.) */
  }
}

export function baseUrl(): string {
  const url = import.meta.env.VITE_API_BASE_URL
  if (!url) {
    throw new ServiceError('validation', 'VITE_API_BASE_URL is not set; cannot reach the backend.')
  }
  return url.replace(/\/+$/, '')
}

// Map backend error codes to the frontend ServiceErrorCode union. The backend
// adds 'unauthorized' / 'internal_error' / 'rate_limited' which the UI did not
// model; fold them into the closest existing code so callers keep working.
function toServiceError(code: string, message: string): ServiceError {
  const known: ServiceErrorCode[] = ['forbidden', 'illegal_transition', 'duplicate', 'not_found', 'validation', 'in_use']
  if ((known as string[]).includes(code)) return new ServiceError(code as ServiceErrorCode, message)
  if (code === 'unauthorized') return new ServiceError('forbidden', message)
  return new ServiceError('validation', message)
}

interface RequestOptions {
  /** Extra headers (e.g. an Idempotency-Key for booking submit). */
  headers?: Record<string, string>
}

async function request<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { ...opts.headers }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ServiceError('validation', 'Could not reach the server. Check your connection and try again.')
  }

  if (res.status === 204) return undefined as T

  let json: unknown = null
  const text = await res.text()
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
  }

  if (!res.ok) {
    const envelope = json as { error?: { code?: string; message?: string } } | null
    const code = envelope?.error?.code ?? 'validation'
    const message = envelope?.error?.message ?? `Request failed (${res.status}).`
    throw toServiceError(code, message)
  }

  return json as T
}

export const api = {
  get:   <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, undefined, opts),
  post:  <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, body, opts),
  put:   <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, body, opts),
  del:   <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, undefined, opts),
}
