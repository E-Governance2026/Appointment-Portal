import { getSupabase } from '../lib/supabase.js'
import { USERS } from '../seed/seedData.js'

// ─── Create Supabase Auth users for the demo accounts ─────────────────────────
// Uses the admin API (service role) to create one auth.users entry per demo
// user, with a shared demo password, then links users.auth_user_id. Idempotent:
// if an auth user already exists for the email, it reuses it. Only the 6 demo
// role accounts get credentials (the extra accounts are data-only for now).

// Shared demo password for every demo account. NOT for production.
const DEMO_PASSWORD = 'Portal@2026'

// Which app users get login credentials (the 6 one-per-role demo accounts).
const DEMO_IDS = ['u-req', 'u-coo', 'u-aut', 'u-adm', 'u-rec', 'u-sup']

async function findAuthUserByEmail(email: string): Promise<string | null> {
  const supabase = getSupabase()
  // listUsers is paginated; the demo set is tiny so page 1 is enough.
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw new Error(`listUsers: ${error.message}`)
  const found = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
  return found?.id ?? null
}

async function main() {
  const supabase = getSupabase()
  const demoUsers = USERS.filter(u => DEMO_IDS.includes(u.id))

  console.log('Creating demo auth users...\n')

  for (const u of demoUsers) {
    let authUserId = await findAuthUserByEmail(u.email)

    if (authUserId) {
      console.log(`  = ${u.email} (auth user already exists)`)
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: DEMO_PASSWORD,
        email_confirm: true,           // skip the confirmation email for demos
        user_metadata: { name: u.name, role: u.role },
      })
      if (error) throw new Error(`createUser ${u.email}: ${error.message}`)
      authUserId = data.user.id
      console.log(`  + ${u.email} (created)`)
    }

    // Link the app users row to the auth user.
    const { error: linkErr } = await supabase
      .from('users')
      .update({ auth_user_id: authUserId })
      .eq('id', u.id)
    if (linkErr) throw new Error(`link ${u.id}: ${linkErr.message}`)
  }

  console.log(`\nDone. Demo password for all accounts: ${DEMO_PASSWORD}`)
  console.log('Demo logins:')
  demoUsers.forEach(u => console.log(`  ${u.role.padEnd(16)} ${u.email}`))
}

main().catch(e => {
  console.error('\nFAILED:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
})
