import { getSupabase } from '../lib/supabase.js'

// Verifies the Phase B1 tables exist by selecting zero rows from each. A table
// that is missing returns a "does not exist" error; a present table returns an
// empty result. Prints a checklist.
const EXPECTED_TABLES = [
  'departments',
  'appointment_types',
  'authorities',
  'authority_types',
  'availability',
  'working_hours',
  'holidays',
  'users',
  'appointments',
  'audit_events',
] as const

async function tableExists(name: string): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase.from(name).select('*').limit(0)
  if (!error) return true
  const msg = error.message ?? ''
  // "does not exist" / PGRST205 = missing table. Anything else, treat as present
  // but note the message.
  if (/does not exist|could not find the table|PGRST205|schema cache/i.test(msg)) return false
  console.log(`  (note) ${name}: ${error.code} ${msg}`)
  return true
}

async function main() {
  console.log('Checking Phase B1 schema...\n')
  let present = 0
  for (const t of EXPECTED_TABLES) {
    const ok = await tableExists(t)
    console.log(`  ${ok ? '✓' : '✗'} ${t}`)
    if (ok) present++
  }
  console.log(`\n${present}/${EXPECTED_TABLES.length} tables present.`)
  if (present !== EXPECTED_TABLES.length) {
    console.log('Run the migrations in backend/supabase/migrations in order.')
    process.exitCode = 1
  } else {
    console.log('Schema looks complete.')
  }
}

main().catch(e => {
  console.log('Could not check schema:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
})
