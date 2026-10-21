import request from 'supertest'
import { createApp } from '../app.js'

// Live check of the B9b user-management CRUD + guards through the REAL HTTP
// routes, as super_admin (u-sup). Uses throwaway users so the seed is untouched.

const PASSWORD = 'Portal@2026'
const SUPER_EMAIL = 'super.admin@university.edu'
const REQUESTER_EMAIL = 'rohan.mehta@university.edu'

type App = ReturnType<typeof createApp>
const rnd = () => Math.floor(1000 + Math.random() * 9000)

async function login(app: App, email: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ email, password: PASSWORD })
  if (res.status !== 200) throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.token as string
}

async function main() {
  const app = createApp()
  const su = await login(app, SUPER_EMAIL)
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` })
  let ok = true

  console.log('── GET /users ──')
  const list = await request(app).get('/users').set(auth(su))
  if (list.status !== 200) throw new Error(`GET /users failed: ${list.status} ${JSON.stringify(list.body)}`)
  const supsBefore = (list.body.users as { role: string; active: boolean }[]).filter(u => u.role === 'super_admin' && u.active).length
  console.log(`  users=${list.body.users.length} activeSuperAdmins=${supsBefore}`)

  console.log('\n── Create a coordinator_authority user ──')
  const email = `b9b.temp.${rnd()}@university.edu`
  const create = await request(app).post('/users').set(auth(su))
    .send({ name: 'B9b Temp', email, employeeId: 'T-1', department: 'MIS Department', role: 'coordinator_authority' })
  const userId = create.body.user?.id
  console.log(`  create: ${create.status} ${userId} role=${create.body.user?.role} employeeId=${create.body.user?.employeeId}`)
  ok = ok && create.status === 201 && create.body.user?.employeeId === 'T-1'

  console.log('\n── Duplicate email rejected ──')
  const dup = await request(app).post('/users').set(auth(su))
    .send({ name: 'Dup', email, role: 'requester' })
  console.log(`  duplicate email: ${dup.status === 409 ? 'blocked (409)' : 'NOT blocked (' + dup.status + ')'}`)
  ok = ok && dup.status === 409

  console.log('\n── Update (promote temp user to super_admin) ──')
  const upd = await request(app).put(`/users/${userId}`).set(auth(su))
    .send({ name: 'B9b Temp', email, employeeId: 'T-1', department: 'MIS Department', role: 'super_admin', active: true })
  console.log(`  update: ${upd.status} role=${upd.body.user?.role}`)
  ok = ok && upd.status === 200 && upd.body.user?.role === 'super_admin'

  console.log('\n── Deactivate / reactivate temp user ──')
  const off = await request(app).patch(`/users/${userId}/active`).set(auth(su)).send({ active: false })
  const on  = await request(app).patch(`/users/${userId}/active`).set(auth(su)).send({ active: true })
  console.log(`  deactivate=${off.status}(active=${off.body.user?.active}) reactivate=${on.status}(active=${on.body.user?.active})`)
  ok = ok && off.status === 200 && off.body.user?.active === false && on.status === 200 && on.body.user?.active === true

  console.log('\n── Guard: cannot deactivate self (u-sup) ──')
  const self = await request(app).patch('/users/u-sup/active').set(auth(su)).send({ active: false })
  console.log(`  deactivate self: ${self.status === 409 ? 'blocked (409)' : 'NOT blocked (' + self.status + ')'}`)
  ok = ok && self.status === 409

  console.log('\n── Guard: cannot delete self (u-sup) ──')
  const delSelf = await request(app).delete('/users/u-sup').set(auth(su))
  console.log(`  delete self: ${delSelf.status === 409 ? 'blocked (409)' : 'NOT blocked (' + delSelf.status + ')'}`)
  ok = ok && delSelf.status === 409

  console.log('\n── Clean up: delete temp user ──')
  const del = await request(app).delete(`/users/${userId}`).set(auth(su))
  console.log(`  delete temp: ${del.status} (expect 204)`)
  ok = ok && del.status === 204

  console.log('\n── Guard: non-super blocked ──')
  const req = await login(app, REQUESTER_EMAIL)
  const denied = await request(app).get('/users').set(auth(req))
  console.log(`  requester GET /users: ${denied.status === 403 ? 'blocked (403)' : 'NOT blocked (' + denied.status + ')'}`)
  ok = ok && denied.status === 403

  console.log(`\nB9b user management ${ok ? 'OK' : 'INCOMPLETE'}.`)
  if (!ok) process.exitCode = 1
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
