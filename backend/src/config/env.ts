import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'

dotenv.config()
try {
  const here = dirname(fileURLToPath(import.meta.url))
  dotenv.config({ path: resolve(here, '../../.env') })
} catch {}

// ─── Environment configuration ────────────────────────────────────────────────
// Central, typed access to environment variables. Supabase keys are optional at
// this stage (Phase B0) so the server can boot and serve /health before a
// Supabase project exists. A later phase makes them required for DB routes.

function optional(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim().length > 0 ? v.trim() : undefined
}

function withDefault(name: string, fallback: string): string {
  return optional(name) ?? fallback
}

const nodeEnv = withDefault('NODE_ENV', 'development')
const isProd = nodeEnv === 'production'

// Raw environment values
const rawIdle = optional('SESSION_IDLE_TIMEOUT_SECONDS')
const rawWarn = optional('SESSION_WARNING_SECONDS')
const rawAbsolute = optional('SESSION_ABSOLUTE_TIMEOUT_SECONDS')
const rawTrustProxy = optional('TRUST_PROXY')
const rawCookieSecure = optional('COOKIE_SECURE')
const rawDemoRoleSwitcher = optional('DEMO_ROLE_SWITCHER')

// Parsing
const parsedIdle = rawIdle ? Number(rawIdle) : 180
const parsedWarn = rawWarn ? Number(rawWarn) : 30
const parsedAbsolute = rawAbsolute ? Number(rawAbsolute) : 28800
const parsedTrustProxy = rawTrustProxy ? Number(rawTrustProxy) : 0
const parsedCookieSecure = rawCookieSecure !== undefined
  ? rawCookieSecure.toLowerCase() === 'true'
  : isProd

const rawOrigins = optional('ALLOWED_ORIGINS') ?? optional('CORS_ORIGIN') ?? 'http://localhost:5173'
const allowedOrigins = rawOrigins.split(',').map(s => s.trim()).filter(Boolean)

export const env = {
  nodeEnv,
  port: Number(withDefault('PORT', '4000')),

  // Supabase — optional for /health, required for DB routes.
  supabaseUrl:            optional('SUPABASE_URL'),
  supabaseAnonKey:        optional('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: optional('SUPABASE_SERVICE_ROLE_KEY'),

  // Allowed browser origins for CORS & CSRF verification
  corsOrigins: allowedOrigins,
  allowedOrigins,

  // ── Session / idle-timeout settings ──────────────────────────────────────
  // How long (seconds) of inactivity before the server kills the session (min 60).
  sessionIdleTimeoutSeconds:     parsedIdle,
  // Warn the user this many seconds before the idle timeout fires.
  sessionWarnSeconds:            parsedWarn,
  // Hard cap regardless of activity (default 8 hours = 28800).
  sessionAbsoluteTimeoutSeconds: parsedAbsolute,

  // Proxy hops (for trust proxy in Express)
  trustProxy: parsedTrustProxy,

  // Cookie flags
  cookieSecure: parsedCookieSecure,
  cookieName: isProd ? '__Host-sid' : 'sid',

  // Demo features
  demoRoleSwitcher: rawDemoRoleSwitcher === 'true',

  // ── Authentication & Security Hardening ──────────────────────────────────
  appEncryptionKey: optional('APP_ENCRYPTION_KEY') ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  appEncryptionKeyRotation: optional('APP_ENCRYPTION_KEY_ROTATION'),
  featuresMfa: optional('FEATURES_MFA') !== 'false',
  featuresSelfServiceReset: optional('FEATURES_SELF_SERVICE_RESET') === 'true',
  googleClientId: optional('GOOGLE_CLIENT_ID'),
  googleClientSecret: optional('GOOGLE_CLIENT_SECRET'),
  googleAllowedDomains: (optional('GOOGLE_ALLOWED_DOMAINS') ?? 'paruluniversity.ac.in,university.edu')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),

  // ── File Uploads & Virus Scanning ─────────────────────────────────────────
  clamAvEnabled: optional('CLAMAV_ENABLED') === 'true',
  clamAvHost: withDefault('CLAMAV_HOST', '127.0.0.1'),
  clamAvPort: Number(withDefault('CLAMAV_PORT', '3310')),
  maxFileSizeMb: Number(withDefault('MAX_FILE_SIZE_MB', '10')),
} as const

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  SESSION_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(60).default(180),
  SESSION_WARNING_SECONDS: z.coerce.number().int().positive().default(30),
  SESSION_ABSOLUTE_TIMEOUT_SECONDS: z.coerce.number().int().min(60).default(28800),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  DEMO_ROLE_SWITCHER: z.enum(['true', 'false']).default('false'),
  DEBUG: z.enum(['true', 'false']).optional(),
  DEFAULT_CREDENTIALS_ENABLED: z.enum(['true', 'false']).optional(),
  MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(100).default(10),
  CLAMAV_ENABLED: z.enum(['true', 'false']).default('false'),
  APP_ENCRYPTION_KEY: z.string().min(32).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
})

export function isProduction(): boolean {
  return (process.env.NODE_ENV ?? env.nodeEnv) === 'production'
}

