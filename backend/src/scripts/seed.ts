import { getSupabase } from '../lib/supabase.js'
import {
  DEPARTMENTS, APPOINTMENT_TYPES, AUTHORITIES, AVAILABILITY,
  USERS, appointments, workingHoursFor,
} from '../seed/seedData.js'

// ─── Seed runner ──────────────────────────────────────────────────────────────
// Loads the demo data into Supabase with idempotent upserts, in FK-safe order.
// Safe to run repeatedly — existing rows are updated, not duplicated.

async function upsert(table: string, rows: readonly unknown[], conflict = 'id') {
  const supabase = getSupabase()
  const { error } = await supabase.from(table).upsert(rows as object[], { onConflict: conflict })
  if (error) throw new Error(`[${table}] ${error.code ?? ''} ${error.message}`)
  console.log(`  ✓ ${table}: ${rows.length} rows`)
}

async function main() {
  console.log('Seeding database...\n')

  // 1. Departments
  await upsert('departments', DEPARTMENTS)

  // 2. Appointment types
  await upsert('appointment_types', APPOINTMENT_TYPES.map(({ id, name, description, default_duration_minutes, active }) =>
    ({ id, name, description, default_duration_minutes, active })))

  // 3. Authorities (strip typeIds — that goes to the join table)
  await upsert('authorities', AUTHORITIES.map(({ id, name, initials, designation, department, active }) =>
    ({ id, name, initials, designation, department, active })))

  // 4. Authority ↔ type join
  const authorityTypes = AUTHORITIES.flatMap(a => a.typeIds.map(type_id => ({ authority_id: a.id, type_id })))
  await upsert('authority_types', authorityTypes, 'authority_id,type_id')

  // 5. Availability + working hours + holidays
  await upsert('availability', AVAILABILITY.map(({ authority_id, slot_minutes }) => ({ authority_id, slot_minutes })), 'authority_id')
  const wh = AVAILABILITY.flatMap(a => workingHoursFor(a.authority_id))
  await upsert('working_hours', wh, 'authority_id,weekday')
  const holidays = AVAILABILITY.flatMap(a => a.holidays.map(h => ({ authority_id: a.authority_id, date: h.date, label: h.label })))
  if (holidays.length) await upsert('holidays', holidays, 'authority_id,date')

  // 6. Users
  await upsert('users', USERS)

  // 7. Appointments — clear any previous appointment rows first so stale/legacy
  //    records (and their audit events, via ON DELETE CASCADE) are removed, then
  //    insert the current 3-step-flow demo set.
  const supabase = getSupabase()
  const { error: delErr } = await supabase
    .from('appointments')
    .delete()
    .neq('id', '__none__')   // match-all delete (PostgREST requires a filter)
  if (delErr) throw new Error(`[appointments.delete] ${delErr.code ?? ''} ${delErr.message}`)
  console.log('  ✓ appointments: cleared existing rows')
  await upsert('appointments', appointments())

  console.log('\nSeed complete.')
}

main().catch(e => {
  console.error('\nSeed FAILED:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
})
