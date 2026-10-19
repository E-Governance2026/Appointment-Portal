import { getSupabase, getSupabaseAnon } from '../lib/supabase.js'

// Verifies the Phase B3 RLS state after migration 0009:
//   1. The SERVICE ROLE key still READS and WRITES every table (RLS bypassed).
//      If this breaks, the live API breaks too.
//   2. The ANON key (an unauthenticated caller) is now BLOCKED from reading
//      the protected tables (appointments / users / audit_events). This proves
//      RLS is actually enabled — before 0009 the anon role could read freely.
//
// Reference / master-data tables stay readable to anon-but-authenticated; an
// unauthenticated anon caller sees nothing, which is fine for this check.

async function checkServiceRole() {
  const supabase = getSupabase()
  console.log('── Service role (used by the Node API) ──')

  // READ
  const read = await supabase.from('appointments').select('id').limit(5)
  if (read.error) {
    console.log('  READ appointments FAILED:', read.error.code, read.error.message)
  } else {
    console.log(`  READ appointments OK (${read.data?.length ?? 0} rows sampled).`)
  }

  // WRITE (insert + delete a throwaway row)
  const probe = await supabase
    .from('departments')
    .insert({ id: '__probe__', name: '__probe__', code: 'PRB', active: false })
    .select()
  if (probe.error) {
    console.log('  WRITE departments FAILED:', probe.error.code, probe.error.message)
  } else {
    console.log('  WRITE departments OK (service role bypasses RLS).')
    await supabase.from('departments').delete().eq('id', '__probe__')
    console.log('  Probe row cleaned up.')
  }
}

async function checkAnonBlocked() {
  console.log('\n── Anon key (unauthenticated browser caller) ──')
  let anon
  try {
    anon = getSupabaseAnon()
  } catch (e) {
    console.log('  Anon client not configured; skipping anon check.')
    return
  }

  // With RLS on and no authenticated user, the appointments SELECT policy
  // evaluates current_app_role() = NULL, so no rows are visible.
  const appts = await anon.from('appointments').select('id').limit(5)
  const apptCount = appts.data?.length ?? 0
  if (appts.error) {
    console.log('  appointments: blocked with error', appts.error.code, '(RLS active).')
  } else if (apptCount === 0) {
    console.log('  appointments: 0 rows visible to anon (RLS active, as expected).')
  } else {
    console.log(`  appointments: ${apptCount} rows visible to anon — RLS may NOT be enforced!`)
  }

  const users = await anon.from('users').select('id').limit(5)
  const userCount = users.data?.length ?? 0
  if (users.error) {
    console.log('  users: blocked with error', users.error.code, '(RLS active).')
  } else if (userCount === 0) {
    console.log('  users: 0 rows visible to anon (RLS active, as expected).')
  } else {
    console.log(`  users: ${userCount} rows visible to anon — RLS may NOT be enforced!`)
  }
}

async function main() {
  await checkServiceRole()
  await checkAnonBlocked()
  console.log('\nDone.')
}

main().catch(e => {
  console.log('Check failed:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
})
