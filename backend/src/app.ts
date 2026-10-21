import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { env, isSupabaseConfigured } from './config/env.js'
import { HttpError } from './lib/httpError.js'
import { authRouter } from './routes/auth.js'
import { appointmentsRouter } from './routes/appointments.js'
import { availabilityRouter } from './routes/availability.js'
import { reportsRouter } from './routes/reports.js'
import { masterRouter } from './routes/master.js'
import { usersRouter } from './routes/users.js'
import './types.js'   // load the Express.Request augmentation

// ─── Express app ──────────────────────────────────────────────────────────────
// The HTTP surface of the API. Kept separate from server.ts so tests can import
// the app without opening a port.

export function createApp() {
  const app = express()

  // ── Security + middleware ──
  app.disable('x-powered-by')
  app.use(helmet())
  // CORS limited to the configured browser origins (the frontend).
  app.use(cors({ origin: env.corsOrigins, credentials: true }))
  app.use(express.json({ limit: '1mb' }))

  // Minimal request logging (method, path, status, duration).
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now()
    res.on('finish', () => {
      // eslint-disable-next-line no-console
      console.log(`[req] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`)
    })
    next()
  })

  // Health check — always available, even without Supabase configured.
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'appointment-portal-backend',
      supabaseConfigured: isSupabaseConfigured(),
      time: new Date().toISOString(),
    })
  })

  // Rate limit the auth surface to blunt brute-force attempts: 20 requests per
  // minute per IP. Applied only to /auth so dashboards are not throttled.
  const authLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many attempts. Try again in a minute.' } },
  })

  // Auth: POST /auth/login, GET /auth/me
  app.use('/auth', authLimiter, authRouter)

  // Appointments: GET /appointments, GET /appointments/:id, POST /appointments
  app.use('/appointments', appointmentsRouter)

  // Availability: GET/PUT /availability/:authorityId
  app.use('/availability', availabilityRouter)

  // Reports: GET /reports
  app.use('/reports', reportsRouter)

  // Master data (super admin): GET /master + CRUD for departments/types/authorities
  app.use('/master', masterRouter)

  // User management (super admin): GET/POST/PUT/PATCH/DELETE /users
  app.use('/users', usersRouter)

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
