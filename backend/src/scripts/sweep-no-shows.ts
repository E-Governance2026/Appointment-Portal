import { getSupabase } from '../lib/supabase.js'
import { sweepNoShows } from '../domain/noShowSweep.js'

// Scheduled no-show sweep. Run on a timer (cron / task scheduler), e.g. every
// 15 minutes:  npx tsx src/scripts/sweep-no-shows.ts
// Marks confirmed, un-checked-in appointments whose slot has passed as
// not-reported, recording a system audit event for each.

async function main() {
  const result = await sweepNoShows(getSupabase())
  console.log(`Sweep complete. Examined ${result.checked} confirmed appointment(s); marked ${result.swept.length} not-reported.`)
  if (result.swept.length > 0) console.log('  swept:', result.swept.join(', '))
}

main().catch(e => { console.error('Sweep failed:', e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
