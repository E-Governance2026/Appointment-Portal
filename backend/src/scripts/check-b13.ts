import request from 'supertest'
import { createApp } from '../app.js'

// Live check of the B13 dashboard + public track endpoints.

const PASSWORD = 'Portal@2026'
const SUPER = 'super.admin@university.edu'
const REQ = 'rohan.mehta@university.edu'

type App = ReturnType<typeof createApp>
async function login(app: App, email: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ email, password: PASSWORD })
  if (res.status !== 200) throw new Error(`login ${email}: ${res.status}`)
  return res.body.token as string
}

async function main() {
  const app = createApp()
  let ok = true
  const check = (label: string, cond: boolean) => { console.log(`  ${cond ? 'ok ' : 'BAD'} ${label}`); ok = ok && cond }

  const su = await login(app, SUPER)
  const req = await login(app, REQ)

  console.log('── Dashboard stats (scoped) ──')
  const suStats = await request(app).get('/dashboard/stats').set({ Authorization: `Bearer ${su}` })
  check('super_admin /dashboard/stats -> { stats } with numeric fields',
    suStats.status === 200 &&
    typeof suStats.body.stats?.total === 'number' &&
    typeof suStats.body.stats?.awaitingApproval === 'number' &&
    typeof suStats.body.stats?.confirmed === 'number' &&
    typeof suStats.body.stats?.todayCount === 'number')
  console.log(`     super stats: ${JSON.stringify(suStats.body.stats)}`)

  const reqStats = await request(app).get('/dashboard/stats').set({ Authorization: `Bearer ${req}` })
  check('requester /dashboard/stats -> 200', reqStats.status === 200)
  console.log(`     requester stats: ${JSON.stringify(reqStats.body.stats)}`)
  // The requester sees only their own rows, so their total should be <= the
  // super admin's total (super sees everything).
  check('requester total <= super_admin total (scoping works)',
    reqStats.body.stats.total <= suStats.body.stats.total)

  const noAuth = await request(app).get('/dashboard/stats')
  check('dashboard stats requires auth (401 without token)', noAuth.status === 401)

  console.log('\n── Public track (no auth) ──')
  const track = await request(app).get('/track/APT-2026-3001')   // seeded appointment
  check('GET /track/:id works WITHOUT a token -> 200 { appointment }',
    track.status === 200 && track.body.appointment?.id === 'APT-2026-3001')
  console.log(`     track fields: ${Object.keys(track.body.appointment ?? {}).join(', ')}`)
  check('track returns status + authorityName + typeName',
    !!track.body.appointment?.status && 'authorityName' in (track.body.appointment ?? {}) && 'typeName' in (track.body.appointment ?? {}))
  // The public track view must NOT leak requester PII or internal fields.
  const leaked = ['requester', 'requesterId', 'description', 'assignedRole', 'assignedToId']
    .filter(k => k in (track.body.appointment ?? {}))
  check('track does not leak requester/internal fields', leaked.length === 0)

  const trackMissing = await request(app).get('/track/NOPE-0000')
  check('track unknown id -> 404', trackMissing.status === 404)

  console.log(`\nB13 ${ok ? 'OK' : 'INCOMPLETE'}.`)
  if (!ok) process.exitCode = 1
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
