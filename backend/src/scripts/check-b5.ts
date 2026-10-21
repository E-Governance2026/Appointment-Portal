import request from 'supertest'
import { createApp } from '../app.js'
import { getSupabase } from '../lib/supabase.js'

// Live end-to-end check of the B5 workflow through the REAL HTTP endpoints
// (auth middleware + permissions + transitions + audit), against Supabase.
//
// Flow:
//   1. login as the requester  -> token
//   2. POST /appointments (3-step submit, no slot) as requester
//   3. login as coordinator_authority -> token
//   4. POST /:id/approve with a slot  (submitted -> approved)
//   5. POST /:id/confirm              (approved  -> confirmed)
//   6. GET  /:id/timeline             (expects approved + confirmed + notification-sent)
//   7. delete the throwaway appointment (+ its audit rows via FK cascade)

const PASSWORD = 'Portal@2026'
const REQUESTER_EMAIL = 'rohan.mehta@university.edu'
const STAFF_EMAIL = 'dr.amit.patel@university.edu'   // u-ca, coordinator_authority

async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ email, password: PASSWORD })
  if (res.status !== 200) throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.token as string
}

async function main() {
  const app = createApp()

  console.log('── 1. Login as requester ──')
  const reqToken = await login(app, REQUESTER_EMAIL)
  console.log('  ok')

  console.log('\n── 2. Submit a 3-step booking (Shivendra sir, no slot) ──')
  const submit = await request(app)
    .post('/appointments')
    .set('Authorization', `Bearer ${reqToken}`)
    .send({ bookWith: 'auth-ss', subject: 'B5 verification', description: 'Temporary row from check-b5.' })
  if (submit.status !== 201) throw new Error(`submit failed: ${submit.status} ${JSON.stringify(submit.body)}`)
  const id = submit.body.appointment.id as string
  console.log(`  created ${id} status=${submit.body.appointment.status}`)

  console.log('\n── 3. Login as coordinator_authority ──')
  const staffToken = await login(app, STAFF_EMAIL)
  console.log('  ok')

  console.log('\n── 4. Approve with a slot ──')
  const approve = await request(app)
    .post(`/appointments/${id}/approve`)
    .set('Authorization', `Bearer ${staffToken}`)
    .send({ slot: { date: '2026-12-01', time: '10:00' }, note: 'Please bring your ID.' })
  if (approve.status !== 200) throw new Error(`approve failed: ${approve.status} ${JSON.stringify(approve.body)}`)
  console.log(`  status=${approve.body.appointment.status} date=${approve.body.appointment.date} time=${approve.body.appointment.time}`)

  console.log('\n── 5. Confirm ──')
  const confirm = await request(app)
    .post(`/appointments/${id}/confirm`)
    .set('Authorization', `Bearer ${staffToken}`)
    .send({})
  if (confirm.status !== 200) throw new Error(`confirm failed: ${confirm.status} ${JSON.stringify(confirm.body)}`)
  console.log(`  status=${confirm.body.appointment.status}`)

  console.log('\n── 6. Read the timeline ──')
  const timeline = await request(app)
    .get(`/appointments/${id}/timeline`)
    .set('Authorization', `Bearer ${staffToken}`)
  if (timeline.status !== 200) throw new Error(`timeline failed: ${timeline.status} ${JSON.stringify(timeline.body)}`)
  const actions = (timeline.body.timeline as { action: string }[]).map(e => e.action)
  console.log('  actions:', actions.join(', '))
  const expected = ['approved', 'confirmed', 'notification-sent']
  const hasAll = expected.every(a => actions.includes(a))
  console.log(`  contains approved + confirmed + notification-sent: ${hasAll ? 'yes' : 'NO'}`)

  console.log('\n── 7. Clean up ──')
  const supabase = getSupabase()
  const del = await supabase.from('appointments').delete().eq('id', id)
  console.log(`  deleted ${id}: ${del.error ? 'FAILED ' + del.error.message : 'yes (audit rows cascade)'}`)

  console.log(`\nB5 workflow ${hasAll && !del.error ? 'OK' : 'INCOMPLETE'}.`)
  if (!hasAll) process.exitCode = 1
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
