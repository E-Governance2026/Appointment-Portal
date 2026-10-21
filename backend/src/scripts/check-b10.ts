import request from 'supertest'
import { createApp } from '../app.js'
import { getSupabase } from '../lib/supabase.js'

// Live check of the B10 calendar reads, no-show sweep and notifications through
// the REAL HTTP routes. All throwaway rows are cleaned up.

const PASSWORD = 'Portal@2026'
const REQUESTER_EMAIL = 'rohan.mehta@university.edu'
const ADMIN_EMAIL = 'admin.user@university.edu'   // admin_dispatcher

type App = ReturnType<typeof createApp>

function isoDaysFromNow(delta: number): string {
  const d = new Date()
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function login(app: App, email: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ email, password: PASSWORD })
  if (res.status !== 200) throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.token as string
}

async function submitApproveConfirm(app: App, reqTok: string, admTok: string, date: string, time: string): Promise<string> {
  const submit = await request(app).post('/appointments').set('Authorization', `Bearer ${reqTok}`)
    .send({ bookWith: 'auth-ss', subject: 'B10', description: 'check-b10 temp.' })
  if (submit.status !== 201) throw new Error(`submit: ${submit.status} ${JSON.stringify(submit.body)}`)
  const id = submit.body.appointment.id as string
  const approve = await request(app).post(`/appointments/${id}/approve`).set('Authorization', `Bearer ${admTok}`)
    .send({ slot: { date, time } })
  if (approve.status !== 200) throw new Error(`approve: ${approve.status} ${JSON.stringify(approve.body)}`)
  const confirm = await request(app).post(`/appointments/${id}/confirm`).set('Authorization', `Bearer ${admTok}`).send({})
  if (confirm.status !== 200) throw new Error(`confirm: ${confirm.status} ${JSON.stringify(confirm.body)}`)
  return id
}

async function main() {
  const app = createApp()
  const reqTok = await login(app, REQUESTER_EMAIL)
  const admTok = await login(app, ADMIN_EMAIL)
  const created: string[] = []
  let ok = true

  // ── Calendar + day reads (wide range covers all seed rows) ──
  console.log('── Calendar + day reads ──')
  const cal = await request(app).get('/appointments/calendar?from=2026-01-01&to=2026-12-31').set('Authorization', `Bearer ${admTok}`)
  console.log(`  calendar status=${cal.status} count=${cal.body.appointments?.length}`)
  ok = ok && cal.status === 200 && Array.isArray(cal.body.appointments)

  const today = isoDaysFromNow(0)
  const day = await request(app).get(`/appointments/day?date=${today}`).set('Authorization', `Bearer ${admTok}`)
  console.log(`  day(${today}) status=${day.status} count=${day.body.appointments?.length}`)
  ok = ok && day.status === 200

  const badCal = await request(app).get('/appointments/calendar?from=bad&to=also-bad').set('Authorization', `Bearer ${admTok}`)
  console.log(`  calendar bad dates -> ${badCal.status} (expect 400)`)
  ok = ok && badCal.status === 400

  // ── No-show sweep ──
  console.log('\n── No-show sweep ──')
  const pastId = await submitApproveConfirm(app, reqTok, admTok, isoDaysFromNow(-1), '09:00')   // yesterday
  created.push(pastId)
  const futureId = await submitApproveConfirm(app, reqTok, admTok, isoDaysFromNow(3), '09:00')   // future
  created.push(futureId)
  console.log(`  prepared past=${pastId} future=${futureId} (both confirmed)`)

  const sweep = await request(app).post('/appointments/sweep-no-shows').set('Authorization', `Bearer ${admTok}`).send({})
  console.log(`  sweep status=${sweep.status} sweptCount=${sweep.body.swept?.length} checked=${sweep.body.checked}`)
  const sweptPast = (sweep.body.swept as string[] | undefined)?.includes(pastId) ?? false
  const sweptFuture = (sweep.body.swept as string[] | undefined)?.includes(futureId) ?? false
  console.log(`  past slot swept: ${sweptPast ? 'yes' : 'NO'}   future slot left alone: ${!sweptFuture ? 'yes' : 'NO'}`)
  ok = ok && sweep.status === 200 && sweptPast && !sweptFuture

  const pastRow = await request(app).get(`/appointments/${pastId}`).set('Authorization', `Bearer ${admTok}`)
  console.log(`  past appointment status now: ${pastRow.body.appointment?.status} (expect not-reported)`)
  ok = ok && pastRow.body.appointment?.status === 'not-reported'

  const futureRow = await request(app).get(`/appointments/${futureId}`).set('Authorization', `Bearer ${admTok}`)
  console.log(`  future appointment status still: ${futureRow.body.appointment?.status} (expect confirmed)`)
  ok = ok && futureRow.body.appointment?.status === 'confirmed'

  // ── Notifications ──
  console.log('\n── Notifications ──')
  const notif = await request(app).get(`/appointments/${futureId}/notifications`).set('Authorization', `Bearer ${admTok}`)
  const actions = (notif.body.notifications as { action: string }[] | undefined)?.map(n => n.action) ?? []
  console.log(`  notifications for confirmed appt: ${actions.join(', ') || '(none)'}`)
  ok = ok && notif.status === 200 && actions.includes('notification-sent')

  // ── Clean up ──
  console.log('\n── Clean up ──')
  const supabase = getSupabase()
  for (const id of created) {
    const del = await supabase.from('appointments').delete().eq('id', id)
    console.log(`  deleted ${id}: ${del.error ? 'FAILED ' + del.error.message : 'yes'}`)
    ok = ok && !del.error
  }

  console.log(`\nB10 ${ok ? 'OK' : 'INCOMPLETE'}.`)
  if (!ok) process.exitCode = 1
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
