import 'dotenv/config'

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

export const env = {
  nodeEnv: withDefault('NODE_ENV', 'development'),
  port:    Number(withDefault('PORT', '4000')),

  // Supabase — optional for /health, required for DB routes (validated below).
  supabaseUrl:            optional('SUPABASE_URL'),
  supabaseAnonKey:        optional('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: optional('SUPABASE_SERVICE_ROLE_KEY'),

  // Comma-separated list of allowed browser origins for CORS. In development
  // the Vite dev server runs on 5173.
  corsOrigins: withDefault('CORS_ORIGIN', 'http://localhost:5173')
    .split(',').map(s => s.trim()).filter(Boolean),
} as const

export function isProduction(): boolean {
  return env.nodeEnv === 'production'
}

/** True when the Supabase connection is fully configured. */
export function isSupabaseConfigured(): boolean {
  return !!(env.supabaseUrl && env.supabaseServiceRoleKey)
}

/**
 * Fail-fast validation called at server start. In production a missing Supabase
 * config is fatal (every DB route would 500). In development we only warn so the
 * app can still boot and serve /health before a project is configured.
 */
export function validateEnv(): void {
  if (isSupabaseConfigured()) return
  const msg =
    'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
    '(and SUPABASE_ANON_KEY for login) in backend/.env.'
  if (isProduction()) {
    throw new Error(`[env] ${msg}`)
  }
  // eslint-disable-next-line no-console
  console.warn(`[env] ${msg} Database routes will fail until this is set.`)
}
