import request from 'supertest'
import { createApp } from '../app.js'

// Live check of the B9a master-data CRUD through the REAL HTTP routes, as
// super_admin. Creates a throwaway department + type + authority (wired
// together), updates them, proves the in-use delete guards fire, then cleans up
// in dependency order. Also confirms a non-super user is blocked.

const PASSWORD = 'Portal@2026'
const SUPER_EMAIL = 'super.admin@university.edu'
const REQUESTER_EMAIL = 'rohan.mehta@university.edu'

type App = ReturnType<typeof createApp>

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

  console.log('── GET /master ──')
  const g = await request(app).get('/master').set(auth(su))
  if (g.status !== 200) throw new Error(`GET /master failed: ${g.status} ${JSON.stringify(g.body)}`)
  console.log(`  departments=${g.body.master.departments.length} types=${g.body.master.types.length} authorities=${g.body.master.authorities.length}`)

  console.log('\n── Create department + type + authority ──')
  const dep = await request(app).post('/master/departments').set(auth(su)).send({ name: 'B9a Temp Dept', code: 'B9A' })
  const depName = dep.body.department?.name
  console.log(`  dept: ${dep.status} ${dep.body.department?.id}`)
  ok = ok && dep.status === 201

  const typ = await request(app).post('/master/types').set(auth(su)).send({ name: 'B9a Temp Type', defaultDurationMinutes: 25 })
  const typeId = typ.body.type?.id
  console.log(`  type: ${typ.status} ${typeId} duration=${typ.body.type?.defaultDurationMinutes}`)
  ok = ok && typ.status === 201 && typ.body.type?.defaultDurationMinutes === 25

  const aut = await request(app).post('/master/authorities').set(auth(su))
    .send({ name: 'B9a Temp Authority', department: depName, typeIds: [typeId] })
  const authId = aut.body.authority?.id
  console.log(`  authority: ${aut.status} ${authId} typeIds=${JSON.stringify(aut.body.authority?.typeIds)}`)
  ok = ok && aut.status === 201 && JSON.stringify(aut.body.authority?.typeIds) === JSON.stringify([typeId])

  console.log('\n── Update authority (change designation) ──')
  const upd = await request(app).put(`/master/authorities/${authId}`).set(auth(su))
    .send({ name: 'B9a Temp Authority', designation: 'Updated role', department: depName, typeIds: [typeId] })
  console.log(`  update: ${upd.status} designation=${upd.body.authority?.designation}`)
  ok = ok && upd.status === 200 && upd.body.authority?.designation === 'Updated role'

  console.log('\n── In-use guards ──')
  const delDepBlocked = await request(app).delete(`/master/departments/${dep.body.department.id}`).set(auth(su))
  console.log(`  delete dept while authority references it: ${delDepBlocked.status === 409 ? 'blocked (409)' : 'NOT blocked (' + delDepBlocked.status + ')'}`)
  ok = ok && delDepBlocked.status === 409

  const delTypeBlocked = await request(app).delete(`/master/types/${typeId}`).set(auth(su))
  console.log(`  delete type while authority handles it: ${delTypeBlocked.status === 409 ? 'blocked (409)' : 'NOT blocked (' + delTypeBlocked.status + ')'}`)
  ok = ok && delTypeBlocked.status === 409

  console.log('\n── Clean up (authority -> type -> dept) ──')
  const dA = await request(app).delete(`/master/authorities/${authId}`).set(auth(su))
  console.log(`  delete authority: ${dA.status} (expect 204)`)
  ok = ok && dA.status === 204
  const dT = await request(app).delete(`/master/types/${typeId}`).set(auth(su))
  console.log(`  delete type: ${dT.status} (expect 204)`)
  ok = ok && dT.status === 204
  const dD = await request(app).delete(`/master/departments/${dep.body.department.id}`).set(auth(su))
  console.log(`  delete dept: ${dD.status} (expect 204)`)
  ok = ok && dD.status === 204

  console.log('\n── Guard: non-super blocked ──')
  const req = await login(app, REQUESTER_EMAIL)
  const denied = await request(app).get('/master').set(auth(req))
  console.log(`  requester GET /master: ${denied.status === 403 ? 'blocked (403)' : 'NOT blocked (' + denied.status + ')'}`)
  ok = ok && denied.status === 403

  console.log(`\nB9a master data ${ok ? 'OK' : 'INCOMPLETE'}.`)
  if (!ok) process.exitCode = 1
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
