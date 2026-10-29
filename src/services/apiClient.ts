// ─── API client ───────────────────────────────────────────────────────────────
// Fetch wrapper for the backend. Uses HttpOnly session cookies (credentials: 'include').
// Holds CSRF token in memory ONLY (never in localStorage or sessionStorage).
// Attaches X-CSRF-Token on state-changing requests and handles 401 session_expired.

import { ServiceError, type ServiceErrorCode } from './serviceError'

// ── In-memory CSRF & auth tokens (never persisted in browser storage) ────────
let _csrfToken: string | null = null
let _inMemoryToken: string | null = null

export function getCsrfToken(): string | null {
  return _csrfToken
}
export function setCsrfToken(token: string | null): void {
  _csrfToken = token
}

/** In-memory fallback token (e.g. for testing environments without cookies). */
export function getToken(): string | null {
  return _inMemoryToken
}
export function setToken(token: string | null): void {
  _inMemoryToken = token
}

export function baseUrl(): string {
  const url = import.meta.env.VITE_API_BASE_URL
  if (!url) throw new ServiceError('validation', 'VITE_API_BASE_URL is not set.')
  return url.replace(/\/+$/, '')
}

// ── Session expiry broadcast ──────────────────────────────────────────────────
let _expiryCallback: ((reason: string) => void) | null = null

export function onSessionExpiry(cb: (reason: string) => void): void {
  _expiryCallback = cb
}

export function handleExpiry(reason: string): void {
  _csrfToken = null
  _inMemoryToken = null
  if (_expiryCallback) _expiryCallback(reason)
}

// ── Error mapping ─────────────────────────────────────────────────────────────
function toServiceError(code: string, message: string): ServiceError {
  const known: ServiceErrorCode[] = ['forbidden','illegal_transition','duplicate','not_found','validation','in_use']
  if ((known as string[]).includes(code)) return new ServiceError(code as ServiceErrorCode, message)
  if (code === 'unauthorized') return new ServiceError('forbidden', message)
  return new ServiceError('validation', message)
}

// ── Request ───────────────────────────────────────────────────────────────────
export interface RequestOptions {
  /** Extra headers (e.g. Idempotency-Key, X-Passive-Request). */
  headers?: Record<string, string>
  /** Mark this request as passive — it won't extend the server-side idle timer. */
  passive?: boolean
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export async function request<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  // Attach in-memory token if present (for test mock/bearer compatibility)
  if (_inMemoryToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${_inMemoryToken}`
  }

  // Attach in-memory CSRF token on state-changing requests
  if (STATE_CHANGING_METHODS.has(method.toUpperCase()) && _csrfToken && !headers['X-CSRF-Token']) {
    headers['X-CSRF-Token'] = _csrfToken
  }

  if (opts.passive) {
    headers['X-Passive-Request'] = 'true'
  }

  let res: Response
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      credentials: 'include', // Send and receive session cookies (__Host-sid / sid)
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ServiceError('validation', 'Could not reach the server. Check your connection and try again.')
  }

  if (res.status === 204) return undefined as T

  let json: unknown = null
  const text = await res.text()
  if (text) {
    try { json = JSON.parse(text) } catch { json = null }
  }

  if (!res.ok) {
    const envelope = json as { error?: { code?: string; message?: string; reason?: string } } | null
    const code    = envelope?.error?.code    ?? 'validation'
    const message = envelope?.error?.message ?? `Request failed (${res.status}).`
    const reason  = envelope?.error?.reason  ?? 'session_idle_timeout'

    // Session expired → trigger expiry flow
    if (code === 'session_expired') {
      handleExpiry(reason)
      throw new ServiceError('forbidden', message)
    }

    throw toServiceError(code, message)
  }

  // Auto-record CSRF token if returned in response (e.g. from /login or /csrf or /me)
  if (json && typeof json === 'object' && 'csrfToken' in (json as Record<string, unknown>)) {
    const ct = (json as Record<string, unknown>).csrfToken
    if (typeof ct === 'string') {
      _csrfToken = ct
    }
  }

  return json as T
}

export const api = {
  get:   <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, undefined, opts),
  post:  <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, body, opts),
  put:   <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, body, opts),
  del:    <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, undefined, opts),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, undefined, opts),
}

