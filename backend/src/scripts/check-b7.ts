import request from 'supertest'
import { createApp } from '../app.js'

// Live check of the B7 availability endpoints through the REAL HTTP routes.
//   1. GET  /availability/auth-ss              (read current config)
//   2. PUT  /availability/auth-ss as admin     (change slot length + add holiday)
//   3. GET  again                              (confirm persisted)
//   4. PUT  the ORIGINAL config back           (restore)
//   5. Guard: requester gets 403 on PUT
//
// admin_dispatcher has calendar.manageAny, so it can manage any authority.

const PASSWORD = 'Portal@2026'
const ADMIN_EMAIL = 'admin.user@university.edu'       // admin_dispatcher
const REQUESTER_EMAIL = 'rohan.mehta@university.edu'  // requester (no manage)
const AUTHORITY = 'auth-ss'

type App = ReturnType<typeof createApp>

async function login(app: App, email: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ email, password: PASSWORD })
  if (res.status !== 200) throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.token as string
}

async function main() {
  const app = createApp()
  const adminToken = await login(app, ADMIN_EMAIL)
  const reqToken = await login(app, REQUESTER_EMAIL)
  let ok = true

  console.log('── 1. Read current availability ──')
  const read1 = await request(app).get(`/availability/${AUTHORITY}`).set('Authorization', `Bearer ${adminToken}`)
  if (read1.status !== 200) throw new Error(`GET failed: ${read1.status} ${JSON.stringify(read1.body)}`)
  const original = read1.body.availability
  console.log(`  slotMinutes=${original.slotMinutes} workingHours=${original.workingHours.length} holidays=${original.holidays.length}`)
  ok = ok && original.workingHours.length === 7

  console.log('\n── 2. Update (slot 45, add a holiday) as admin ──')
  const changed = {
    slotMinutes: 45,
    workingHours: original.workingHours,
    holidays: [...original.holidays, { date: '2026-12-25', label: 'check-b7 holiday' }],
  }
  const put = await request(app).put(`/availability/${AUTHORITY}`).set('Authorization', `Bearer ${adminToken}`).send(changed)
  console.log(`  PUT status=${put.status} slotMinutes=${put.body.availability?.slotMinutes} holidays=${put.body.availability?.holidays?.length}`)
  ok = ok && put.status === 200 && put.body.availability?.slotMinutes === 45

  console.log('\n── 3. Read back to confirm persistence ──')
  const read2 = await request(app).get(`/availability/${AUTHORITY}`).set('Authorization', `Bearer ${adminToken}`)
  const persisted = read2.body.availability
  const hasHoliday = (persisted.holidays as { date: string }[]).some(h => h.date === '2026-12-25')
  console.log(`  slotMinutes=${persisted.slotMinutes} hasNewHoliday=${hasHoliday ? 'yes' : 'NO'}`)
  ok = ok && persisted.slotMinutes === 45 && hasHoliday

  console.log('\n── 4. Restore the original config ──')
  const restore = await request(app).put(`/availability/${AUTHORITY}`).set('Authorization', `Bearer ${adminToken}`).send({
    slotMinutes: original.slotMinutes,
    workingHours: original.workingHours,
    holidays: original.holidays,
  })
  console.log(`  restore status=${restore.status} slotMinutes=${restore.body.availability?.slotMinutes}`)
  ok = ok && restore.status === 200 && restore.body.availability?.slotMinutes === original.slotMinutes

  console.log('\n── 5. Guard: requester cannot update ──')
  const denied = await request(app).put(`/availability/${AUTHORITY}`).set('Authorization', `Bearer ${reqToken}`).send(changed)
  console.log(`  requester PUT blocked: ${denied.status === 403 ? 'yes (403)' : 'NO (' + denied.status + ')'}`)
  ok = ok && denied.status === 403

  console.log(`\nB7 availability ${ok ? 'OK' : 'INCOMPLETE'}.`)
  if (!ok) process.exitCode = 1
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
