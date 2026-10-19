import { getSupabase } from '../lib/supabase.js'

// Confirms migration 0010 landed: every users.role and appointments.assigned_role
// is now one of the 4 target roles, with no leftover coordinator/authority/reception.
const ALLOWED = new Set(['requester', 'coordinator_authority', 'admin_dispatcher', 'super_admin'])

async function main() {
  const supabase = getSupabase()

  const users = await supabase.from('users').select('id, name, role').order('id')
  if (users.error) throw new Error('users read: ' + users.error.message)
  console.log('── users.role ──')
  for (const u of users.data ?? []) {
    const ok = ALLOWED.has(u.role as string)
    console.log(`  ${ok ? 'ok ' : 'BAD'} ${String(u.id).padEnd(8)} ${String(u.role).padEnd(22)} ${u.name}`)
  }

  const appts = await supabase.from('appointments').select('id, assigned_role').order('id')
  if (appts.error) throw new Error('appointments read: ' + appts.error.message)
  console.log('\n── appointments.assigned_role ──')
  const counts: Record<string, number> = {}
  for (const a of appts.data ?? []) {
    const r = (a.assigned_role as string) ?? '(null)'
    counts[r] = (counts[r] ?? 0) + 1
  }
  for (const [role, n] of Object.entries(counts)) {
    const ok = role === '(null)' || ALLOWED.has(role)
    console.log(`  ${ok ? 'ok ' : 'BAD'} ${role.padEnd(22)} ${n}`)
  }

  const badUsers = (users.data ?? []).filter(u => !ALLOWED.has(u.role as string)).length
  const badAppts = (appts.data ?? []).filter(a => a.assigned_role && !ALLOWED.has(a.assigned_role as string)).length
  console.log(`\n${badUsers === 0 && badAppts === 0 ? 'All roles are within the 4-role set.' : 'FOUND out-of-set roles — migration incomplete.'}`)
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
