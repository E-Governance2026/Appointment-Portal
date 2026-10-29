# Security Architecture & OWASP ASVS Implementation Guide

This document describes the defensive security controls implemented across the Appointment Portal, mapped directly to chapters of the **OWASP Application Security Verification Standard (ASVS v4.0.3)**. Each control references its source file implementation and configuration settings.

---

## 1. Threat Model

### 1.1 Assets
1. **User Identity & Credentials**: Argon2id password hashes, TOTP secret seeds, recovery codes, OAuth refresh tokens, session identifiers.
2. **Appointment Records & PII**: Visitor names, government employee IDs, phone numbers, email addresses, meeting agendas, and purpose notes.
3. **Internal Administrative Notes**: Remarks made by coordinators and authorities strictly hidden from requesters.
4. **Uploaded Documents**: Official identity proofs, sanction letters, and confidential supporting attachments.
5. **System Audit Logs**: Chained cryptographic audit records containing immutable event timelines.

### 1.2 Roles & Trust Boundaries
- **Public Visitor / Unauthenticated User**: Can only view the login page and track their own appointment with a matching 2FA identifier (email or phone).
- **Requester (`requester`)**: Can book appointments, upload documents to their own requests, view their own appointments, and respond to additional info requests. Zero access to administrative queues or other users' appointments.
- **Coordinator / Authority (`coordinator_authority`)**: Can view appointments assigned to their department, approve, reject, reassign (within department), request information, propose reschedules, and enter internal remarks.
- **Admin Dispatcher (`admin_dispatcher`)**: Reception and visitor desk staff. Can manage reception queue, check in and check out visitors, record no-shows, and view appointments.
- **Super Admin (`super_admin`)**: Full system administrator. Can manage users, master reference data, verify audit log integrity, export audit logs, and configure system settings.

### 1.3 Entry Points & Attack Surfaces
- **Public HTTP Endpoints**: `/auth/login`, `/auth/refresh`, `/track/:id`.
- **Authenticated REST Endpoints**: `/appointments/*`, `/users/*`, `/master/*`, `/reports/*`, `/audit/*`.
- **File Upload Stream**: Multipart pipeline at `POST /appointments/:id/documents`.
- **File Download Handler**: Streaming attachment server at `GET /appointments/:id/documents/:docId`.
- **Frontend Browser Context**: React SPA running in the client browser, handling OAuth tokens, user input, and session warnings.

### 1.4 Primary Threats and Mitigations

| Threat | ASVS Category | Risk | Implemented Mitigation |
| :--- | :--- | :--- | :--- |
| **Credential Brute-Force & Credential Stuffing** | V2 Authentication | High | Argon2id hashing, 5-attempt account lockout (15 min), 10,000 common password blocklist, progressive delay, TOTP 2FA. |
| **Session Hijacking & Fixation** | V3 Session Mgmt | High | `__Host-sid` httpOnly, SameSite=Strict cookies, idle timeout (3 min), single-session revocation, multi-tab sync. |
| **Insecure Direct Object References (IDOR)** | V4 Access Control | Critical | Record-level ownership checks returning generic `404 Not Found` (never `403`), SQL WHERE clause scoping. |
| **Privilege Escalation** | V4 Access Control | Critical | Strict central RBAC permission declarations (`requirePermission`) on every route. No client-side trust. |
| **SQL & Query Injection** | V5 Validation | Critical | Supabase parameterized queries only. PostgREST filter sanitization (`sanitizePostgrestFilter`) and SQL LIKE sanitization. |
| **Cross-Site Scripting (XSS)** | V5 Validation | High | React automated text encoding (0 `dangerouslySetInnerHTML`), strict CSP (`script-src 'self'`, no unsafe-inline), nosniff. |
| **Malicious File Uploads / Disguised RCE** | V12 Files | Critical | Magic byte inspection, extension allowlist (PDF, DOCX, JPG, PNG), UUID storage outside web root, ClamAV TCP scan. |
| **CSV Formula Injection** | V5 Validation | Medium | Automatic cell sanitization prefixing `=`, `+`, `-`, `@` with `'` in all CSV export endpoints. |
| **Tampering with Audit Logs** | V7 Logging | High | SHA-256 cryptographic hash-chained audit records, tamper detection verification endpoint (`POST /audit/verify`). |
| **Information Leakage via Errors** | V7 Logging | Medium | Production error masking (generic 500 responses), automated sensitive data redaction in structured JSON logs. |

