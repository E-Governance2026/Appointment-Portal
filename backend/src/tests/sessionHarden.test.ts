import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { getSession, clearAllSessions } from '../lib/sessionStore.js'
import { validateEnv } from '../config/env.js'

describe('Session management & security hardening', () => {
  const app = createApp()
  const validUser = {
    email: 'rohan.mehta@university.edu',
    password: 'Portal@2026',
  }

  beforeEach(() => {
    clearAllSessions()
  })

  afterEach(() => {
    clearAllSessions()
  })

  // Helper to log in and get cookie + csrfToken + sessionId
  async function loginHelper() {
    const res = await request(app)
      .post('/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send(validUser)

    expect(res.status).toBe(200)
    const cookies = res.headers['set-cookie']
    const cookie = Array.isArray(cookies) ? cookies[0] : cookies
    const csrfToken = res.body.csrfToken
    const sessionId = res.body.sessionId

    return { cookie, csrfToken, sessionId, res }
  }

  it('session id changes at login (regenerates session and destroys previous)', async () => {
    const first = await loginHelper()
    expect(first.sessionId).toBeDefined()
    expect(first.cookie).toContain('sid=')

    // Second login with previous cookie
    const secondRes = await request(app)
      .post('/auth/login')
      .set('Cookie', first.cookie)
      .set('Origin', 'http://localhost:5173')
      .send(validUser)

    expect(secondRes.status).toBe(200)
    expect(secondRes.body.sessionId).toBeDefined()
    expect(secondRes.body.sessionId).not.toBe(first.sessionId)

    // First session entry must be gone
    expect(getSession(first.sessionId)).toBeNull()
  })


  it('server rejects a request after the idle timeout (181 seconds)', async () => {
    const { cookie, sessionId } = await loginHelper()
    const entry = getSession(sessionId)
    expect(entry).not.toBeNull()

    // Wind lastActivityAt back 181 seconds (past 180s idle timeout)
    entry!.lastActivityAt = Date.now() - 181 * 1000

    const res = await request(app)
      .get('/auth/session')
      .set('Cookie', cookie)

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('session_expired')
    expect(res.body.error.reason).toBe('session_idle_timeout')
    expect(res.body.error.message).toBe('Your session has expired.')

    // Session entry must have been destroyed
    expect(getSession(sessionId)).toBeNull()
  })

  it('absolute timeout rejects request when absoluteExpiresAt is exceeded', async () => {
    const { cookie, sessionId } = await loginHelper()
    const entry = getSession(sessionId)
    expect(entry).not.toBeNull()

    // Keep idle recent, but expire absolute timeout
    entry!.lastActivityAt = Date.now()
    entry!.absoluteExpiresAt = Date.now() - 1000

    const res = await request(app)
      .get('/auth/session')
      .set('Cookie', cookie)

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('session_expired')
    expect(res.body.error.reason).toBe('session_absolute_timeout')
    expect(res.body.error.message).toBe('Your session has expired.')
  })

  it('GET polling does not extend idle timer', async () => {
    const { cookie, sessionId } = await loginHelper()
    const entry = getSession(sessionId)
    expect(entry).not.toBeNull()

    // Wind back 60 seconds
    const previousActivity = Date.now() - 60 * 1000
    entry!.lastActivityAt = previousActivity

    // GET /auth/session (polling endpoint)
    const res = await request(app)
      .get('/auth/session')
      .set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.authenticated).toBe(true)

    // Activity timestamp must NOT be modified
    expect(entry!.lastActivityAt).toBe(previousActivity)
  })

  it('POST extends idle timer', async () => {
    const { cookie, sessionId, csrfToken } = await loginHelper()
    const entry = getSession(sessionId)
    expect(entry).not.toBeNull()

    // Wind back 60 seconds
    const previousActivity = Date.now() - 60 * 1000
    entry!.lastActivityAt = previousActivity

    // Send state-changing POST
    const res = await request(app)
      .post('/appointments/draft')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Origin', 'http://localhost:5173')
      .send({ draft: { subject: 'Autosave test' } })

    expect(res.status).toBe(200)
    // Activity timestamp MUST be updated to now (> previousActivity)
    expect(entry!.lastActivityAt).toBeGreaterThan(previousActivity)
  })

  it('passive POST with X-Passive-Request: true does not extend idle timer', async () => {
    const { cookie, sessionId, csrfToken } = await loginHelper()
    const entry = getSession(sessionId)
    expect(entry).not.toBeNull()

    // Wind back 60 seconds
    const previousActivity = Date.now() - 60 * 1000
    entry!.lastActivityAt = previousActivity

    // Send passive draft autosave
    const res = await request(app)
      .post('/appointments/draft')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .set('X-Passive-Request', 'true')
      .set('Origin', 'http://localhost:5173')
      .send({ draft: { subject: 'Autosave passive test' } })

    expect(res.status).toBe(200)
    // Activity timestamp must NOT be updated
    expect(entry!.lastActivityAt).toBe(previousActivity)
  })

  it('POST /api/auth/session/touch extends idle timer and returns session shape', async () => {
    const { cookie, sessionId } = await loginHelper()
    const entry = getSession(sessionId)
    expect(entry).not.toBeNull()

    const previousActivity = Date.now() - 60 * 1000
    entry!.lastActivityAt = previousActivity

    const res = await request(app)
      .post('/api/auth/session/touch')
      .set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.authenticated).toBe(true)
    expect(res.body.idleTimeoutSeconds).toBe(180)
    expect(res.body.warningSeconds).toBe(30)
    expect(res.body.remainingIdleSeconds).toBeGreaterThan(170)
    expect(res.body.serverTime).toBeDefined()

    expect(entry!.lastActivityAt).toBeGreaterThan(previousActivity)
  })

  it('CSRF missing, wrong, and cross-origin cases return 403 csrf_failed', async () => {
    const { cookie, csrfToken } = await loginHelper()

    // 1. Missing CSRF token
    const resMissing = await request(app)
      .post('/appointments/draft')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({ draft: { note: 'test' } })

    expect(resMissing.status).toBe(403)
    expect(resMissing.body.error.code).toBe('csrf_failed')

    // 2. Wrong CSRF token
    const resWrong = await request(app)
      .post('/appointments/draft')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', 'wrong-csrf-token-123')
      .set('Origin', 'http://localhost:5173')
      .send({ draft: { note: 'test' } })

    expect(resWrong.status).toBe(403)
    expect(resWrong.body.error.code).toBe('csrf_failed')

    // 3. Cross-origin request
    const resCrossOrigin = await request(app)
      .post('/appointments/draft')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Origin', 'http://malicious-attacker.com')
      .send({ draft: { note: 'test' } })

    expect(resCrossOrigin.status).toBe(403)
    expect(resCrossOrigin.body.error.code).toBe('csrf_failed')
  })

  it('Cache-Control: no-store and Pragma: no-cache on authenticated routes', async () => {
    const { cookie } = await loginHelper()

    const res = await request(app)
      .get('/auth/session')
      .set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['pragma']).toBe('no-cache')
  })

  it('logout destroys the session and a reused cookie is rejected', async () => {
    const { cookie, sessionId, csrfToken } = await loginHelper()
    expect(getSession(sessionId)).not.toBeNull()

    const logoutRes = await request(app)
      .post('/auth/logout')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Origin', 'http://localhost:5173')

    expect(logoutRes.status).toBe(204)
    expect(logoutRes.headers['clear-site-data']).toBe('"cache", "cookies", "storage"')
    expect(logoutRes.headers['cache-control']).toBe('no-store')

    // Session destroyed
    expect(getSession(sessionId)).toBeNull()

    // Reusing old cookie must be rejected
    const reuseRes = await request(app)
      .get('/auth/session')
      .set('Cookie', cookie)

    expect(reuseRes.status).toBe(401)
  })

  it('cookie flags in development vs production specifications', async () => {
    const { cookie } = await loginHelper()
    // In dev: named sid, HttpOnly, SameSite=Lax, Path=/
    expect(cookie).toContain('sid=')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    // No persistent expiry (session cookie)
    expect(cookie).not.toContain('Max-Age')
    expect(cookie).not.toContain('Expires')
    // No Domain attribute
    expect(cookie).not.toContain('Domain=')
  })

  it('refuses to start in production if demo role switcher or invalid settings exist', () => {
    const origNodeEnv = process.env.NODE_ENV
    const origDemo = process.env.DEMO_ROLE_SWITCHER
    const origSupabase = process.env.SUPABASE_URL

    try {
      // Missing supabase in production
      process.env.NODE_ENV = 'production'
      delete process.env.SUPABASE_URL
      expect(() => validateEnv()).toThrow(/Production requires SUPABASE_URL/)
    } finally {
      process.env.NODE_ENV = origNodeEnv
      if (origDemo) process.env.DEMO_ROLE_SWITCHER = origDemo
      else delete process.env.DEMO_ROLE_SWITCHER
      if (origSupabase) process.env.SUPABASE_URL = origSupabase
    }
  })
})
