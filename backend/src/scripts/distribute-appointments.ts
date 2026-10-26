import { getSupabase } from '../lib/supabase.js'

const OTHER_USERS = [
  { id: 'u-1101', name: 'Priya Sharma', email: 'priya.sharma@university.edu',  employee_id: 'PU-2024-121', department: 'Admissions',       role: 'requester', active: true },
  { id: 'u-1102', name: 'Amit Patel',   email: 'amit.patel2@university.edu',   employee_id: 'PU-2024-122', department: 'Finance',          role: 'requester', active: true },
  { id: 'u-1103', name: 'Neha Jain',    email: 'neha.jain@university.edu',     employee_id: 'PU-2024-123', department: 'Academic Affairs', role: 'requester', active: true },
  { id: 'u-1104', name: 'Vikram Singh', email: 'vikram.singh@university.edu', employee_id: 'PU-2024-124', department: 'Examination Cell', role: 'requester', active: true },
  { id: 'u-1105', name: 'Kavya Reddy',  email: 'kavya.reddy@university.edu',  employee_id: 'PU-2024-125', department: 'Research',         role: 'requester', active: true },
]

// The 4 appointments that belong to Rohan Mehta (u-req):
const ROHAN_APPT_IDS = new Set([
  'APT-2026-5921', // Confirmed online meeting today Oct 23, 10:00 AM
  'APT-2026-6733', // Submitted request awaiting approval
  'APT-2026-1082', // Confirmed meeting Oct 22
  'APT-2026-4973', // Approved meeting Oct 24
])

async function main() {
  const supabase = getSupabase()

  // 1. Insert other users if not existing
  for (const u of OTHER_USERS) {
    const { error } = await supabase.from('users').upsert(u, { onConflict: 'id' })
    if (error) {
      console.warn(`Warning upserting user ${u.id}:`, error.message)
    }
  }
  console.log('Users upserted successfully.')

  // 2. Fetch all appointments
  const { data: appts, error } = await supabase
    .from('appointments')
    .select('id, requester, requester_id')
    .order('id')

  if (error || !appts) {
    throw new Error(`Failed to fetch appointments: ${error?.message}`)
  }

  let distributedCount = 0
  let userIndex = 0

  for (const appt of appts) {
    if (ROHAN_APPT_IDS.has(appt.id)) {
      // Ensure Rohan's data is exact
      await supabase
        .from('appointments')
        .update({
          requester: 'Rohan Mehta',
          requester_id: 'u-req',
          requester_initials: 'RM',
        })
        .eq('id', appt.id)
      continue
    }

    // Assign to one of the other users
    const assignee = OTHER_USERS[userIndex % OTHER_USERS.length]
    userIndex++

    const initials = assignee.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase() ?? '')
      .join('')

    const { error: updateErr } = await supabase
      .from('appointments')
      .update({
        requester: assignee.name,
        requester_id: assignee.id,
        requester_initials: initials,
      })
      .eq('id', appt.id)

    if (updateErr) {
      console.error(`Failed to update ${appt.id}:`, updateErr.message)
    } else {
      distributedCount++
    }
  }

  console.log(`Updated ${distributedCount} appointments to other requesters.`)
  console.log(`Rohan Mehta retained ${ROHAN_APPT_IDS.size} appointments.`)
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
