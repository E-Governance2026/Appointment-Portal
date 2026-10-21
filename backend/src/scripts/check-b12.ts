import request from 'supertest'
import { createApp } from '../app.js'
import { getSupabase } from '../lib/supabase.js'

// Live check of the B12 workflow actions through the REAL HTTP routes.
// Chain A: submit -> request-info -> provide-info -> approve -> propose-reschedule
//          -> respond accept -> confirmed.
// Chain B: submit -> cancel.
// Chain C: submit -> forward -> internal-remark.

const PASSWORD = 'Portal@2026'
const REQ = 'rohan.mehta@university.edu'
const STAFF = 'dr.amit.patel@university.edu'   // coordinator_authority
const ADMIN = 'admin.user@university.edu'      // admin_dispatcher

type App = ReturnType<typeof createApp>
async function login(app: App, email: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ email, password: PASSWORD })
  if (res.status !== 200) throw new Error(`login ${email}: ${res.status}`)
  return res.body.token as string
}

async function main() {
  const app = createApp()
  const req = await login(app, REQ)
  const staff = await login(app, STAFF)
  const admin = await login(app, ADMIN)
  const H = (t: string) => ({ Authorization: `Bearer ${t}` })
  const created: string[] = []
  let ok = true
  const check = (label: string, cond: boolean) => { console.log(`  ${cond ? 'ok ' : 'BAD'} ${label}`); ok = ok && cond }

  async function submit(subject: string): Promise<string> {
    const r = await request(app).post('/appointments').set(H(req))
      .send({ bookWith: 'auth-ss', subject, description: 'check-b12 temp.' })
    if (r.status !== 201) throw new Error(`submit: ${r.status} ${JSON.stringify(r.body)}`)
    created.push(r.body.appointment.id)
    return r.body.appointment.id
  }

  console.log('── Chain A: info round-trip + approve + reschedule + accept ──')
  const a = await submit('B12 chain A')
  const ri = await request(app).post(`/appointments/${a}/request-info`).set(H(staff)).send({ message: 'Please attach your ID.' })
  check('request-info -> additional-info', ri.body.appointment?.status === 'additional-info')
  const pi = await request(app).post(`/appointments/${a}/provide-info`).set(H(req)).send({ message: 'ID attached.' })
  check('provide-info -> submitted', pi.body.appointment?.status === 'submitted')
  const ap = await request(app).post(`/appointments/${a}/approve`).set(H(staff)).send({ slot: { date: '2026-12-01', time: '10:00' } })
  check('approve -> approved', ap.body.appointment?.status === 'approved')
  const pr = await request(app).post(`/appointments/${a}/propose-reschedule`).set(H(staff)).send({ proposedDate: '2026-12-05', proposedTime: '14:00', note: 'Clash.' })
  check('propose-reschedule -> rescheduled + proposed set', pr.body.appointment?.status === 'rescheduled' && pr.body.appointment?.proposedDate === '2026-12-05')
  const rr = await request(app).post(`/appointments/${a}/respond-reschedule`).set(H(req)).send({ decision: 'accept' })
  check('respond accept -> confirmed + slot applied', rr.body.appointment?.status === 'confirmed' && rr.body.appointment?.date === '2026-12-05' && rr.body.appointment?.time === '14:00')

  console.log('\n── Chain B: cancel ──')
  const b = await submit('B12 chain B')
  const cancel = await request(app).post(`/appointments/${b}/cancel`).set(H(staff)).send({ reason: 'Requested withdrawal.' })
  check('cancel -> cancelled', cancel.body.appointment?.status === 'cancelled')
  const cancelNoReason = await request(app).post(`/appointments/${b}/cancel`).set(H(staff)).send({})
  check('cancel without reason rejected (400/409)', cancelNoReason.status === 400 || cancelNoReason.status === 409)

  console.log('\n── Chain C: forward + internal remark ──')
  const c = await submit('B12 chain C')
  const fwd = await request(app).post(`/appointments/${c}/forward`).set(H(admin)).send({ toRole: 'coordinator_authority' })
  check('forward -> assignedRole coordinator_authority', fwd.body.appointment?.assignedRole === 'coordinator_authority')
  const remark = await request(app).post(`/appointments/${c}/internal-remark`).set(H(staff)).send({ text: 'Spoke to the dean.' })
  check('internal-remark -> { event } visibleToRequester=false', remark.status === 201 && remark.body.event?.visibleToRequester === false)
  // Requester must NOT see the internal remark in their timeline.
  const reqTimeline = await request(app).get(`/appointments/${c}/timeline`).set(H(req))
  const reqSeesRemark = (reqTimeline.body.timeline as { action: string }[]).some(e => e.action === 'internal-remark')
  check('requester timeline hides the internal remark', !reqSeesRemark)

  console.log('\n── Guard: requester cannot forward ──')
  const denied = await request(app).post(`/appointments/${c}/forward`).set(H(req)).send({ toRole: 'admin_dispatcher' })
  check('requester forward blocked 403', denied.status === 403)

  console.log('\n── Clean up ──')
  const supabase = getSupabase()
  for (const id of created) {
    const del = await supabase.from('appointments').delete().eq('id', id)
    console.log(`  deleted ${id}: ${del.error ? 'FAILED ' + del.error.message : 'yes'}`)
    ok = ok && !del.error
  }

  console.log(`\nB12 workflow ${ok ? 'OK' : 'INCOMPLETE'}.`)
  if (!ok) process.exitCode = 1
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
