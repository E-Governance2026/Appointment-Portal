import type { Request, Response } from 'express'
import { env, isProduction } from '../config/env.js'

export function getSessionCookieName(): string {
  return env.cookieName
}

export function parseCookies(header?: string): Record<string, string> {
  if (!header) return {}
  const cookies: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    const val = part.slice(idx + 1).trim()
    try {
      cookies[key] = decodeURIComponent(val)
    } catch {
      cookies[key] = val
    }
  }
  return cookies
}

export function getSessionIdFromRequest(req: Request): string | null {
  // 1. Check cookies first (__Host-sid in prod, sid in dev; accept both for dev flexibility)
  const cookies = parseCookies(req.headers.cookie)
  const cookieName = getSessionCookieName()
  if (cookies[cookieName]) return cookies[cookieName]
  if (cookies['sid']) return cookies['sid']
  if (cookies['__Host-sid']) return cookies['__Host-sid']

  // 2. Fallback to Authorization: Bearer <sessionId/token>
  const auth = req.header('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  if (m) return m[1].trim()

  return null
}

export function setSessionCookie(res: Response, sessionId: string): void {
  const name = getSessionCookieName()
  const isSecure = env.cookieSecure || isProduction()
  let cookie = `${name}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`
  if (isSecure) {
    cookie += '; Secure'
  }
  res.setHeader('Set-Cookie', cookie)
}

export function clearSessionCookie(res: Response): void {
  const name = getSessionCookieName()
  const isSecure = env.cookieSecure || isProduction()
  let cookie = `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  if (isSecure) {
    cookie += '; Secure'
  }
  res.setHeader('Set-Cookie', cookie)
}
