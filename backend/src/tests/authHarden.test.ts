import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import * as OTPAuth from 'otpauth'
import { createApp } from '../app.js'
import {
  clearAllSessions, getSession,
} from '../lib/sessionStore.js'
import {
  hashPassword, verifyPassword, validatePasswordPolicy,
  getDummyHash, needsRehash,
} from '../lib/password.js'
import {
  getCredential, ensureSeedCredentials,
  unlockAccount, __resetCredentialStore,
} from '../lib/credentialStore.js'

describe('Authentication Hardening Suite', () => {
  const app = createApp()

  const superAdmin = {
    email: 'super.admin@university.edu',
    password: 'Portal@2026',
  }

  beforeEach(async () => {
    clearAllSessions()
    __resetCredentialStore()
    await ensureSeedCredentials()
  })

  afterEach(() => {
    clearAllSessions()
    __resetCredentialStore()
  })

  // Helper to log in as super admin
  async function loginAsSuperAdmin() {
    const res = await request(app)
      .post('/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send(superAdmin)

    expect(res.status).toBe(200)
    const cookies = res.headers['set-cookie']
    const cookie = Array.isArray(cookies) ? cookies[0] : cookies
    return {
      cookie,
      csrfToken: res.body.csrfToken,
      sessionId: res.body.sessionId,
      user: res.body.actor,
    }
  }

  describe('1. Passwords & Argon2id', () => {
    it('hashes passwords with argon2id and verifies correctly', async () => {
      const plain = 'SecurePassword2026!#'
      const hashed = await hashPassword(plain)
      expect(hashed).toContain('$argon2id$')
      expect(hashed).toContain('m=19456')
      expect(hashed).toContain('t=2')
      expect(hashed).toContain('p=1')

      const isValid = await verifyPassword(hashed, plain)
      expect(isValid.valid).toBe(true)

      const isInvalid = await verifyPassword(hashed, 'WrongPassword123!')
      expect(isInvalid.valid).toBe(false)
    })

    it('identifies outdated password hashes for transparent rehashing', async () => {
      const plain = 'LegacyPassword123!'
      // Simulate outdated hash format
      const isOutdated = needsRehash('$argon2i$v=19$m=4096,t=3,p=1$fake$fake')
      expect(isOutdated).toBe(true)

      const freshHash = await hashPassword(plain)
      expect(needsRehash(freshHash)).toBe(false)
    })

    it('enforces password policy (length 12-128, blacklist, personal info)', () => {
      const userInfo = {
        employeeId: 'EMP-2024-001',
        email: 'rohan.mehta@university.edu',
        name: 'Rohan Mehta',
      }

      // Too short (< 12 chars)
      const shortRes = validatePasswordPolicy('Short1!', userInfo)
      expect(shortRes.valid).toBe(false)
      expect(shortRes.errors[0]).toContain('at least 12 characters')

      // Too long (> 128 chars)
      const longRes = validatePasswordPolicy('a'.repeat(129), userInfo)
      expect(longRes.valid).toBe(false)
      expect(longRes.errors[0]).toContain('must not exceed 128 characters')

      // Blacklisted common password
      const commonRes = validatePasswordPolicy('password12345', userInfo)
      expect(commonRes.valid).toBe(false)
      expect(commonRes.errors[0]).toContain('too common')

      // Contains employee ID
      const empRes = validatePasswordPolicy('MySecretEMP-2024-001Pass', userInfo)
      expect(empRes.valid).toBe(false)
      expect(empRes.errors[0]).toContain('employee ID')

      // Contains email name
      const emailRes = validatePasswordPolicy('rohan.mehtaSecret99', userInfo)
      expect(emailRes.valid).toBe(false)
      expect(emailRes.errors[0]).toContain('email')

      // Contains full name
      const nameRes = validatePasswordPolicy('MyRohanMehtaSecretPass', { name: 'Rohan Mehta' })
      expect(nameRes.valid).toBe(false)
      expect(nameRes.errors.some(e => e.includes('name'))).toBe(true)

      // Valid strong passphrase
      const validRes = validatePasswordPolicy('Correct-Horse-Battery-Staple-2026', userInfo)
      expect(validRes.valid).toBe(true)
      expect(validRes.errors).toHaveLength(0)
    })

    it('admin-created users receive temporary password and mustChangePassword is enforced', async () => {
      const admin = await loginAsSuperAdmin()

      // Super admin creates user
      const uniqueId = Date.now().toString().slice(-6)
      const testEmail = `priya.test-${uniqueId}@university.edu`
      const createRes = await request(app)
        .post('/users')
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrfToken)
        .set('Origin', 'http://localhost:5173')
        .send({
          name: 'Priya Sharma Testing',
          email: testEmail,
          role: 'coordinator_authority',
          department: 'Academic Affairs',
          employeeId: `EMP-T-${uniqueId}`,
        })

      expect(createRes.status).toBe(201)
      const tempPassword = createRes.body.temporaryPassword
      expect(tempPassword).toBeDefined()
      expect(tempPassword.length).toBeGreaterThanOrEqual(16)

      // User logs in with temporary password
      const loginRes = await request(app)
        .post('/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({
          email: testEmail,
          password: tempPassword,
        })

      expect(loginRes.status).toBe(200)
      expect(loginRes.body.mustChangePassword).toBe(true)
      const cookies = loginRes.headers['set-cookie']
      const userCookie = Array.isArray(cookies) ? cookies[0] : cookies
      const userCsrf = loginRes.body.csrfToken

      // Accessing regular protected API is blocked until password is changed
      const blockedRes = await request(app)
        .get('/auth/session')
        .set('Cookie', userCookie)

      expect(blockedRes.status).toBe(403)
      expect(blockedRes.body.error.code).toBe('password_change_required')

      // Change password with valid new password
      const changeRes = await request(app)
        .post('/auth/change-password')
        .set('Cookie', userCookie)
        .set('X-CSRF-Token', userCsrf)
        .set('Origin', 'http://localhost:5173')
        .send({
          currentPassword: tempPassword,
          newPassword: 'MyNewUniquePassword2026#',
        })

      expect(changeRes.status).toBe(200)
      expect(changeRes.body.success).toBe(true)

      // Subsequent access succeeds
      const allowedRes = await request(app)
        .get('/auth/session')
        .set('Cookie', userCookie)

      expect(allowedRes.status).toBe(200)
      expect(allowedRes.body.authenticated).toBe(true)
    })
  })

  describe('2. Login Abuse Protection & Timing Equalization', () => {
    it('timing equalization: dummy hash is executed for non-existent users', async () => {
      const dummy = await getDummyHash()
      expect(dummy).toContain('$argon2id$')

      const start = Date.now()
      const res = await request(app)
        .post('/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({
          email: 'nonexistent.user@university.edu',
          password: 'SomeRandomPassword123!',
        })
      const duration = Date.now() - start

      expect(res.status).toBe(401)
      expect(res.body.error.message).toBe('Employee ID or password is incorrect. Try again later.')
      expect(duration).toBeGreaterThan(10)
    })

    it('locks account after 5 failed attempts with generic message and super admin can unlock', async () => {
      const testEmail = 'vikram.singh@university.edu'
      const testUserId = 'u-1104'

      // 4 consecutive bad attempts
      for (let i = 0; i < 4; i++) {
        const failRes = await request(app)
          .post('/auth/login')
          .set('Origin', 'http://localhost:5173')
          .send({
            email: testEmail,
            password: 'WrongPassword999!',
          })
        expect(failRes.status).toBe(401)
        expect(failRes.body.error.message).toBe('Employee ID or password is incorrect. Try again later.')
      }

      // 5th bad attempt triggers lockout
      const lockRes = await request(app)
        .post('/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({
          email: testEmail,
          password: 'WrongPassword999!',
        })
      expect(lockRes.status).toBe(401)
      expect(lockRes.body.error.message).toBe('Employee ID or password is incorrect. Try again later.')

      // Even correct password is now blocked while locked
      const blockedRes = await request(app)
        .post('/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({
          email: testEmail,
          password: 'Portal@2026',
        })
      expect(blockedRes.status).toBe(401)
      expect(blockedRes.body.error.message).toBe('Employee ID or password is incorrect. Try again later.')

      // Super admin unlocks the account
      const userCred = getCredential(testUserId)
      expect(userCred?.lockedUntil).not.toBeNull()

      unlockAccount(testUserId, 'admin', 'super_admin')

      // Login succeeds now
      const successRes = await request(app)
        .post('/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({
          email: testEmail,
          password: 'Portal@2026',
        })
      expect(successRes.status).toBe(200)
    })
  })

  describe('3. Password Reset & Session Invalidation', () => {
    it('admin reset generates temporary password and invalidates active sessions', async () => {
      const admin = await loginAsSuperAdmin()

      // Log in another user to establish a session
      const userRes = await request(app)
        .post('/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({
          email: 'vikram.singh@university.edu',
          password: 'Portal@2026',
        })
      expect(userRes.status).toBe(200)
      const cookies = userRes.headers['set-cookie']
      const userCookie = Array.isArray(cookies) ? cookies[0] : cookies
      const userSessionId = userRes.body.sessionId

      expect(getSession(userSessionId)).not.toBeNull()

      // Admin resets user's password
      const resetRes = await request(app)
        .post('/users/u-1104/reset-password')
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrfToken)
        .set('Origin', 'http://localhost:5173')

      expect(resetRes.status).toBe(200)
      expect(resetRes.body.temporaryPassword).toBeDefined()

      // User's previous session must be invalidated
      expect(getSession(userSessionId)).toBeNull()

      // User's previous cookie is now rejected
      const checkRes = await request(app)
        .get('/auth/session')
        .set('Cookie', userCookie)
      expect(checkRes.status).toBe(401)
    })
  })

  describe('4. Multi-Factor Authentication (TOTP & Recovery Codes)', () => {
    it('enrolls TOTP, validates OTP, generates 10 recovery codes, and handles pending MFA state', async () => {
      const admin = await loginAsSuperAdmin()

      // 1. Setup TOTP
      const setupRes = await request(app)
        .post('/auth/mfa/setup')
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrfToken)
        .set('Origin', 'http://localhost:5173')

      expect(setupRes.status).toBe(200)
      expect(setupRes.body.secretBase32).toBeDefined()
      expect(setupRes.body.qrCodeDataUrl).toContain('data:image/png;base64,')

      const secret = setupRes.body.secretBase32
      const totp = new OTPAuth.TOTP({
        issuer: 'MIS Appointment Portal',
        label: superAdmin.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      })
      const validCode = totp.generate()

      // 2. Confirm TOTP
      const confirmRes = await request(app)
        .post('/auth/mfa/confirm')
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrfToken)
        .set('Origin', 'http://localhost:5173')
        .send({
          secretBase32: secret,
          code: validCode,
        })

      expect(confirmRes.status).toBe(200)
      expect(confirmRes.body.recoveryCodes).toHaveLength(10)
      const recoveryCodes: string[] = confirmRes.body.recoveryCodes

      // 3. User logs in with MFA enabled -> pending state
      const loginRes = await request(app)
        .post('/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send(superAdmin)

      expect(loginRes.status).toBe(200)
      expect(loginRes.body.mfaRequired).toBe(true)
      const cookies = loginRes.headers['set-cookie']
      const pendingCookie = Array.isArray(cookies) ? cookies[0] : cookies
      const pendingSessionId = loginRes.body.sessionId

      // Verify pending session cannot call regular APIs
      const blockedApi = await request(app)
        .get('/auth/session')
        .set('Cookie', pendingCookie)
      expect(blockedApi.status).toBe(403)
      expect(blockedApi.body.error.code).toBe('mfa_required')

      // 4. Verify with fresh TOTP code
      const freshCode = totp.generate()
      const verifyRes = await request(app)
        .post('/auth/mfa/verify')
        .set('Cookie', pendingCookie)
        .set('Origin', 'http://localhost:5173')
        .send({
          code: freshCode,
          tempSessionId: pendingSessionId,
        })

      expect(verifyRes.status).toBe(200)
      expect(verifyRes.body.authenticated).toBe(true)
      const vCookies = verifyRes.headers['set-cookie']
      const activeCookie = Array.isArray(vCookies) ? vCookies[0] : vCookies

      // Active cookie can now access regular APIs
      const activeApi = await request(app)
        .get('/auth/session')
        .set('Cookie', activeCookie)
      expect(activeApi.status).toBe(200)

      // 5. Test replay attack prevention
      const replayLogin = await request(app)
        .post('/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send(superAdmin)

      const rlCookies = replayLogin.headers['set-cookie']
      const rlCookie = Array.isArray(rlCookies) ? rlCookies[0] : rlCookies

      const replayVerify = await request(app)
        .post('/auth/mfa/verify')
        .set('Cookie', rlCookie)
        .set('Origin', 'http://localhost:5173')
        .send({
          code: freshCode, // Same code as before in same 30s window
          tempSessionId: replayLogin.body.sessionId,
        })

      expect(replayVerify.status).toBe(400)
      expect(replayVerify.body.error.code).toBe('code_replayed')

      // 6. Test single-use recovery code
      const recLogin = await request(app)
        .post('/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send(superAdmin)

      const recCookies = recLogin.headers['set-cookie']
      const recCookie = Array.isArray(recCookies) ? recCookies[0] : recCookies
      const usedRecoveryCode = recoveryCodes[0]

      const recVerify = await request(app)
        .post('/auth/mfa/recovery-code')
        .set('Cookie', recCookie)
        .set('Origin', 'http://localhost:5173')
        .send({
          recoveryCode: usedRecoveryCode,
          tempSessionId: recLogin.body.sessionId,
        })

      expect(recVerify.status).toBe(200)
      expect(recVerify.body.authenticated).toBe(true)

      // Re-using the same recovery code fails
      const recLogin2 = await request(app)
        .post('/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send(superAdmin)

      const recCookies2 = recLogin2.headers['set-cookie']
      const recCookie2 = Array.isArray(recCookies2) ? recCookies2[0] : recCookies2

      const recReplay = await request(app)
        .post('/auth/mfa/recovery-code')
        .set('Cookie', recCookie2)
        .set('Origin', 'http://localhost:5173')
        .send({
          recoveryCode: usedRecoveryCode,
          tempSessionId: recLogin2.body.sessionId,
        })

      expect(recReplay.status).toBe(400)
      expect(recReplay.body.error.code).toBe('invalid_recovery_code')
    })
  })

  describe('5. Active Sessions Management', () => {
    it('lists user sessions with device and masked IP, revokes one, and revokes others', async () => {
      // Login first session (Firefox on Windows)
      const session1 = await request(app)
        .post('/auth/login')
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0')
        .set('Origin', 'http://localhost:5173')
        .send(superAdmin)
      const cookies1 = session1.headers['set-cookie']
      const cookie1 = Array.isArray(cookies1) ? cookies1[0] : cookies1
      expect(cookie1).toBeDefined()
      const id1 = session1.body.sessionId

      // Login second session (Chrome on Mac)
      const session2 = await request(app)
        .post('/auth/login')
        .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        .set('Origin', 'http://localhost:5173')
        .send(superAdmin)
      const cookies2 = session2.headers['set-cookie']
      const cookie2 = Array.isArray(cookies2) ? cookies2[0] : cookies2
      const id2 = session2.body.sessionId

      // List sessions from session2
      const listRes = await request(app)
        .get('/auth/sessions/all')
        .set('Cookie', cookie2)

      expect(listRes.status).toBe(200)
      expect(listRes.body.sessions).toHaveLength(2)
      const s2Entry = listRes.body.sessions.find((s: any) => s.isCurrent)
      expect(s2Entry).toBeDefined()
      expect(s2Entry.device).toContain('Chrome')
      expect(s2Entry.maskedIp).toBeDefined()

      // Revoke session1 using session2
      const revoke1 = await request(app)
        .delete(`/auth/sessions/${id1}`)
        .set('Cookie', cookie2)
        .set('X-CSRF-Token', session2.body.csrfToken)
        .set('Origin', 'http://localhost:5173')

      expect(revoke1.status).toBe(200)
      expect(getSession(id1)).toBeNull()

      // Revoke-others from session2
      const revokeOthers = await request(app)
        .post('/auth/sessions/revoke-others')
        .set('Cookie', cookie2)
        .set('X-CSRF-Token', session2.body.csrfToken)
        .set('Origin', 'http://localhost:5173')

      expect(revokeOthers.status).toBe(200)
      expect(getSession(id2)).not.toBeNull()
    })
  })

  describe('6. Sensitive Actions & Recent Authentication (requireRecentAuth)', () => {
    it('blocks sensitive actions when lastAuthAt exceeds 5 minutes and allows after reauthentication', async () => {
      const admin = await loginAsSuperAdmin()

      // Simulate session lastAuthAt > 5 minutes ago (301 seconds ago)
      const session = getSession(admin.sessionId)!
      session.lastAuthAt = Date.now() - 301 * 1000

      // 1. Role change on user
      const roleRes = await request(app)
        .put('/users/u-1104')
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrfToken)
        .set('Origin', 'http://localhost:5173')
        .send({
          name: 'Vikram Singh',
          email: 'vikram.singh@university.edu',
          role: 'admin_dispatcher',
          department: 'Examination Cell',
          employeeId: 'PU-2024-124',
          active: true,
        })
      expect(roleRes.status).toBe(403)
      expect(roleRes.body.error.code).toBe('recent_auth_required')

      // 2. Activate/deactivate user
      const activeRes = await request(app)
        .patch('/users/u-1104/active')
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrfToken)
        .set('Origin', 'http://localhost:5173')
        .send({ active: false })
      expect(activeRes.status).toBe(403)
      expect(activeRes.body.error.code).toBe('recent_auth_required')

      // 3. Reset password
      const resetRes = await request(app)
        .post('/users/u-1104/reset-password')
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrfToken)
        .set('Origin', 'http://localhost:5173')
      expect(resetRes.status).toBe(403)
      expect(resetRes.body.error.code).toBe('recent_auth_required')

      // 4. Reset MFA
      const mfaRes = await request(app)
        .post('/users/u-1104/reset-mfa')
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrfToken)
        .set('Origin', 'http://localhost:5173')
      expect(mfaRes.status).toBe(403)
      expect(mfaRes.body.error.code).toBe('recent_auth_required')

      // 5. Delete master data
      const masterRes = await request(app)
        .delete('/master/departments/dept-999')
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrfToken)
        .set('Origin', 'http://localhost:5173')
      expect(masterRes.status).toBe(403)
      expect(masterRes.body.error.code).toBe('recent_auth_required')

      // 6. Export report
      const exportRes = await request(app)
        .get('/reports/export.csv?from=2026-01-01&to=2026-12-31')
        .set('Cookie', admin.cookie)
      expect(exportRes.status).toBe(403)
      expect(exportRes.body.error.code).toBe('recent_auth_required')

      // 7. Update integration settings
      const settingsRes = await request(app)
        .put('/settings/integrations')
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrfToken)
        .set('Origin', 'http://localhost:5173')
        .send({ googleCalendarEnabled: false })
      expect(settingsRes.status).toBe(403)
      expect(settingsRes.body.error.code).toBe('recent_auth_required')

      // Re-authenticate using current password
      const reauthRes = await request(app)
        .post('/auth/reauthenticate')
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrfToken)
        .set('Origin', 'http://localhost:5173')
        .send({ password: superAdmin.password })

      expect(reauthRes.status).toBe(200)
      expect(reauthRes.body.success).toBe(true)

      // Now updating integration settings succeeds!
      const retrySettings = await request(app)
        .put('/settings/integrations')
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrfToken)
        .set('Origin', 'http://localhost:5173')
        .send({ googleCalendarEnabled: false })

      expect(retrySettings.status).toBe(200)
      expect(retrySettings.body.settings.googleCalendarEnabled).toBe(false)
    })
  })
})