---

## 2. Controls by OWASP ASVS Chapter

### Chapter V2: Authentication Verification Standard
- **V2.1 Password Hashing & Rehashing**:
  - Implementation: [password.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/password.ts)
  - Control: Argon2id with memory cost >= 19 MiB, time cost >= 2, parallelism = 1. Automatic rehash on login if algorithm parameters are upgraded.
  - Setting: `ARGON2_OPTIONS` in `password.ts`.
- **V2.2 Password Policy & Common Password Rejection**:
  - Implementation: [password.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/password.ts), [commonPasswords.json](file:///c:/MIS%20appointment%20system/backend/src/data/commonPasswords.json)
  - Control: Minimum 12 characters, maximum 128 characters. Local offline list of >10,000 common passwords. Rejects passwords containing user's name, employee ID, or email prefix.
- **V2.3 Credential Stuffing & Brute-Force Protection**:
  - Implementation: [credentialStore.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/credentialStore.ts), [auth.ts](file:///c:/MIS%20appointment%20system/backend/src/routes/auth.ts)
  - Control: 5 consecutive failed attempts trigger a 15-minute account lockout (`423 Locked`). Progressive delay (150ms per failure) applied.
- **V2.4 Multi-Factor Authentication (MFA / TOTP)**:
  - Implementation: [mfa.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/mfa.ts), [SecuritySettings.tsx](file:///c:/MIS%20appointment%20system/src/components/settings/SecuritySettings.tsx)
  - Control: RFC 6238 TOTP (SHA-1, 6 digits, 30s step, window ±1). Single-use 8-character recovery codes (stored hashed with Argon2id). TOTP secret seed encrypted with AES-256-GCM.
  - Setting: `FEATURES_MFA=true` in `backend/.env`.

---

### Chapter V3: Session Management Verification Standard
- **V3.1 Cryptographic Session Tokens**:
  - Implementation: [sessionStore.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/sessionStore.ts), [sessionCookie.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/sessionCookie.ts)
  - Control: High-entropy cryptographic UUID tokens (`crypto.randomUUID()`), hashed before database indexing.
  - Setting: `SESSION_SECRET` (validated >=32 bytes at boot).
- **V3.2 Cookie Security & Prefixing**:
  - Implementation: [sessionCookie.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/sessionCookie.ts)
  - Control: `HttpOnly; SameSite=Strict; Path=/`. In production, uses `__Host-sid` cookie prefix with mandatory `Secure` flag.
  - Setting: `COOKIE_SECURE=true` in `backend/.env`.
- **V3.3 Idle and Absolute Session Timeouts**:
  - Implementation: [sessionStore.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/sessionStore.ts), [SessionManager.tsx](file:///c:/MIS%20appointment%20system/src/components/session/SessionManager.tsx)
  - Control: Inactivity timeout at 180 seconds (3 minutes). Warning modal shown at 150 seconds (2m 30s). Absolute hard timeout at 28,800 seconds (8 hours).
  - Setting: `SESSION_IDLE_TIMEOUT_SECONDS=180`, `SESSION_WARNING_SECONDS=30`.
- **V3.4 Background Polling Exemption**:
  - Implementation: [session.ts](file:///c:/MIS%20appointment%20system/backend/src/middleware/session.ts), [apiClient.ts](file:///c:/MIS%20appointment%20system/src/services/apiClient.ts)
  - Control: Read-only background pollers pass `X-Skip-Session-Touch: 1`, preventing idle timeout reset while absent.
- **V3.5 Multi-Tab Logout Synchronization**:
  - Implementation: [SessionManager.tsx](file:///c:/MIS%20appointment%20system/src/components/session/SessionManager.tsx)
  - Control: `BroadcastChannel('portal_session_channel')` propagates logout events immediately across all tabs.

---

### Chapter V4: Access Control Verification Standard
- **V4.1 Deny-by-Default Central RBAC**:
  - Implementation: [permission.ts](file:///c:/MIS%20appointment%20system/backend/src/middleware/permission.ts), [permissions.ts](file:///c:/MIS%20appointment%20system/src/domain/permissions.ts)
  - Control: Every route declares explicit permissions via `requirePermission(action)`. Routes without declaration fail automated test gates. Server-only authorization enforcement.
- **V4.2 Insecure Direct Object References (IDOR)**:
  - Implementation: [appointments.ts](file:///c:/MIS%20appointment%20system/backend/src/routes/appointments.ts), [guards.ts](file:///c:/MIS%20appointment%20system/backend/src/domain/guards.ts)
  - Control: `canViewAppointment` and `canActOnApproval` enforced on all single-record and collection queries. Non-existent and unauthorized records return identical `404 Not Found` responses to prevent resource existence disclosure.
- **V4.3 Internal Remarks Isolation**:
  - Implementation: [appointments.ts](file:///c:/MIS%20appointment%20system/backend/src/routes/appointments.ts)
  - Control: Internal remarks created by authorities are stripped from timeline event responses when requested by users with the `requester` role.

---

### Chapter V5: Validation, Sanitization and Encoding
- **V5.1 Strict Request Schema Validation**:
  - Implementation: [appointments.ts](file:///c:/MIS%20appointment%20system/backend/src/routes/appointments.ts), [users.ts](file:///c:/MIS%20appointment%20system/backend/src/routes/users.ts)
  - Control: Every request body, query parameter, and route parameter is validated using strict Zod schemas (`.strict()`). Mass assignment of unknown keys is rejected with `400 Bad Request`.
- **V5.2 Input Payload Limits**:
  - Implementation: [app.ts](file:///c:/MIS%20appointment%20system/backend/src/app.ts), [reports.ts](file:///c:/MIS%20appointment%20system/backend/src/routes/reports.ts)
  - Control: JSON body parser hard-capped at `100kb`. Report date range queries capped at 366 days max span. Query `pageSize` capped at 100.
- **V5.3 Free Text & Identifier Sanitization**:
  - Implementation: [sanitizer.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/sanitizer.ts)
  - Control: Strips ASCII control characters (`\x00-\x08\x0B\x0C\x0E-\x1F\x7F`). Normalizes email and employee ID strings.
- **V5.4 SQL LIKE & PostgREST Filter Sanitization**:
  - Implementation: [sanitizer.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/sanitizer.ts), [auth.ts](file:///c:/MIS%20appointment%20system/backend/src/middleware/auth.ts)
  - Control: Escapes wildcard characters (`%`, `_`, `\`) in SQL LIKE patterns and strips reserved PostgREST delimiter characters from user search queries.
- **V5.5 CSV Formula Injection (DDE) Mitigation**:
  - Implementation: [sanitizer.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/sanitizer.ts), [auditViewer.ts](file:///c:/MIS%20appointment%20system/backend/src/routes/auditViewer.ts)
  - Control: `sanitizeCsvCell` prefixes any cell value beginning with `=`, `+`, `-`, or `@` with a single quote (`'`), preventing formula execution in spreadsheet software.
- **V5.6 Safe External URL Validation**:
  - Implementation: [safeUrl.ts](file:///c:/MIS%20appointment%20system/src/utils/safeUrl.ts), [sanitizer.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/sanitizer.ts)
  - Control: Validates meeting and calendar links against `https:` protocol and an approved domain allowlist (`meet.google.com`, `calendar.google.com`, `teams.microsoft.com`, `zoom.us`). Non-matching URLs are replaced with safe fallback strings.

---

### Chapter V6: Cryptography at Rest and in Transit
- **V6.1 AES-256-GCM Symmetric Encryption at Rest**:
  - Implementation: [mfa.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/mfa.ts)
  - Control: AES-256-GCM authenticated encryption for sensitive columns (TOTP secret keys, OAuth tokens). Ciphertext format: `${keyId}:${ivHex}:${tagHex}:${cipherHex}`.
  - Setting: `APP_ENCRYPTION_KEY` (32 bytes / 64 hex characters) and `ACTIVE_KEY_ID`.
- **V6.2 Zero-Downtime Key Rotation Ring**:
  - Implementation: [mfa.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/mfa.ts), [env.ts](file:///c:/MIS%20appointment%20system/backend/src/config/env.ts)
  - Control: `APP_ENCRYPTION_KEY_RING` allows multiple historical keys to be loaded simultaneously for decryption while new writes use `ACTIVE_KEY_ID`.
- **V6.3 Database Transport Security**:
  - Implementation: [env.ts](file:///c:/MIS%20appointment%20system/backend/src/config/env.ts), [DATABASE_SECURITY.md](file:///c:/MIS%20appointment%20system/DATABASE_SECURITY.md)
  - Control: Production database connection strings must specify TLS (`sslmode=require` or `ssl=true`).

---

### Chapter V7: Error Handling and Logging
- **V7.1 Centralized Error Masking**:
  - Implementation: [errorHandler.ts](file:///c:/MIS%20appointment%20system/backend/src/middleware/errorHandler.ts)
  - Control: Uncaught 500 errors suppress internal database error messages, stack traces, and filesystem paths in production, returning generic client error messages.
- **V7.2 Request Correlation Identifier**:
  - Implementation: [errorHandler.ts](file:///c:/MIS%20appointment%20system/backend/src/middleware/errorHandler.ts)
  - Control: Generates a unique UUID `requestId` on every request, returned in `X-Request-Id` response header and log entries.
- **V7.3 Structured JSON Logging & Automated Redaction**:
  - Implementation: [logger.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/logger.ts)
  - Control: JSON structured logger. Recursively redacts passwords, tokens, cookies, authorization headers, CSRF tokens, TOTP codes, and meeting URLs.
- **V7.4 Cryptographic Append-Only Audit Trail**:
  - Implementation: [auditTrail.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/auditTrail.ts), [auditViewer.ts](file:///c:/MIS%20appointment%20system/backend/src/routes/auditViewer.ts)
  - Control: Chained SHA-256 hashes linking each audit record to its predecessor (`hash = SHA256(prevHash + timestamp + action + actorId + recordId)`). Tamper detection endpoint at `POST /audit/verify`.

---

### Chapter V9: Communications & Transport Security
- **V9.1 Strict Content Security Policy (CSP)**:
  - Implementation: [app.ts](file:///c:/MIS%20appointment%20system/backend/src/app.ts)
  - Directives: `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: https:`, `connect-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`.
- **V9.2 HTTP Strict Transport Security (HSTS)**:
  - Implementation: [app.ts](file:///c:/MIS%20appointment%20system/backend/src/app.ts)
  - Directives: `max-age=31536000; includeSubDomains` in production.
- **V9.3 Browser Isolation Headers**:
  - Implementation: [app.ts](file:///c:/MIS%20appointment%20system/backend/src/app.ts)
  - Headers: `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`.
- **V9.4 CORS Restriction & Credentials**:
  - Implementation: [app.ts](file:///c:/MIS%20appointment%20system/backend/src/app.ts)
  - Control: Only explicitly configured origins in `ALLOWED_ORIGINS` are accepted with `credentials: true`. Wildcards are prohibited; unknown origins return `403 csrf_failed`.
- **V9.5 Tiered Rate Limiting**:
  - Implementation: [app.ts](file:///c:/MIS%20appointment%20system/backend/src/app.ts)
  - Control: 429 responses with `Retry-After` headers. Global API (300/15m), Auth (10/15m), Public Tracking (20/15m), Uploads (15/15m), Exports (20/15m).

---

### Chapter V12: File Uploads & Malware Defense
- **V12.1 Magic Byte & Extension Verification**:
  - Implementation: [fileUpload.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/fileUpload.ts)
  - Control: Inspects binary signatures (PDF, DOCX, JPG, PNG). Rejects double extensions (`.pdf.exe`) and disguised executables/scripts.
- **V12.2 Safe Storage Architecture**:
  - Implementation: [fileUpload.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/fileUpload.ts)
  - Control: Stored outside web roots (`backend/uploads/`) with server-generated UUID filenames. Path traversal (`../`) is impossible.
- **V12.3 Antivirus Scanning Pipeline**:
  - Implementation: [virusScanner.ts](file:///c:/MIS%20appointment%20system/backend/src/lib/virusScanner.ts)
  - Control: ClamAV TCP streaming integration (`zINSTREAM` to port 3310). Uploads remain `status: 'pending'` until verified clean.
  - Setting: `CLAMAV_ENABLED=true`, `CLAMAV_HOST`, `CLAMAV_PORT`.
- **V12.4 Safe Attachment Download Handler**:
  - Implementation: [appointments.ts](file:///c:/MIS%20appointment%20system/backend/src/routes/appointments.ts)
  - Control: `GET /appointments/:id/documents/:docId` enforces authorization and serves files with `Content-Disposition: attachment; filename="sanitized_name.ext"`, `nosniff`, and `Cache-Control: private, no-store`.

---

### Chapter V14: Configuration & Dependencies
- **V14.1 Production Fail-Fast Validation**:
  - Implementation: [env.ts](file:///c:/MIS%20appointment%20system/backend/src/config/env.ts)
  - Control: Verifies secrets meet length and entropy minimums, rejects demo flags, and verifies database TLS.
- **V14.2 Automated Secret Scanning & CI Pipeline**:
  - Implementation: [.gitleaks.toml](file:///c:/MIS%20appointment%20system/.gitleaks.toml), [ci.yml](file:///c:/MIS%20appointment%20system/.github/workflows/ci.yml), [security-scan.ts](file:///c:/MIS%20appointment%20system/scripts/security-scan.ts)
  - Control: Continuous secret scanning in CI and pre-commit checks.
- **V14.3 Dependency Security & Automated Updates**:
  - Implementation: [.github/dependabot.yml](file:///c:/MIS%20appointment%20system/.github/dependabot.yml)
  - Control: Weekly automated dependency audits. 0 vulnerabilities across root and backend.
- **V14.4 Source Map Suppression**:
  - Implementation: [vite.config.ts](file:///c:/MIS%20appointment%20system/vite.config.ts)
  - Control: `build: { sourcemap: false }` prevents code exposure in production.

---

## 3. Known Limitations and Accepted Risks

1. **ClamAV External Daemon Dependency**:
   - *Limitation*: The application provides a full TCP client for `clamd`, but requires a running ClamAV daemon service (typically running in a sidecar container or dedicated security VM).
   - *Accepted Risk*: In local development environments without ClamAV, the scanner defaults to `NoOpScanner` with built-in EICAR test signature detection. A startup warning is logged if `CLAMAV_ENABLED=false` in production.
2. **In-Memory Store vs Distributed Cache**:
   - *Limitation*: Rate limiting and session storage use high-performance in-memory stores in single-node mode.
   - *Accepted Risk*: When horizontally scaling to multiple backend instances, sticky sessions on reverse proxy or migration to a Redis-backed session/rate-limit store is required.
3. **Database RLS as Secondary Layer**:
   - *Limitation*: The Node backend operates with the database service-role client (which bypasses RLS) to execute application-level authorization and validation.
   - *Accepted Risk*: Database RLS policies are deployed as defense-in-depth to protect against accidental direct client connections, while the server enforces authoritative record-level checks.
