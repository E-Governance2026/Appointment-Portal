import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'

describe('GET /health', () => {
  const app = createApp()

  it('returns ok with service metadata', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.service).toBe('appointment-portal-backend')
    expect(typeof res.body.supabaseConfigured).toBe('boolean')
    expect(res.body.time).toBeTruthy()
  })

  it('returns a structured 404 for unknown routes', async () => {
    const res = await request(app).get('/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('not_found')
  })
})
