# Security Operations Runbook

This operational runbook provides step-by-step procedures for security administrators, site reliability engineers (SREs), and incident responders managing the Appointment Portal.

---

## 1. Emergency Session Revocation (Revoke All Active Sessions)

When credentials are leaked, a system breach is suspected, or global session termination is required:

### Option A: Server-Side Global Invalidation (Immediate)
1. Set a new `SESSION_SECRET` in the environment configuration:
   ```bash
   # Generate a new 64-character high-entropy secret
   openssl rand -hex 32
   ```
2. Update `SESSION_SECRET` in your production secrets store (or `backend/.env`).
3. Restart the backend service. All existing session signatures immediately become invalid, forcing every connected user to re-authenticate.

### Option B: Administrative In-Memory Session Flush
If running single-node without restarting the process:
1. In the Super Admin console or via operational script, invoke the session store clear method:
   ```typescript
   import { sessionStore } from './lib/sessionStore.js'
   sessionStore.clearAll()
   ```
2. Broadcast the revocation to connected browsers over the global session channel:
   ```typescript
   sessionStore.broadcastRevocation()
   ```

---

## 2. Key Rotation Procedures

### 2.1 Rotating `APP_ENCRYPTION_KEY` (Zero-Downtime Key Rotation)
The application uses AES-256-GCM column encryption with a key ring format: `${keyId}:${ivHex}:${tagHex}:${cipherHex}`.

1. **Generate a New 32-byte Key**:
   ```bash
   openssl rand -hex 32
   ```
   Example output: `a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90`
2. **Move Current Key to the Historical Ring**:
   Suppose your current active key is `v1: 0123...cdef`.
   Configure the environment variables:
   ```env
   # New active key becomes v2:
   APP_ENCRYPTION_KEY=a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90
   ACTIVE_KEY_ID=v2

   # Previous key added to the fallback decryption ring:
   APP_ENCRYPTION_KEY_RING=v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
   ```
3. **Deploy the Updated Configuration**:
   - The application starts with `v2` as the encryption key for all new writes.
   - Any historical records tagged with `v1:` continue to decrypt seamlessly using the fallback ring.
4. **Re-encrypt Historical Records (Optional Maintenance Task)**:
   - Run a migration script that reads each encrypted row and re-saves it with the new active key (`v2`).
   - Once all rows are updated, historical keys can be removed from `APP_ENCRYPTION_KEY_RING`.

### 2.2 Rotating Google OAuth Client Secrets
1. Open the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Under **OAuth 2.0 Client IDs**, select your application's client credentials.
3. Click **Add secret** to generate a new secondary secret.
4. Update `GOOGLE_CLIENT_SECRET` in your production secret manager.
5. Deploy the backend service and test a Google sign-in workflow.
6. Once verified, delete the old secret in Google Cloud Console.

---

## 3. Disabling or Locking a Compromised User Account

When a user's credentials or physical device are reported lost or stolen:

### Step 1: Immediate Account Lockout
1. Navigate to **User Management** in the Super Admin UI (`/users`).
2. Search for the user by name, email, or employee ID.
3. Toggle the account status to **Deactivated / Inactive**.

### Step 2: Invalidate Active User Sessions
1. Invalidate all active sessions for that specific user ID:
   ```typescript
   import { sessionStore } from './lib/sessionStore.js'
   sessionStore.revokeUserSessions(userId)
   ```
2. The user's active session is terminated within 30 seconds or on their next API request.

### Step 3: Reset MFA and Temporary Password
1. In the user edit panel, click **Reset MFA**. This purges the user's stored TOTP secret and recovery codes.
2. Generate a 24-hour single-use setup link or temporary password for the user.
3. Check the audit log for any actions taken during the suspected compromise window.

---

## 4. Investigating Security Incidents via the Cryptographic Audit Log

The portal maintains a cryptographically chained SHA-256 audit trail in the `audit_events` table.

### 4.1 Verifying Audit Trail Integrity
To check if any audit records have been deleted, reordered, or modified:
1. Log in as Super Admin and navigate to **Audit Viewer** (`/audit`).
2. Click **Verify Log Integrity** (calls `POST /audit/verify`).
3. If integrity is intact:
   ```json
   {
     "status": "valid",
     "verifiedRecords": 1420,
     "latestHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
   }
   ```
4. If tampering occurred, the response indicates the exact record where the cryptographic chain was broken:
   ```json
   {
     "status": "tampered",
     "brokenAtRecordId": "evt_2026_0981",
     "expectedHash": "...",
     "actualHash": "..."
   }
   ```

### 4.2 Querying Security Events
Filter the audit log using structured JSON query filters:
- **Failed Logins & Lockouts**: `action = 'auth.login_failed'` or `action = 'auth.account_locked'`.
- **Privilege Violations**: `action = 'security.permission_denied'`.
- **Malware or Rejected Uploads**: `action = 'file.rejected_malware'` or `action = 'file.rejected_type'`.
- **Exporting Evidence**: Click **Export CSV** (`GET /audit/export.csv`) to obtain a sanitized evidence report for legal/compliance review.

---

## 5. Security Incident Response Protocol (Breach Playbook)

In the event of an active security incident:

### Phase 1: Identification & Triage (0 - 15 minutes)
- Correlate client alerts and anomalous audit events. Identify affected user accounts and IP addresses.
- Check structured JSON application logs for security warnings (`grep '"level":"warn"'`).

### Phase 2: Containment (15 - 30 minutes)
- **Account-Level Containment**: Deactivate compromised user accounts and revoke user sessions.
- **IP-Level Containment**: Block offending IP addresses or CIDR blocks at the reverse proxy (Cloudflare/Nginx/AWS WAF).
- **Global Containment**: If systemic compromise is suspected, execute **Emergency Session Revocation** (Section 1) and temporarily place the portal into maintenance mode (`503 Service Unavailable`).

### Phase 3: Eradication (30 - 90 minutes)
- Check all recent appointments created or modified by affected accounts.
- Inspect uploaded files in `backend/uploads/` during the incident window.
- Verify audit chain integrity using `POST /audit/verify`.

### Phase 4: Recovery & Post-Incident
- Rotate all database credentials and `APP_ENCRYPTION_KEY` using the zero-downtime rotation procedure.
- Re-enable user accounts only after mandatory password resets and MFA re-enrollment.
- Document timeline, root cause, and remediation steps in a post-incident report.

---

## 6. Disaster Recovery & Backup Restoration

### 6.1 Database Restore
1. Locate the latest encrypted database dump (`pg_dump`) in backup storage.
2. Confirm the backup SHA-256 checksum matches the signed manifest.
3. Restore into a staging PostgreSQL instance first:
   ```bash
   pg_restore --clean --if-exists -h staging-db -U app_portal_migrator -d appointment_portal backup_2026_10_29.dump
   ```
4. Run automated test suite against staging database: `npm run test:security`.
5. Point production traffic to the restored instance.

### 6.2 Upload Storage Restore
1. Restore documents from cold object storage (`S3` / `Google Cloud Storage`) to `backend/uploads/`.
2. Run orphan cleanup and integrity check script:
   ```bash
   npx tsx backend/src/scripts/check-schema.ts
   ```
3. Verify file permissions: Ensure files are owned by the application service account and non-executable (`chmod 600 backend/uploads/*`).
