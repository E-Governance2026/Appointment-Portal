import { getSupabase } from '../lib/supabase.js'
import { canViewAppointment } from '../domain/permissions.js'
import type { AppointmentRow } from '../routes/appointmentMapper.js'
import type { Actor } from '../types.js'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function applyScope<Q extends { or(f: string): Q; eq(c: string, v: string): Q }>(query: Q, actor: Actor): Q {
  switch (actor.role) {
    case 'super_admin':
    case 'admin_dispatcher':
      return query
    case 'coordinator_authority':
      return query.or(`assigned_role.eq.${actor.role},assigned_role.is.null`)
    case 'requester':
    default:
      return query.eq('requester_id', actor.id)
  }
}

async function getStatsFor(actor: Actor) {
  const supabase = getSupabase()
  let query = supabase.from('appointments').select('id, requester, requester_id, assigned_role, status, date')
  query = applyScope(query, actor)
  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as unknown as AppointmentRow[]
  const visible = rows.filter(r =>
    canViewAppointment(
      { id: actor.id, name: actor.name, role: actor.role },
      { requester: r.requester, requesterId: r.requester_id ?? undefined, assignedRole: r.assigned_role ?? undefined },
    ),
  )
  const today = todayISO()
  return {
    total: visible.length,
    awaitingApproval: visible.filter(r => r.status === 'submitted').length,
    confirmed: visible.filter(r => r.status === 'confirmed' || r.status === 'approved').length,
    todayCount: visible.filter(r => r.date === today).length,
    appointments: visible.map(r => ({ id: r.id, requester: r.requester, status: r.status, date: r.date })),
  }
}

async function main() {
  const requesterActor: Actor = { id: 'u-req', name: 'Rohan Mehta', email: 'rohan.mehta@university.edu', role: 'requester' }
  const superAdminActor: Actor = { id: 'u-sup', name: 'Super Admin', email: 'super.admin@university.edu', role: 'super_admin' }
  const authorityActor: Actor = { id: 'u-aut', name: 'Dr. Amit Patel', email: 'dr.amit.patel@university.edu', role: 'coordinator_authority' }

  const reqStats = await getStatsFor(requesterActor)
  console.log('=== REQUESTER (Rohan Mehta / u-req) ===')
  console.log('Stats:', {
    total: reqStats.total,
    awaitingApproval: reqStats.awaitingApproval,
    confirmed: reqStats.confirmed,
    todayCount: reqStats.todayCount,
  })
  console.log('Appointments:', reqStats.appointments)

  const adminStats = await getStatsFor(superAdminActor)
  console.log('\n=== SUPER ADMIN (u-sup) ===')
  console.log('Stats:', {
    total: adminStats.total,
    awaitingApproval: adminStats.awaitingApproval,
    confirmed: adminStats.confirmed,
    todayCount: adminStats.todayCount,
  })

  const authStats = await getStatsFor(authorityActor)
  console.log('\n=== AUTHORITY (Dr. Amit Patel / u-aut) ===')
  console.log('Stats:', {
    total: authStats.total,
    awaitingApproval: authStats.awaitingApproval,
    confirmed: authStats.confirmed,
    todayCount: authStats.todayCount,
  })
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
