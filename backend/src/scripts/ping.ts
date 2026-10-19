import { getSupabase } from '../lib/supabase.js'

// One-off connectivity check: confirms the URL + service-role key can reach the
// project. Querying a non-existent table should return a Postgres error ("table
// not found"), which still proves auth + reachability. A network/auth failure
// looks different and tells us the credentials or URL are wrong.
async function main() {
  const supabase = getSupabase()
  const { error } = await supabase.from('__connectivity_check__').select('*').limit(1)

  if (!error) {
    console.log('OK: reached Supabase (unexpected table exists, but connection works).')
    return
  }
  // PGRST205 / "does not exist" = reached PostgREST, auth accepted, table absent.
  const msg = error.message ?? ''
  if (/does not exist|could not find the table|PGRST205|schema cache/i.test(msg)) {
    console.log('OK: connected to Supabase and authenticated. (Expected "table not found".)')
  } else {
    console.log('PROBLEM: connected but got an unexpected error:')
    console.log('  ', error.code, '-', msg)
  }
}

main().catch(e => {
  console.log('FAILED to reach Supabase. Check SUPABASE_URL and the secret key.')
  console.log('  ', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
})
