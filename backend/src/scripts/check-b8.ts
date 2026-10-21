import request from 'supertest'
import { createApp } from '../app.js'
import { getSupabase } from '../lib/supabase.js'

// Live check of the B8 reports endpoint through the REAL HTTP routes.
//   - super_admin (reports.viewAll): total == every appointment row in the DB
//   - coordinator_authority (reports.view): total == rows assigned to their role
//   - requester: 403
// Uses a wide date range so slot-less and dated records are all included.

const PASSWORD = 'Portal@2026'
const SUPER_EMAIL = 'super.admin@university.edu'
const STAFF_EMAIL = 'dr.amit.patel@university.edu'   // coordinator_authority
const REQUESTER_EMAIL = 'rohan.mehta@university.edu'
const RANGE = 'from=2026-01-01&to=2026-12-31'

type App = ReturnType<typeof createApp>

async function login(app: App, email: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ email, password: PASSWORD })
  if (res.status !== 200) throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.token as string
}

async function main() {
  const app = createApp()
  let ok = true

  // Ground truth straight from the DB (service role).
  const supabase = getSupabase()
  const allRows = await supabase.from('appointments').select('id, status, assigned_role')
  if (allRows.error) throw new Error(allRows.error.message)
  const dbTotal = allRows.data?.length ?? 0
  const dbScoped = (allRows.data ?? []).filter(r => r.assigned_role === 'coordinator_authority').length
  console.log(`DB: ${dbTotal} appointments, ${dbScoped} assigned to coordinator_authority.`)

  console.log('\n── super_admin (viewAll) ──')
  const superToken = await login(app, SUPER_EMAIL)
  const r1 = await request(app).get(`/reports?${RANGE}`).set('Authorization', `Bearer ${superToken}`)
  if (r1.status !== 200) throw new Error(`super report failed: ${r1.status} ${JSON.stringify(r1.body)}`)
  const rep = r1.body.report
  console.log(`  total=${rep.total} (expect ${dbTotal})  completionRate=${rep.completionRate} rejectionRate=${rep.rejectionRate} noShowRate=${rep.noShowRate}`)
  console.log('  statusBreakdown:', rep.statusBreakdown.map((s: { status: string; count: number }) => `${s.status}:${s.count}`).join(' '))
  ok = ok && rep.total === dbTotal

  console.log('\n── coordinator_authority (view, scoped) ──')
  const staffToken = await login(app, STAFF_EMAIL)
  const r2 = await request(app).get(`/reports?${RANGE}`).set('Authorization', `Bearer ${staffToken}`)
  if (r2.status !== 200) throw new Error(`staff report failed: ${r2.status} ${JSON.stringify(r2.body)}`)
  console.log(`  total=${r2.body.report.total} (expect ${dbScoped})`)
  ok = ok && r2.body.report.total === dbScoped

  console.log('\n── requester (no permission) ──')
  const reqToken = await login(app, REQUESTER_EMAIL)
  const r3 = await request(app).get(`/reports?${RANGE}`).set('Authorization', `Bearer ${reqToken}`)
  console.log(`  blocked: ${r3.status === 403 ? 'yes (403)' : 'NO (' + r3.status + ')'}`)
  ok = ok && r3.status === 403

  console.log('\n── validation: missing dates ──')
  const r4 = await request(app).get('/reports').set('Authorization', `Bearer ${superToken}`)
  console.log(`  missing from/to -> ${r4.status} (expect 400)`)
  ok = ok && r4.status === 400

  console.log(`\nB8 reports ${ok ? 'OK' : 'INCOMPLETE'}.`)
  if (!ok) process.exitCode = 1
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
