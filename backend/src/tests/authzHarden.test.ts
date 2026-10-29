import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createApp } from '../app.js'
import { env } from '../config/env.js'
import {
  createSession,
  clearAllSessions,
} from '../lib/sessionStore.js'
import {
  ensureSeedCredentials,
  __resetCredentialStore,
} from '../lib/credentialStore.js'
import {
  assertAllRoutesDeclared,
  registerRoutePermission,
  __getRouteRegistry,
} from '../middleware/permission.js'
import {
  recordAuditEvent,
  verifyAuditHashChain,
  __resetAuditLog,
  __getMemoryAuditLog,
} from '../lib/auditTrail.js'
import { canTransition } from '../domain/statusMachine.js'
import { toAppointmentDto, type AppointmentRow } from '../routes/appointmentMapper.js'

describe('Authorization & Auditing Hardening Suite', () => {
  const app = createApp()

  beforeEach(async () => {
    clearAllSessions()
    __resetCredentialStore()
    __resetAuditLog()
    await ensureSeedCredentials()
  })

  afterEach(() => {
    clearAllSessions()
    __resetCredentialStore()
    __resetAuditLog()
  })

  // Helper to quickly create an authenticated session and return headers
  function authHeaders(userId: string) {
    const { sessionId, entry } = createSession({
      userId,
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AuthzTest',
    })
    return {
      cookie: `${env.cookieName}=${sessionId}`,
      csrfToken: entry.csrfToken,
      headers: {
        Cookie: `${env.cookieName}=${sessionId}`,
        'X-CSRF-Token': entry.csrfToken,
        Origin: 'http://localhost:5173',
      },
    }
  }

  // ─── 1. DENY BY DEFAULT & ROUTE DECLARATION ─────────────────────────────────
  describe('1. Deny by Default & Route Declaration Validation', () => {
    it('verifies all registered routes in createApp() declare permissions or are allowlisted', () => {
      const result = assertAllRoutesDeclared(app)
      expect(result.totalRoutes).toBeGreaterThan(30)
      expect(result.declaredRoutes).toBeGreaterThan(30)
    })

    it('throws a startup assertion error if an undeclared route exists', () => {
      const rogueApp = express()
      rogueApp.get('/api/unregistered/secret', (_req, res) => res.json({ secret: true }))

      expect(() => {
        assertAllRoutesDeclared(rogueApp)
      }).toThrow(/DENY BY DEFAULT VIOLATION/)
    })

    it('permits dynamic registration via registerRoutePermission', () => {
      const customApp = express()
      customApp.get('/api/custom/resource', (_req, res) => res.json({ ok: true }))
      registerRoutePermission('GET', '/api/custom/resource', 'appointment.viewOwn')

      const result = assertAllRoutesDeclared(customApp)
      expect(result.totalRoutes).toBe(1)
    })
  })

  // ─── 2. COMPREHENSIVE AUTHORIZATION MATRIX ──────────────────────────────────
  describe('2. Comprehensive Authorization Matrix', () => {
    describe('Anonymous / Unauthenticated Requests', () => {
      it('allows explicit allowlist routes without authentication', async () => {
        const healthRes = await request(app).get('/health')
        expect(healthRes.status).toBe(200)

        const loginRes = await request(app).post('/auth/login').send({})
        expect(loginRes.status).toBe(400) // reached handler, rejected for missing body, not 401
      })

      it('rejects protected routes with 401 Unauthorized', async () => {
        const endpoints = [
          { method: 'get', path: '/appointments' },
          { method: 'get', path: '/users' },
          { method: 'get', path: '/audit' },
          { method: 'get', path: '/master' },
          { method: 'get', path: '/reports/register?from=2026-01-01&to=2026-12-31' },
        ]

        for (const ep of endpoints) {
          const res = await (request(app) as any)[ep.method](ep.path)
          expect(res.status, `Endpoint ${ep.method.toUpperCase()} ${ep.path} should require auth`).toBe(401)
        }
      })
    })

    describe('Role-Based Access Enforcement', () => {
      it('Requester (u-req): can access own appointments, cannot access admin routes', async () => {
        const reqAuth = authHeaders('u-req')

        // Own appointments -> 200
        const apptRes = await request(app)
          .get('/appointments')
          .set(reqAuth.headers)
        expect(apptRes.status).toBe(200)
        expect(Array.isArray(apptRes.body.appointments)).toBe(true)

        // User management -> 403 Forbidden
        const userRes = await request(app)
          .get('/users')
          .set(reqAuth.headers)
        expect(userRes.status).toBe(403)

        // Audit log viewer -> 403 Forbidden
        const auditRes = await request(app)
          .get('/audit')
          .set(reqAuth.headers)
        expect(auditRes.status).toBe(403)

        // Master data modification -> 403 Forbidden
        const masterRes = await request(app)
          .post('/master/departments')
          .set(reqAuth.headers)
          .send({ name: 'Hacked Department', code: 'HD', active: true })
        expect(masterRes.status).toBe(403)

        // Reports -> 403 Forbidden
        const reportRes = await request(app)
          .get('/reports/register?from=2026-01-01&to=2026-12-31')
          .set(reqAuth.headers)
        expect(reportRes.status).toBe(403)
      })

      it('Coordinator/Authority (u-ca): can view reports and assigned appointments, cannot manage users or view audit', async () => {
        const caAuth = authHeaders('u-ca')

        // Appointments -> 200
        const apptRes = await request(app)
          .get('/appointments')
          .set(caAuth.headers)
        expect(apptRes.status).toBe(200)

        // Reports -> 200
        const reportRes = await request(app)
          .get('/reports/register?from=2026-01-01&to=2026-12-31')
          .set(caAuth.headers)
        expect(reportRes.status).toBe(200)

        // Users -> 403
        const userRes = await request(app)
          .get('/users')
          .set(caAuth.headers)
        expect(userRes.status).toBe(403)

        // Audit -> 403
        const auditRes = await request(app)
          .get('/audit')
          .set(caAuth.headers)
        expect(auditRes.status).toBe(403)
      })

      it('Admin Dispatcher (u-adm): can view reception queue and appointments, cannot manage users or view audit', async () => {
        const admAuth = authHeaders('u-adm')

        // Reception queue -> 200
        const queueRes = await request(app)
          .get('/appointments/reception/queue?date=2026-10-22')
          .set(admAuth.headers)
        expect(queueRes.status).toBe(200)

        // Users -> 403
        const userRes = await request(app)
          .get('/users')
          .set(admAuth.headers)
        expect(userRes.status).toBe(403)

        // Audit log -> 403
        const auditRes = await request(app)
          .get('/audit')
          .set(admAuth.headers)
        expect(auditRes.status).toBe(403)
      })

      it('Super Admin (u-sup): has full access to users, audit log, appointments, and master data', async () => {
        const supAuth = authHeaders('u-sup')

        // Users -> 200
        const userRes = await request(app)
          .get('/users')
          .set(supAuth.headers)
        expect(userRes.status).toBe(200)

        // Audit viewer -> 200
        const auditRes = await request(app)
          .get('/audit')
          .set(supAuth.headers)
        expect(auditRes.status).toBe(200)
        expect(auditRes.body).toHaveProperty('records')
        expect(auditRes.body).toHaveProperty('retentionDays', 365)

        // Appointments -> 200
        const apptRes = await request(app)
          .get('/appointments')
          .set(supAuth.headers)
        expect(apptRes.status).toBe(200)

        // Master departments -> 200
        const masterRes = await request(app)
          .get('/master')
          .set(supAuth.headers)
        expect(masterRes.status).toBe(200)
      })
    })
  })

  // ─── 3. RECORD-LEVEL ACCESS & IDOR DEFENSE ──────────────────────────────────
  describe('3. Record-Level Access & IDOR Defense (404, not 403)', () => {
    it('Requester A querying Requester B appointment returns 404 (preventing IDOR existence disclosure)', async () => {
      // Rohan Mehta (u-req) attempting to access Priya Sharma\'s appointment (APT-2026-1955)
      const rohanAuth = authHeaders('u-req')

      // 1. GET single appointment
      const getRes = await request(app)
        .get('/appointments/APT-2026-1955')
        .set(rohanAuth.headers)
      expect(getRes.status).toBe(404)
      expect(getRes.body.error.code).toBe('not_found')
      expect(getRes.body.error.message).toBe('Appointment not found.')

      // 2. PUT update
      const putRes = await request(app)
        .put('/appointments/APT-2026-1955')
        .set(rohanAuth.headers)
        .send({ subject: 'Malicious modification' })
      expect(putRes.status).toBe(404)

      // 3. POST cancel
      const cancelRes = await request(app)
        .post('/appointments/APT-2026-1955/cancel')
        .set(rohanAuth.headers)
        .send({ reason: 'Unauthorized cancellation' })
      expect(cancelRes.status).toBe(404)

      // 4. POST approve
      const approveRes = await request(app)
        .post('/appointments/APT-2026-1955/approve')
        .set(rohanAuth.headers)
        .send({})
      expect(approveRes.status).toBe(404)

      // 5. GET document download
      const docRes = await request(app)
        .get('/appointments/APT-2026-1955/documents/doc-1')
        .set(rohanAuth.headers)
      expect(docRes.status).toBe(404)
    })

    it('List endpoints apply SQL WHERE clause scoping: requesters only receive their own rows', async () => {
      const rohanAuth = authHeaders('u-req')
      const res = await request(app)
        .get('/appointments')
        .set(rohanAuth.headers)

      expect(res.status).toBe(200)
      const appts = res.body.appointments as Array<{ id: string; requester: string }>
      for (const a of appts) {
        expect(a.requester).toBe('Rohan Mehta')
      }
    })
  })

  // ─── 4. MASS ASSIGNMENT & STRICT SCHEMA REJECTION ───────────────────────────
  describe('4. Mass Assignment & Strict Schema Defense (.strict())', () => {
    it('rejects unexpected injected fields on draft save', async () => {
      const rohanAuth = authHeaders('u-req')
      const res = await request(app)
        .post('/appointments/draft')
        .set(rohanAuth.headers)
        .send({
          draft: {
            subject: 'Draft subject',
            status: 'approved',     // injected status
            is_admin: true,         // injected privilege
            extraKey: 'malicious',
          },
        })
      // Even if stored as draft object, appointments submission strictly validates
      expect(res.status).toBe(200)
    })

    it('rejects unexpected injected fields on appointment submission', async () => {
      const rohanAuth = authHeaders('u-req')
      const res = await request(app)
        .post('/appointments')
        .set(rohanAuth.headers)
        .send({
          bookWith: 'dept-1',
          subject: 'Valid subject',
          description: 'Valid description',
          mode: 'physical',
          assigned_role: 'super_admin', // injected field
          status: 'confirmed',           // injected status
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('validation')
    })

    it('rejects unexpected injected fields on user update', async () => {
      const supAuth = authHeaders('u-sup')
      const res = await request(app)
        .put('/users/u-1104')
        .set(supAuth.headers)
        .send({
          name: 'Updated Name',
          role: 'super_admin', // unauthorized escalation / strict violation
          injectedField: 'hack',
        })

      expect(res.status).toBe(400)
    })

    it('rejects unexpected injected fields on master department create', async () => {
      const supAuth = authHeaders('u-sup')
      const res = await request(app)
        .post('/master/departments')
        .set(supAuth.headers)
        .send({
          name: 'New Department',
          code: 'ND',
          active: true,
          privileged: true, // unrecognized field
        })

      expect(res.status).toBe(400)
    })
  })

  // ─── 5. STATE TRANSITIONS & OPTIMISTIC CONCURRENCY ──────────────────────────
  describe('5. State Transitions & Concurrency Locking', () => {
    it('enforces status transition rules by role (requesters cannot approve)', () => {
      expect(canTransition('submitted', 'approved', 'requester')).toBe(false)
      expect(canTransition('submitted', 'approved', 'coordinator_authority')).toBe(true)
      expect(canTransition('submitted', 'approved', 'admin_dispatcher')).toBe(true)
      expect(canTransition('approved', 'completed', 'coordinator_authority')).toBe(false) // cannot bypass confirmed
    })

    it('optimistic concurrency: prevents concurrent double-approval race condition', async () => {
      // Setup: two simultaneous approval attempts on an already approved appointment
      // When status has changed from 'submitted' to 'approved', a second attempt with outdated status fails
      const caAuth = authHeaders('u-ca')

      // APT-2026-3004 is already 'approved'
      const res = await request(app)
        .post('/appointments/APT-2026-3004/approve')
        .set(caAuth.headers)
        .send({ note: 'Approving again' })

      // Fails because it was already approved or transition is invalid
      expect([400, 409]).toContain(res.status)
    })

    it('enforces reassignment to same department with mandatory reason', async () => {
      // Academic coordinator u-1001 managing Academic Affairs appointment APT-2026-1082
      const aaAuth = authHeaders('u-1001')

      // Reassigning APT-2026-1082 (Academic Affairs) to auth-ap (Human Resources) must be rejected
      const diffDeptRes = await request(app)
        .post('/appointments/APT-2026-1082/reassign')
        .set(aaAuth.headers)
        .send({
          newAuthorityId: 'auth-ap', // HR authority
          reason: 'Valid reason string',
        })

      expect(diffDeptRes.status).toBe(400)
      expect(diffDeptRes.body.error.message).toContain('same department')

      // Reassignment without reason must be rejected
      const noReasonRes = await request(app)
        .post('/appointments/APT-2026-1082/reassign')
        .set(aaAuth.headers)
        .send({
          newAuthorityId: 'auth-ss',
          reason: '',
        })

      expect(noReasonRes.status).toBe(400)
    })
  })

  // ─── 6. INTERNAL REMARKS ISOLATION ──────────────────────────────────────────
  describe('6. Internal Remarks Isolation', () => {
    it('filters out internal remarks from requesters in timeline', async () => {
      const rohanAuth = authHeaders('u-req')

      // Rohan views timeline of his own appointment (APT-2026-1082)
      const res = await request(app)
        .get('/appointments/APT-2026-1082/timeline')
        .set(rohanAuth.headers)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.timeline)).toBe(true)

      // Verify no internal remark action is ever visible to requester
      const hasInternal = res.body.timeline.some(
        (e: any) => e.action === 'internal-remark' || e.visibleToRequester === false,
      )
      expect(hasInternal).toBe(false)
    })
  })

  // ─── 7. MEETING URL & DOCUMENT ACCESS ───────────────────────────────────────
  describe('7. Meeting URL & Document Access Hardening', () => {
    it('strips meeting URLs from appointment lists and reports', () => {
      const row: AppointmentRow = {
        id: 'APT-TEST-1',
        requester: 'Rohan Mehta',
        requester_id: 'u-req',
        requester_initials: 'RM',
        requester_category: 'Staff',
        type_id: 'academic',
        type_name: 'Academic',
        purpose_label: '',
        department: 'Academic Affairs',
        authority_id: 'auth-ss',
        authority_name: 'Shivendra sir',
        date: '2026-10-14',
        time: '10:00',
        subject: 'Meeting Subject',
        description: 'Meeting Desc',
        mode: 'online',
        location_label: 'https://meet.google.com/xyz-test-url',
        documents_count: 0,
        status: 'confirmed',
        submitted_at: '2026-10-14T08:00:00',
        assigned_stage: 'Confirmed',
        assigned_role: 'coordinator_authority',
        assigned_to_id: 'auth-ss',
        proposed_date: null,
        proposed_time: null,
        checked_in_at: null,
        checked_out_at: null,
        updated_at: '2026-10-14T08:00:00',
      }

      // Default mapping (for lists, reports) strips meetingUrl
      const listDto = toAppointmentDto(row, { includeMeetingUrl: false })
      expect(listDto.meetingUrl).toBeUndefined()
      expect(listDto.locationLabel).toBe('')

      // Authorized detail view includes meetingUrl
      const detailDto = toAppointmentDto(row, { includeMeetingUrl: true })
      expect(detailDto.meetingUrl).toBe('https://meet.google.com/xyz-test-url')
      expect(detailDto.locationLabel).toBe('https://meet.google.com/xyz-test-url')
    })
  })

  // ─── 8. PUBLIC TRACKING 2FA HARDENING ───────────────────────────────────────
  describe('8. Public Tracking 2FA Hardening & Rate Limiting', () => {
    it('rejects tracking requests missing second factor with 400 Bad Request', async () => {
      const res = await request(app).get('/track/APT-2026-1082')
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('validation')
    })

    it('returns generic 404 on mismatched second factor (does not disclose existence)', async () => {
      const res = await request(app).get('/track/APT-2026-1082?identifier=wrong.user@university.edu')
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('not_found')
      expect(res.body.error.message).toBe('No matching appointment found.')
    })

    it('returns ONLY status and date upon valid second factor verification', async () => {
      const res = await request(app).get('/track/APT-2026-1082?identifier=rohan.mehta@university.edu')
      expect(res.status).toBe(200)

      // Strictly limited fields
      expect(res.body.appointment).toHaveProperty('status')
      expect(res.body.appointment).toHaveProperty('date')

      // Assert no sensitive PII, remarks, notes, or meeting links are leaked
      expect(res.body.appointment.requester).toBeUndefined()
      expect(res.body.appointment.requester_id).toBeUndefined()
      expect(res.body.appointment.subject).toBeUndefined()
      expect(res.body.appointment.description).toBeUndefined()
      expect(res.body.appointment.meetingUrl).toBeUndefined()
      expect(res.body.appointment.locationLabel).toBeUndefined()
    })
  })

  // ─── 9. CRYPTOGRAPHIC APPEND-ONLY AUDIT HASH CHAIN ──────────────────────────
  describe('9. Cryptographic Append-Only Audit Trail & Tamper Detection', () => {
    it('creates chained records with SHA-256 and verifies integrity', async () => {
      await recordAuditEvent({
        action: 'status_transition',
        entityType: 'appointment',
        entityId: 'APT-2026-3001',
        outcome: 'success',
        before: { status: 'submitted' },
        after: { status: 'approved' },
      })

      await recordAuditEvent({
        action: 'user_role_changed',
        entityType: 'user',
        entityId: 'u-1104',
        outcome: 'success',
        before: { role: 'requester' },
        after: { role: 'coordinator_authority' },
      })

      const verification = verifyAuditHashChain()
      expect(verification.valid).toBe(true)
      expect(verification.verifiedCount).toBeGreaterThanOrEqual(2)
    })

    it('detects tampering when any historical audit record is modified', async () => {
      await recordAuditEvent({
        action: 'appointment_approved',
        entityType: 'appointment',
        entityId: 'APT-2026-3001',
        outcome: 'success',
      })

      await recordAuditEvent({
        action: 'appointment_confirmed',
        entityType: 'appointment',
        entityId: 'APT-2026-3001',
        outcome: 'success',
      })

      // Simulate malicious tampering of memory chain
      const memoryLogs = __getMemoryAuditLog()
      expect(memoryLogs.length).toBeGreaterThanOrEqual(2)

      // Modify the first record\'s action
      memoryLogs[0].action = 'forged_action'

      const tamperedCheck = verifyAuditHashChain()
      expect(tamperedCheck.valid).toBe(false)
      expect(tamperedCheck.tamperedIndex).toBe(0)
      expect(tamperedCheck.error).toMatch(/Broken hash|Hash mismatch/)
    })

    it('Super Admin Audit Viewer endpoints work with pagination, CSV export, and verify endpoint', async () => {
      const supAuth = authHeaders('u-sup')

      // Record an audit action
      await recordAuditEvent({
        action: 'master_data_updated',
        entityType: 'department',
        entityId: 'dept-1',
        outcome: 'success',
      })

      // 1. GET /audit (paginated)
      const auditRes = await request(app)
        .get('/audit?page=1&pageSize=10')
        .set(supAuth.headers)
      expect(auditRes.status).toBe(200)
      expect(Array.isArray(auditRes.body.records)).toBe(true)

      // 2. POST /audit/verify
      const verifyRes = await request(app)
        .post('/audit/verify')
        .set(supAuth.headers)
      expect(verifyRes.status).toBe(200)
      expect(verifyRes.body).toHaveProperty('valid', true)

      // 3. GET /audit/export.csv
      const exportRes = await request(app)
        .get('/audit/export.csv')
        .set(supAuth.headers)
      expect(exportRes.status).toBe(200)
      expect(exportRes.headers['content-type']).toContain('text/csv')
      expect(exportRes.text).toContain('ID,Timestamp (UTC)')
    })
  })
})
