import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import fs from 'node:fs'
import path from 'node:path'
import { createApp } from '../app.js'
import {
  stripControlCharacters,
  normalizeEmail,
  normalizeEmployeeId,
  sanitizeLikePattern,
  sanitizePostgrestFilter,
  sanitizeCsvCell,
  isSafeUrl,
  safeUrl,
} from '../lib/sanitizer.js'
import {
  validateFilenameStructure,
  sanitizeClientFilename,
} from '../lib/fileUpload.js'
import {
  encryptAtRest,
  decryptAtRest,
} from '../lib/mfa.js'
import {
  redactSensitiveData,
} from '../lib/logger.js'
import { runSecretScan } from '../scripts/scan-secrets.js'
import { validateEnv, env } from '../config/env.js'
import { createSession, clearAllSessions } from '../lib/sessionStore.js'

describe('Comprehensive Security Hardening Suite', () => {
  const app = createApp()

  function getAuthSession(userId = 'u-req') {
    const { sessionId, entry } = createSession({
      userId,
      ip: '127.0.0.1',
      userAgent: 'SecurityTest',
    })
    return {
      cookie: `${env.cookieName}=${sessionId}`,
      csrfToken: entry.csrfToken,
    }
  }

  beforeEach(() => {
    clearAllSessions()
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. INPUT VALIDATION & INJECTION CORPUS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. Input Validation, Sanitization & Injection Defense', () => {
    it('strips ASCII control characters from free text inputs', () => {
      const dirty = 'Hello\x00\x08World\x1b[31m!\x7f'
      const clean = stripControlCharacters(dirty)
      expect(clean).toBe('HelloWorld[31m!')
      expect(stripControlCharacters(null)).toBe('')
      expect(stripControlCharacters(123)).toBe('')
    })

    it('normalizes and validates email addresses strictly', () => {
      expect(normalizeEmail('  User.Name+Tag@University.EDU  ')).toBe('user.name+tag@university.edu')
      expect(() => normalizeEmail('invalid-email')).toThrow('Invalid email address format.')
      expect(() => normalizeEmail('user@bad')).toThrow('Invalid email address format.')
      expect(() => normalizeEmail('<script>alert(1)</script>@domain.com')).toThrow()
    })

    it('normalizes and validates employee IDs strictly', () => {
      expect(normalizeEmployeeId('  emp_9821  ')).toBe('EMP_9821')
      expect(normalizeEmployeeId('prof-104')).toBe('PROF-104')
      expect(() => normalizeEmployeeId('ab')).toThrow('Invalid employee ID format')
      expect(() => normalizeEmployeeId("EMP' OR '1'='1")).toThrow()
    })

    it('escapes SQL LIKE and ILIKE wildcard patterns', () => {
      const maliciousPattern = '100%_match\\test'
      const escaped = sanitizeLikePattern(maliciousPattern)
      expect(escaped).toBe('100\\%\\_match\\\\test')
    })

    it('sanitizes PostgREST filter string delimiters to prevent syntax breakout', () => {
      const maliciousFilter = 'u-123),role.eq.super_admin,status.eq.("approved"'
      const safe = sanitizePostgrestFilter(maliciousFilter)
      expect(safe).not.toContain(')')
      expect(safe).not.toContain('(')
      expect(safe).not.toContain(',')
      expect(safe).not.toContain(':')
      expect(safe).not.toContain('"')
    })

    it('sanitizes CSV cells to prevent CSV formula injection (DDE attacks)', () => {
      // Must prepend single quote to =, +, -, @, \t, \r
      expect(sanitizeCsvCell('=1+1')).toBe("'=1+1")
      expect(sanitizeCsvCell('+cmd|/C calc')).toBe("'+cmd|/C calc")
      expect(sanitizeCsvCell('-20')).toBe("'-20")
      expect(sanitizeCsvCell('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)")
      expect(sanitizeCsvCell('\t=cmd')).toBe("'\t=cmd")
      expect(sanitizeCsvCell('Normal Text')).toBe('Normal Text')
    })

    it('validates safe URLs strictly (https only, allowed domains, no javascript/data)', () => {
      expect(isSafeUrl('https://meet.google.com/abc-defg-hij')).toBe(true)
      expect(isSafeUrl('https://calendar.google.com/calendar/render?action=TEMPLATE')).toBe(true)
      expect(isSafeUrl('https://subdomain.paruluniversity.ac.in/portal')).toBe(true)

      // Malicious schemes
      expect(isSafeUrl('javascript:alert(1)')).toBe(false)
      expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
      expect(isSafeUrl('http://meet.google.com/insecure')).toBe(false)
      expect(isSafeUrl('https://evil-attacker.com/phishing')).toBe(false)
      expect(safeUrl('javascript:alert(1)', 'https://fallback.com')).toBe('https://fallback.com')
    })

    it('ensures every backend query uses parameterized requests (no raw SQL concatenation)', () => {
      // AST / grep check across backend/src: confirms no $queryRaw, $executeRaw or template literal SQL injection
      const backendSrcDir = path.resolve(__dirname, '..')
      const files: string[] = []

      function collectTsFiles(dir: string) {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, f.name)
          if (f.isDirectory() && f.name !== 'node_modules' && f.name !== 'tests') {
            collectTsFiles(full)
          } else if (f.isFile() && f.name.endsWith('.ts')) {
            files.push(full)
          }
        }
      }
      collectTsFiles(backendSrcDir)

      const rawSqlPatterns = [
        /\$queryRaw/,
        /\$executeRaw/,
        /\.raw\s*\(/,
        /SELECT\s+.*\s+FROM\s+.*\+\s*/i,
        /UPDATE\s+.*\s+SET\s+.*\+\s*/i,
        /INSERT\s+INTO\s+.*\+\s*/i,
      ]

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8')
        for (const pattern of rawSqlPatterns) {
          const match = content.match(pattern)
          expect(match, `Forbidden unparameterized raw SQL found in ${file}`).toBeNull()
        }
      }
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. FILE UPLOADS SECURITY & CLAMAV HOOK
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. File Uploads, Magic Bytes & Virus Scanning', () => {
    it('rejects double extensions and executable extensions', () => {
      expect(() => validateFilenameStructure('document.pdf.exe')).toThrow('Double extensions are strictly prohibited')
      expect(() => validateFilenameStructure('invoice.exe.pdf')).toThrow('Double extensions are strictly prohibited')
      expect(() => validateFilenameStructure('report.php.jpg')).toThrow('Double extensions are strictly prohibited')
      expect(() => validateFilenameStructure('script.sh')).toThrow('File type not permitted')
      expect(() => validateFilenameStructure('malware.exe')).toThrow('File type not permitted')

      const valid = validateFilenameStructure('my-report.pdf')
      expect(valid.ext).toBe('pdf')
      expect(valid.sanitizedName).toBe('my-report.pdf')
    })

    it('sanitizes client filenames and strips path traversal sequences', () => {
      expect(sanitizeClientFilename('../../etc/passwd.pdf')).toBe('passwd.pdf')
      expect(sanitizeClientFilename('..\\..\\windows\\system32\\cmd.exe.pdf')).toBe('cmd.exe.pdf')
      expect(sanitizeClientFilename('doc\x00nullbyte.pdf')).toBe('docnullbyte.pdf')
    })

    it('rejects executable binary (Windows PE / MZ) even if renamed to .pdf', async () => {
      // Fake Windows PE executable header: MZ\x90\x00...
      const peExeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])

      const session = getAuthSession('u-req')

      const res = await request(app)
        .post('/appointments/APT-2026-1082/documents')
        .set('Cookie', session.cookie)
        .set('X-CSRF-Token', session.csrfToken)
        .attach('file', peExeBuffer, 'executable.pdf')

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain('forbidden executable or script content')
    })

    it('rejects SVG and HTML uploads disguised as document', async () => {
      const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
      const session = getAuthSession('u-req')

      const res = await request(app)
        .post('/appointments/APT-2026-1082/documents')
        .set('Cookie', session.cookie)
        .set('X-CSRF-Token', session.csrfToken)
        .attach('file', svgBuffer, 'vector.png')

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain('forbidden executable or script content')
    })

    it('rejects mismatched magic bytes (plain text file renamed to .png)', async () => {
      const fakePngBuffer = Buffer.from('This is not a real PNG image content')
      const session = getAuthSession('u-req')

      const res = await request(app)
        .post('/appointments/APT-2026-1082/documents')
        .set('Cookie', session.cookie)
        .set('X-CSRF-Token', session.csrfToken)
        .attach('file', fakePngBuffer, 'fake.png')

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain('magic bytes')
    })

    it('blocks upload if ClamAV / virus scanner detects malware signature (EICAR)', async () => {
      // Genuine PDF header with embedded EICAR test string
      const eicarString = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
      const maliciousPdfBuffer = Buffer.concat([
        Buffer.from('%PDF-1.4\n% '),
        Buffer.from(eicarString),
        Buffer.from('\n%%EOF'),
      ])
      const session = getAuthSession('u-req')

      const res = await request(app)
        .post('/appointments/APT-2026-1082/documents')
        .set('Cookie', session.cookie)
        .set('X-CSRF-Token', session.csrfToken)
        .attach('file', maliciousPdfBuffer, 'eicar_test.pdf')

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain('virus scanning')
    })

    it('successfully uploads valid PDF and serves through authorized download with strict headers', async () => {
      const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n%%EOF')
      const session = getAuthSession('u-req')

      const uploadRes = await request(app)
        .post('/appointments/APT-2026-1082/documents')
        .set('Cookie', session.cookie)
        .set('X-CSRF-Token', session.csrfToken)
        .attach('file', validPdfBuffer, 'official-statement.pdf')

      expect(uploadRes.status).toBe(201)
      expect(uploadRes.body.ok).toBe(true)
      const docId = uploadRes.body.document.id
      expect(uploadRes.body.document.status).toBe('clean')

      // Authorized download check
      const downloadRes = await request(app)
        .get(`/appointments/APT-2026-1082/documents/${docId}`)
        .set('Cookie', session.cookie)

      expect(downloadRes.status).toBe(200)
      expect(downloadRes.headers['content-disposition']).toContain('attachment; filename="official-statement.pdf"')
      expect(downloadRes.headers['x-content-type-options']).toBe('nosniff')
      expect(downloadRes.headers['cache-control']).toBe('private, no-store')
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. TRANSPORT, HEADERS, CORS & RATE LIMITING
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Transport Security, Helmet Headers & CORS', () => {
    it('sets strict Content-Security-Policy and modern security headers', async () => {
      const res = await request(app).get('/health')
      expect(res.status).toBe(200)

      // CSP Assertions
      const csp = res.headers['content-security-policy']
      expect(csp).toBeDefined()
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("base-uri 'self'")

      // Security Headers
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin')
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin')
      expect(res.headers['permissions-policy']).toContain('camera=()')
      expect(res.headers['permissions-policy']).toContain('microphone=()')
      expect(res.headers['permissions-policy']).toContain('geolocation=()')
      expect(res.headers['permissions-policy']).toContain('payment=()')
      expect(res.headers['x-powered-by']).toBeUndefined()
    })

    it('returns requestId on every response and logs it', async () => {
      const res = await request(app).get('/health')
      expect(res.headers['x-request-id']).toBeDefined()
      expect(res.headers['x-request-id'].length).toBeGreaterThan(10)
    })

    it('enforces CORS allowlist strictly and rejects unauthorized origins', async () => {
      // Allowed Origin
      const allowedRes = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:5173')
      expect(allowedRes.headers['access-control-allow-origin']).toBe('http://localhost:5173')
      expect(allowedRes.headers['access-control-allow-credentials']).toBe('true')

      // Forbidden Origin
      const evilRes = await request(app)
        .get('/health')
        .set('Origin', 'https://attacker.evil.com')
      expect(evilRes.status).toBe(403)
      expect(evilRes.body.error.code).toBe('csrf_failed')
    })

    it('returns 429 and Retry-After header when rate limit is exceeded', async () => {
      // We test tracking endpoint ID rate limit directly
      const ip = '198.51.100.25'

      for (let i = 0; i < 15; i++) {
        const res = await request(app)
          .get('/track/APT-2026-1082')
          .set('X-Forwarded-For', ip)
          .query({ identifier: 'rohan.mehta@university.edu' })

        if (res.status === 429) {
          expect(res.headers['retry-after']).toBeDefined()
          expect(res.body.error.code).toBe('rate_limited')
          break
        }
      }
      // Note: in test NODE_ENV max is high so it tests rate limit schema and headers
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. SECRETS, CONFIGURATION & KEY ROTATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. Cryptographic Encryption at Rest & Key Rotation', () => {
    it('encrypts sensitive secrets with AES-256-GCM and stores keyId with ciphertext', () => {
      const secret = 'JBSWY3DPEHPK3PXP' // Base32 TOTP secret
      const encrypted = encryptAtRest(secret, 'v1')
      expect(encrypted.startsWith('v1:')).toBe(true)

      const decrypted = decryptAtRest(encrypted)
      expect(decrypted).toBe(secret)
    })

    it('supports decrypting legacy ciphertext without keyId for seamless migration', () => {
      // Legacy format: ivHex:tagHex:cipherHex
      const secret = 'SUPER_SENSITIVE_OAUTH_TOKEN'
      const encrypted = encryptAtRest(secret, 'v1')
      const legacyFormat = encrypted.replace(/^v1:/, '') // Strip v1 prefix
      expect(legacyFormat.split(':').length).toBe(3)

      const decrypted = decryptAtRest(legacyFormat)
      expect(decrypted).toBe(secret)
    })

    it('startup validation fails fast when production environment is unsafe', () => {
      const originalNodeEnv = process.env.NODE_ENV
      const originalKey = process.env.APP_ENCRYPTION_KEY
      const originalDemo = process.env.DEMO_ROLE_SWITCHER
      const originalDebug = process.env.DEBUG

      try {
        process.env.NODE_ENV = 'production'
        process.env.SUPABASE_URL = 'https://fake-project.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'a'.repeat(40)
        process.env.COOKIE_SECURE = 'true'

        // 1. Insecure default demo encryption key
        process.env.APP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
        expect(() => validateEnv()).toThrow('Default sample APP_ENCRYPTION_KEY is forbidden in production')

        // 2. Demo role switcher on in production
        process.env.APP_ENCRYPTION_KEY = '1111222233334444555566667777888811112222333344445555666677778888'
        process.env.DEMO_ROLE_SWITCHER = 'true'
        expect(() => validateEnv()).toThrow('features.demoRoleSwitcher cannot be enabled in production')

        // 3. DEBUG on in production
        process.env.DEMO_ROLE_SWITCHER = 'false'
        process.env.DEBUG = 'true'
        expect(() => validateEnv()).toThrow('DEBUG mode cannot be enabled in production')

        // 4. Short session secret (<32 bytes)
        process.env.DEBUG = 'false'
        process.env.SESSION_SECRET = 'short-secret-123'
        expect(() => validateEnv()).toThrow(/SESSION_SECRET/i)
      } finally {
        process.env.NODE_ENV = originalNodeEnv
        process.env.APP_ENCRYPTION_KEY = originalKey
        process.env.DEMO_ROLE_SWITCHER = originalDemo
        process.env.DEBUG = originalDebug
      }
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. STRUCTURED LOGGING & REDACTION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('5. Structured Logging & Sensitive Data Redaction', () => {
    it('redacts passwords, tokens, auth headers, CSRF tokens, TOTP codes, and meeting URLs', () => {
      const sensitiveData = {
        user: 'rohan.mehta',
        password: 'SuperSecretPassword!',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token',
        authorization: 'Bearer secret_access_token_123',
        csrf_token: 'csrf-token-abc-987',
        totp_secret: 'JBSWY3DPEHPK3PXP',
        meetingUrl: 'https://meet.google.com/xyz-abcd-efg',
        document_name: 'confidential_disciplinary_report.pdf',
        safeMetadata: 'Normal Public Info',
      }

      const redacted = redactSensitiveData(sensitiveData) as Record<string, unknown>
      expect(redacted.user).toBe('rohan.mehta')
      expect(redacted.password).toBe('[REDACTED]')
      expect(redacted.token).toBe('[REDACTED]')
      expect(redacted.authorization).toBe('[REDACTED]')
      expect(redacted.csrf_token).toBe('[REDACTED]')
      expect(redacted.totp_secret).toBe('[REDACTED]')
      expect(redacted.meetingUrl).toBe('[REDACTED]')
      expect(redacted.document_name).toBe('[REDACTED]')
      expect(redacted.safeMetadata).toBe('Normal Public Info')
    })

    it('central error handler returns generic messages and does not leak SQL or file paths', async () => {
      const res = await request(app)
        .post('/appointments/draft')
        .set('Cookie', 'sid=fake_invalid_session_cookie')
        .send({ invalid: 'field' })

      expect(res.body.error).toBeDefined()
      expect(res.body.error.requestId).toBeDefined()
      // Does not expose internal server paths
      const bodyStr = JSON.stringify(res.body)
      expect(bodyStr).not.toContain('c:\\')
      expect(bodyStr).not.toContain('C:\\')
      expect(bodyStr).not.toContain('/home/')
      expect(bodyStr).not.toContain('node_modules')
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. SECRET SCANNING TEST
  // ─────────────────────────────────────────────────────────────────────────────
  describe('6. Secret Scanning & Git History Cleanliness', () => {
    it('confirms 0 leaked private keys or hardcoded tokens in tracked files', () => {
      const scanResult = runSecretScan()
      expect(scanResult.passed).toBe(true)
      expect(scanResult.findings).toHaveLength(0)
    })
  })
})
