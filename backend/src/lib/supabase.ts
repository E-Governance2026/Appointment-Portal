import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, isSupabaseConfigured } from '../config/env.js'

// ─── Supabase service-role client (lazy) ──────────────────────────────────────
// The server holds the SERVICE ROLE key and performs all privileged writes.
// The client is created lazily so the app can boot (and serve /health) before a
// Supabase project is configured. Routes that need the database call
// getSupabase(), which throws a clear error when config is missing.

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY in backend/.env.',
    )
  }
  if (!client) {
    client = createClient(env.supabaseUrl!, env.supabaseServiceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

// For tests: reset the memoized client so env changes take effect.
export function __resetSupabase(): void {
  client = null
  anonClient = null
}

// ── Anon client (for user sign-in) ──
// signInWithPassword must run as the anon role, not service role. Lazily built.
let anonClient: SupabaseClient | null = null

export function getSupabaseAnon(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error('Supabase anon client not configured (SUPABASE_URL / SUPABASE_ANON_KEY).')
  }
  if (!anonClient) {
    anonClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return anonClient
}
