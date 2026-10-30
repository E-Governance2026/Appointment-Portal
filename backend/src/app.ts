import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { env, isSupabaseConfigured, isProduction } from './config/env.js'
import { HttpError } from './lib/httpError.js'
import { logger } from './lib/logger.js'
import { checkVirusScannerStartup } from './lib/virusScanner.js'
import { requestIdMiddleware, centralErrorHandler } from './middleware/errorHandler.js'
import { authRouter } from './routes/auth.js'
import { appointmentsRouter } from './routes/appointments.js'
import { availabilityRouter } from './routes/availability.js'
import { reportsRouter } from './routes/reports.js'
import { masterRouter } from './routes/master.js'
import { usersRouter } from './routes/users.js'
import { dashboardRouter } from './routes/dashboard.js'
import { trackRouter } from './routes/track.js'
import { settingsRouter } from './routes/settings.js'
import { auditViewerRouter } from './routes/auditViewer.js'
import { notificationsRouter } from './routes/notifications.js'
import { sessionMiddleware } from './middleware/session.js'
import { sessionSecurityPolicyGuard } from './middleware/recentAuth.js'
import './types.js'   // load the Express.Request augmentation

// ─── Express app ──────────────────────────────────────────────────────────────
export function createApp() {
  const app = express()

  // Startup virus scanner warning if disabled in production
  checkVirusScannerStartup()

  // ── Request ID & Security Headers ──
  app.use(requestIdMiddleware())
  app.disable('x-powered-by')

  if (env.trustProxy > 0) {
    app.set('trust proxy', env.trustProxy)
  }

  // Redirect HTTP to HTTPS in production respecting TRUST_PROXY
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isProduction() && !req.secure && req.get('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`)
    }
    next()
  })

  // Comprehensive Helmet configuration
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https:'],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      hsts: isProduction()
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
      xContentTypeOptions: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      originAgentCluster: true,
    }),
  )

  // Permissions-Policy denying camera, microphone, geolocation, and payment
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
    next()
  })

  // Strict CORS: allow only configured ALLOWED_ORIGINS with credentials, no wildcard
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true)
        if (env.corsOrigins.includes(origin)) {
          return callback(null, true)
        }
        callback(new HttpError('csrf_failed', 'CORS origin not allowed.'))
      },
      credentials: true,
    }),
  )

  // Strict JSON body size limit: 100 KB
  app.use(express.json({ limit: '100kb' }))

  // Structured request logging with duration and requestId
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now()
    res.on('finish', () => {
      logger.info(`[req] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`, {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        requestId: req.requestId,
      })
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
    max: process.env.NODE_ENV === 'test' ? 1000 : 20,
    skip: () => process.env.NODE_ENV === 'test',
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many attempts. Try again in a minute.' } },
  })

  // Guard against pending MFA or forced password change across all routes
  app.use(sessionSecurityPolicyGuard)

  // Auth: /auth and /api/auth (includes /auth/session, /auth/sessions)
  app.use('/auth', authLimiter, authRouter)
  app.use('/api/auth', authLimiter, authRouter)

  // Session middleware: enforces idle/absolute timeout + Cache-Control + CSRF
  // origin check on every authenticated (non-auth, non-track) route.
  app.use('/appointments',     sessionMiddleware(), appointmentsRouter)
  app.use('/api/appointments', sessionMiddleware(), appointmentsRouter)
  app.use('/availability',     sessionMiddleware(), availabilityRouter)
  app.use('/api/availability', sessionMiddleware(), availabilityRouter)
  app.use('/reports',          sessionMiddleware(), reportsRouter)
  app.use('/api/reports',      sessionMiddleware(), reportsRouter)
  app.use('/master',           sessionMiddleware(), masterRouter)
  app.use('/api/master',       sessionMiddleware(), masterRouter)
  app.use('/users',            sessionMiddleware(), usersRouter)
  app.use('/api/users',        sessionMiddleware(), usersRouter)
  app.use('/dashboard',        sessionMiddleware(), dashboardRouter)
  app.use('/api/dashboard',    sessionMiddleware(), dashboardRouter)
  app.use('/settings',         sessionMiddleware(), settingsRouter)
  app.use('/api/settings',     sessionMiddleware(), settingsRouter)
  app.use('/audit',            sessionMiddleware(), auditViewerRouter)
  app.use('/api/audit',        sessionMiddleware(), auditViewerRouter)
  app.use('/notifications',     sessionMiddleware(), notificationsRouter)
  app.use('/api/notifications', sessionMiddleware(), notificationsRouter)

  // Public appointment tracking: GET /track/:id (no auth)
  app.use('/track', trackRouter)
  app.use('/api/track', trackRouter)


  // 404 for unknown routes.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found.' } })
  })

  // Centralized error handler — structured JSON responses with requestId and no leaks
  app.use(centralErrorHandler())

  return app
}
