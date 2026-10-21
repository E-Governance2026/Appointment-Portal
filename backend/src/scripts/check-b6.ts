import request from 'supertest'
import { createApp } from '../app.js'
import { getSupabase } from '../lib/supabase.js'

// Live end-to-end check of the B6 visitor flow through the REAL HTTP endpoints,
// against Supabase. All staff actions run as admin_dispatcher (the reception
// desk owner after the role merge).
//
// Path A (visit): submit -> approve (today) -> confirm -> reception queue shows
//   it -> check-in -> check-out (status completed) -> timeline has
//   checked-in / checked-out / completed.
// Path B (no-show): submit -> approve -> confirm -> not-reported.
// Both throwaway rows are deleted at the end.

const PASSWORD = 'Portal@2026'
const REQUESTER_EMAIL = 'rohan.mehta@university.edu'
const ADMIN_EMAIL = 'admin.user@university.edu'   // u-adm, admin_dispatcher

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type App = ReturnType<typeof createApp>

async function login(app: App, email: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ email, password: PASSWORD })
  if (res.status !== 200) throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.token as string
}

async function submitApproveConfirm(app: App, reqToken: string, adminToken: string, subject: string): Promise<string> {
  const submit = await request(app).post('/appointments')
    .set('Authorization', `Bearer ${reqToken}`)
    .send({ bookWith: 'auth-ss', subject, description: 'check-b6 temporary row.' })
  if (submit.status !== 201) throw new Error(`submit failed: ${submit.status} ${JSON.stringify(submit.body)}`)
  const id = submit.body.appointment.id as string

  const approve = await request(app).post(`/appointments/${id}/approve`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ slot: { date: todayISO(), time: '10:00' } })
  if (approve.status !== 200) throw new Error(`approve failed: ${approve.status} ${JSON.stringify(approve.body)}`)

  const confirm = await request(app).post(`/appointments/${id}/confirm`)
    .set('Authorization', `Bearer ${adminToken}`).send({})
  if (confirm.status !== 200) throw new Error(`confirm failed: ${confirm.status} ${JSON.stringify(confirm.body)}`)
  return id
}

async function main() {
  const app = createApp()
  const reqToken = await login(app, REQUESTER_EMAIL)
  const adminToken = await login(app, ADMIN_EMAIL)
  const created: string[] = []
  let ok = true

  // ── Path A: visit ──
  console.log('── Path A: check-in -> check-out ──')
  const visitId = await submitApproveConfirm(app, reqToken, adminToken, 'B6 visit')
  created.push(visitId)
  console.log(`  prepared ${visitId} (confirmed, today 10:00)`)

  const queue = await request(app).get(`/appointments/reception/queue?date=${todayISO()}`)
    .set('Authorization', `Bearer ${adminToken}`)
  const inQueue = (queue.body.queue as { id: string }[] | undefined)?.some(a => a.id === visitId) ?? false
  console.log(`  reception queue shows it: ${inQueue ? 'yes' : 'NO'}`)
  ok = ok && inQueue

  const checkIn = await request(app).post(`/appointments/${visitId}/check-in`)
    .set('Authorization', `Bearer ${adminToken}`).send({})
  console.log(`  check-in: status=${checkIn.body.appointment?.status} checkedInAt=${checkIn.body.appointment?.checkedInAt ? 'set' : 'MISSING'}`)
  ok = ok && checkIn.status === 200 && checkIn.body.appointment?.status === 'confirmed' && !!checkIn.body.appointment?.checkedInAt

  const checkOut = await request(app).post(`/appointments/${visitId}/check-out`)
    .set('Authorization', `Bearer ${adminToken}`).send({})
  console.log(`  check-out: status=${checkOut.body.appointment?.status} checkedOutAt=${checkOut.body.appointment?.checkedOutAt ? 'set' : 'MISSING'}`)
  ok = ok && checkOut.status === 200 && checkOut.body.appointment?.status === 'completed' && !!checkOut.body.appointment?.checkedOutAt

  const tl = await request(app).get(`/appointments/${visitId}/timeline`).set('Authorization', `Bearer ${adminToken}`)
  const actions = (tl.body.timeline as { action: string }[]).map(e => e.action)
  const hasVisit = ['checked-in', 'checked-out', 'completed'].every(a => actions.includes(a))
  console.log(`  timeline actions: ${actions.join(', ')}`)
  console.log(`  has checked-in + checked-out + completed: ${hasVisit ? 'yes' : 'NO'}`)
  ok = ok && hasVisit

  // ── Path B: no-show ──
  console.log('\n── Path B: not-reported (no-show) ──')
  const noShowId = await submitApproveConfirm(app, reqToken, adminToken, 'B6 no-show')
  created.push(noShowId)
  const noShow = await request(app).post(`/appointments/${noShowId}/not-reported`)
    .set('Authorization', `Bearer ${adminToken}`).send({})
  console.log(`  not-reported: status=${noShow.body.appointment?.status}`)
  ok = ok && noShow.status === 200 && noShow.body.appointment?.status === 'not-reported'

  // ── Guard: a requester cannot check in ──
  console.log('\n── Guard: requester cannot check in ──')
  const confirmedForGuard = await submitApproveConfirm(app, reqToken, adminToken, 'B6 guard')
  created.push(confirmedForGuard)
  const denied = await request(app).post(`/appointments/${confirmedForGuard}/check-in`)
    .set('Authorization', `Bearer ${reqToken}`).send({})
  console.log(`  requester check-in blocked: ${denied.status === 403 ? 'yes (403)' : 'NO (' + denied.status + ')'}`)
  ok = ok && denied.status === 403

  // ── Clean up ──
  console.log('\n── Clean up ──')
  const supabase = getSupabase()
  for (const id of created) {
    const del = await supabase.from('appointments').delete().eq('id', id)
    console.log(`  deleted ${id}: ${del.error ? 'FAILED ' + del.error.message : 'yes'}`)
    ok = ok && !del.error
  }

  console.log(`\nB6 visitor flow ${ok ? 'OK' : 'INCOMPLETE'}.`)
  if (!ok) process.exitCode = 1
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
