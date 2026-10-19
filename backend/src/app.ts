import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import { isSupabaseConfigured } from './config/env.js'
import { HttpError } from './lib/httpError.js'
import { authRouter } from './routes/auth.js'
import { appointmentsRouter } from './routes/appointments.js'
import './types.js'   // load the Express.Request augmentation

// ─── Express app ──────────────────────────────────────────────────────────────
// The HTTP surface of the API. Kept separate from server.ts so tests can import
// the app without opening a port.

export function createApp() {
  const app = express()

  app.use(cors())
  app.use(express.json())

  // Health check — always available, even without Supabase configured.
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'appointment-portal-backend',
      supabaseConfigured: isSupabaseConfigured(),
      time: new Date().toISOString(),
    })
  })

  // Auth: POST /auth/login, GET /auth/me
  app.use('/auth', authRouter)

  // Appointments: GET /appointments, GET /appointments/:id, POST /appointments
  app.use('/appointments', appointmentsRouter)

  // 404 for unknown routes.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found.' } })
  })

  // Centralized error handler — structured JSON responses.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } })
    }
    const message = err instanceof Error ? err.message : 'Internal server error.'
    // eslint-disable-next-line no-console
    console.error('[error]', err)
    res.status(500).json({ error: { code: 'internal_error', message } })
  })

  return app
}
