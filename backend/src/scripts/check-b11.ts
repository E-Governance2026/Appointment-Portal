import request from 'supertest'
import { createApp } from '../app.js'
import { getSupabase } from '../lib/supabase.js'

// B11 contract smoke test: verify the backend returns exactly the response
// ENVELOPES the frontend apiClient + appointmentsService expect after the
// cutover. The frontend reads res.appointments / res.appointment / res.timeline
// / res.availability / res.report / res.master / res.users and booking reads
// res.appointment. A drift here would break the UI silently, so assert the keys.

const PASSWORD = 'Portal@2026'
const SUPER = 'super.admin@university.edu'
const REQ = 'rohan.mehta@university.edu'
const ADMIN = 'admin.user@university.edu'

type App = ReturnType<typeof createApp>
async function login(app: App, email: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ email, password: PASSWORD })
  if (res.status !== 200) throw new Error(`login ${email}: ${res.status} ${JSON.stringify(res.body)}`)
  // Envelope the frontend login reads: { token, actor }.
  if (!res.body.token || !res.body.actor) throw new Error(`login envelope missing token/actor: ${JSON.stringify(res.body)}`)
  return res.body.token as string
}

async function main() {
  const app = createApp()
  const su = await login(app, SUPER)
  const req = await login(app, REQ)
  const adm = await login(app, ADMIN)
  const H = (t: string) => ({ Authorization: `Bearer ${t}` })
  let ok = true
  const created: string[] = []

  const check = (label: string, cond: boolean) => {
    console.log(`  ${cond ? 'ok ' : 'BAD'} ${label}`)
    ok = ok && cond
  }

  console.log('── Read envelopes ──')
  const list = await request(app).get('/appointments').set(H(su))
  check('GET /appointments -> { appointments: [] }', Array.isArray(list.body.appointments))

  const cal = await request(app).get('/appointments/calendar?from=2026-01-01&to=2026-12-31').set(H(su))
  check('GET /calendar -> { appointments }', Array.isArray(cal.body.appointments))

  const today = new Date().toISOString().slice(0, 10)
  const day = await request(app).get(`/appointments/day?date=${today}`).set(H(su))
  check('GET /day -> { appointments }', Array.isArray(day.body.appointments))

  const rq = await request(app).get(`/appointments/reception/queue?date=${today}`).set(H(adm))
  check('GET /reception/queue -> { queue }', Array.isArray(rq.body.queue))

  const rep = await request(app).get('/reports?from=2026-01-01&to=2026-12-31').set(H(su))
  check('GET /reports -> { report } with total', typeof rep.body.report?.total === 'number')

  const master = await request(app).get('/master').set(H(su))
  check('GET /master -> { master:{departments,types,authorities} }',
    Array.isArray(master.body.master?.departments) && Array.isArray(master.body.master?.types) && Array.isArray(master.body.master?.authorities))

  const users = await request(app).get('/users').set(H(su))
  check('GET /users -> { users }', Array.isArray(users.body.users))

  const avail = await request(app).get('/availability/auth-ss').set(H(su))
  check('GET /availability/:id -> { availability:{slotMinutes,workingHours} }',
    typeof avail.body.availability?.slotMinutes === 'number' && Array.isArray(avail.body.availability?.workingHours))

  console.log('\n── Booking submit + workflow envelopes ──')
  const submit = await request(app).post('/appointments').set(H(req))
    .set('Idempotency-Key', 'b11-' + Date.now())
    .send({ bookWith: 'auth-ss', subject: 'B11 contract', description: 'check-b11 temp.' })
  check('POST /appointments -> 201 { appointment } (has camelCase typeId/authorityName/submittedAt)',
    submit.status === 201 && !!submit.body.appointment?.id && 'authorityName' in (submit.body.appointment ?? {}) && 'submittedAt' in (submit.body.appointment ?? {}))
  const id = submit.body.appointment?.id as string
  if (id) created.push(id)

  const single = await request(app).get(`/appointments/${id}`).set(H(su))
  check('GET /appointments/:id -> { appointment }', !!single.body.appointment?.id)

  const approve = await request(app).post(`/appointments/${id}/approve`).set(H(adm)).send({ slot: { date: '2026-12-01', time: '10:00' } })
  check('POST /:id/approve -> { appointment } status approved', approve.body.appointment?.status === 'approved')

  const confirm = await request(app).post(`/appointments/${id}/confirm`).set(H(adm)).send({})
  check('POST /:id/confirm -> { appointment } status confirmed', confirm.body.appointment?.status === 'confirmed')

  const tl = await request(app).get(`/appointments/${id}/timeline`).set(H(adm))
  check('GET /:id/timeline -> { timeline } array of events', Array.isArray(tl.body.timeline) && tl.body.timeline.length > 0)

  console.log('\n── Clean up ──')
  const supabase = getSupabase()
  for (const cid of created) {
    const del = await supabase.from('appointments').delete().eq('id', cid)
    console.log(`  deleted ${cid}: ${del.error ? 'FAILED ' + del.error.message : 'yes'}`)
    ok = ok && !del.error
  }

  console.log(`\nB11 contract ${ok ? 'OK' : 'INCOMPLETE'}.`)
  if (!ok) process.exitCode = 1
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
