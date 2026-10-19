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

  // Supabase — optional for now; required once DB routes land.
  supabaseUrl:            optional('SUPABASE_URL'),
  supabaseAnonKey:        optional('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: optional('SUPABASE_SERVICE_ROLE_KEY'),
} as const

/** True when the Supabase connection is fully configured. */
export function isSupabaseConfigured(): boolean {
  return !!(env.supabaseUrl && env.supabaseServiceRoleKey)
}

// A gentle startup notice so a missing config is obvious in dev, without
// crashing the health endpoint.
if (!isSupabaseConfigured()) {
  // eslint-disable-next-line no-console
  console.warn(
    '[env] Supabase is not configured yet. Set SUPABASE_URL and ' +
    'SUPABASE_SERVICE_ROLE_KEY in backend/.env to enable database routes.',
  )
}