/** True when the Supabase connection is fully configured. */
export function isSupabaseConfigured(): boolean {
  if (process.env.NODE_ENV === 'production' && !process.env.SUPABASE_URL) {
    return false
  }
  const url = process.env.SUPABASE_URL !== undefined ? process.env.SUPABASE_URL : env.supabaseUrl
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY !== undefined ? process.env.SUPABASE_SERVICE_ROLE_KEY : env.supabaseServiceRoleKey
  return Boolean(url && key)
}

/**
 * Fail-fast validation called at server start. In production:
 * - Supabase must be configured
 * - SESSION_IDLE_TIMEOUT_SECONDS must be >= 60
 * - SESSION_WARNING_SECONDS must be > 0 and < SESSION_IDLE_TIMEOUT_SECONDS
 * - SESSION_ABSOLUTE_TIMEOUT_SECONDS must be >= SESSION_IDLE_TIMEOUT_SECONDS
 * - TRUST_PROXY must be a valid non-negative integer
 * - COOKIE_SECURE must be true (required for __Host- cookie)
 * - features.demoRoleSwitcher must be false
 * - DEBUG must not be enabled
 * - Default test credentials must not be enabled
 * - APP_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters or 32 characters) and cannot be the default demo key
 * - SESSION_SECRET (if provided) must be at least 32 bytes
 */
export function validateEnv(): void {
  const isP = isProduction()

  // Run Zod schema validation
  const parseResult = envSchema.safeParse(process.env)
  if (!parseResult.success) {
    const issues = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`[env] Environment validation failed: ${issues}`)
  }

  if (isP) {
    if (!isSupabaseConfigured()) {
      throw new Error('[env] Production requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be configured.')
    }

    const idle = process.env.SESSION_IDLE_TIMEOUT_SECONDS !== undefined ? Number(process.env.SESSION_IDLE_TIMEOUT_SECONDS) : env.sessionIdleTimeoutSeconds
    if (idle < 60 || Number.isNaN(idle)) {
      throw new Error('[env] SESSION_IDLE_TIMEOUT_SECONDS must be at least 60 seconds.')
    }

    const warn = process.env.SESSION_WARNING_SECONDS !== undefined ? Number(process.env.SESSION_WARNING_SECONDS) : env.sessionWarnSeconds
    if (warn <= 0 || warn >= idle) {
      throw new Error('[env] SESSION_WARNING_SECONDS must be greater than 0 and less than SESSION_IDLE_TIMEOUT_SECONDS.')
    }

    const absolute = process.env.SESSION_ABSOLUTE_TIMEOUT_SECONDS !== undefined ? Number(process.env.SESSION_ABSOLUTE_TIMEOUT_SECONDS) : env.sessionAbsoluteTimeoutSeconds
    if (absolute < idle) {
      throw new Error('[env] SESSION_ABSOLUTE_TIMEOUT_SECONDS must be greater than or equal to SESSION_IDLE_TIMEOUT_SECONDS.')
    }

    const trust = process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) : env.trustProxy
    if (Number.isNaN(trust) || trust < 0) {
      throw new Error('[env] TRUST_PROXY must be a non-negative integer.')
    }

    const cookieSec = process.env.COOKIE_SECURE !== undefined ? process.env.COOKIE_SECURE === 'true' : env.cookieSecure
    if (!cookieSec) {
      throw new Error('[env] COOKIE_SECURE must be true in production (required for __Host- cookies).')
    }

    const demoOn = process.env.DEMO_ROLE_SWITCHER !== undefined ? process.env.DEMO_ROLE_SWITCHER === 'true' : env.demoRoleSwitcher
    if (demoOn) {
      throw new Error('[env] Refusing to start: features.demoRoleSwitcher cannot be enabled in production.')
    }

    if (process.env.DEBUG === 'true') {
      throw new Error('[env] Refusing to start: DEBUG mode cannot be enabled in production.')
    }

    if (process.env.DEFAULT_CREDENTIALS_ENABLED === 'true') {
      throw new Error('[env] Refusing to start: default credentials are not permitted in production.')
    }

    const rawKey = process.env.APP_ENCRYPTION_KEY ?? optional('APP_ENCRYPTION_KEY')
    if (!rawKey) {
      throw new Error('[env] Refusing to start: APP_ENCRYPTION_KEY must be configured in production.')
    }
    if (rawKey === '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef') {
      throw new Error('[env] Refusing to start: Default sample APP_ENCRYPTION_KEY is forbidden in production.')
    }
    const keyBuf = rawKey.length === 64 ? Buffer.from(rawKey, 'hex') : Buffer.from(rawKey, 'utf8')
    if (keyBuf.length !== 32) {
      throw new Error('[env] APP_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters or 32 utf-8 characters).')
    }

    const sessionSecret = process.env.SESSION_SECRET
    if (sessionSecret && sessionSecret.length < 32) {
      throw new Error('[env] SESSION_SECRET must be at least 32 bytes in production.')
    }
  } else {
    if (!isSupabaseConfigured()) {
      // eslint-disable-next-line no-console
      console.warn('[env] Supabase is not configured. Database routes will fail until set.')
    }
  }
}


