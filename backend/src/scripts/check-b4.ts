import { getSupabase } from '../lib/supabase.js'
import { APPOINTMENT_COLUMNS, toAppointmentDto, type AppointmentRow } from '../routes/appointmentMapper.js'
import { resolveAuthority } from '../routes/appointments.js'

// End-to-end-ish check of the B4 data path against the live DB, using the
// service role (same client the API uses). It:
//   1. reads a seeded appointment and maps it to the DTO the UI expects,
//   2. performs a 3-step-flow insert exactly like POST /appointments,
//   3. reads the new row back and maps it,
//   4. deletes the throwaway row so the seed stays clean.

async function main() {
  const supabase = getSupabase()

  // 1. Read + map a seeded row.
  console.log('── 1. Read + map a seeded appointment ──')
  const read = await supabase.from('appointments').select(APPOINTMENT_COLUMNS).eq('id', 'APT-2026-3001').maybeSingle()
  if (read.error) throw new Error('read failed: ' + read.error.message)
  if (!read.data) throw new Error('APT-2026-3001 not found — is the seed loaded?')
  const dto = toAppointmentDto(read.data as unknown as AppointmentRow)
  console.log(`  ${dto.id}  with=${dto.authorityName}  date='${dto.date}' time='${dto.time}'  status=${dto.status}`)
  console.log(`  open slot maps to empty strings: ${dto.date === '' && dto.time === '' ? 'yes' : 'NO'}`)

  // 2. Insert via the same shape the submit endpoint builds (no slot chosen).
  console.log('\n── 2. Submit a 3-step booking (Shivendra sir, no time) ──')
  const authority = resolveAuthority('auth-ss')
  if (!authority) throw new Error('resolveAuthority returned null')
  const id = `APT-2026-TEST${Math.floor(1000 + Math.random() * 9000)}`
  const now = new Date().toISOString()
  const insert = await supabase.from('appointments').insert({
    id,
    requester: 'Rohan Mehta', requester_id: 'u-req', requester_initials: 'RM', requester_category: 'Staff',
    type_id: authority.typeIds[0], type_name: '', purpose_label: '',
    department: authority.department, authority_id: authority.id, authority_name: authority.name,
    date: null, time: null,
    subject: 'B4 verification booking', description: 'Temporary row created by check-b4.',
    mode: 'physical', location_label: '', documents_count: 0,
    status: 'submitted', submitted_at: now,
    assigned_stage: 'Authority review', assigned_role: 'coordinator_authority', assigned_to_id: authority.id,
    updated_at: now,
  }).select(APPOINTMENT_COLUMNS).single()
  if (insert.error) throw new Error('insert failed: ' + insert.error.message)
  const created = toAppointmentDto(insert.data as unknown as AppointmentRow)
  console.log(`  created ${created.id}  type derived='${created.typeId}'  dept=${created.department}  status=${created.status}`)

  // 3. Read it back.
  console.log('\n── 3. Read the new row back ──')
  const back = await supabase.from('appointments').select(APPOINTMENT_COLUMNS).eq('id', id).maybeSingle()
  console.log(`  found: ${back.data ? 'yes' : 'NO'}`)

  // 4. Clean up.
  console.log('\n── 4. Clean up ──')
  const del = await supabase.from('appointments').delete().eq('id', id)
  console.log(`  deleted throwaway row: ${del.error ? 'FAILED ' + del.error.message : 'yes'}`)

  console.log('\nB4 data path OK.')
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
