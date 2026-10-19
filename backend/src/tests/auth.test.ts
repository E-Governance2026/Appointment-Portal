import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'

// These tests exercise the auth surface that does NOT require a live Supabase
// round trip: missing-token 401s and login input validation. A full login +
// /me round trip is covered by the manual live check in the B2 report (it needs
// real credentials against the Supabase project).

describe('auth — GET /auth/me', () => {
  const app = createApp()

  it('401 when no Authorization header is present', async () => {
    const res = await request(app).get('/auth/me')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('unauthorized')
  })

  it('401 when the Authorization header is malformed', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', 'Token abc')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('unauthorized')
  })
})

describe('auth — POST /auth/login validation', () => {
  const app = createApp()

  it('400 when the email is missing or invalid', async () => {
    const res = await request(app).post('/auth/login').send({ password: 'x' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation')
  })

  it('400 when the password is empty', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'a@b.com', password: '' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation')
  })
})
