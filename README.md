# Appointment Portal — E-Governance Appointment System

A secure, multi-role appointment scheduling and visitor management portal designed for institutional e-governance. Built with a React 19 + TypeScript frontend and a hardened Node.js + Express backend interfacing with PostgreSQL/Supabase.

---

## Architecture Overview

- **Frontend (`/`)**: React 19, TypeScript, Tailwind CSS, TanStack Query, React Hook Form, Zod.
- **Backend (`/backend`)**: Node.js (ESM), Express 4, Supabase client (service-role architecture), Argon2id, Busboy, Helmet, ClamAV antivirus integration.
- **Security Posture**: Aligned with **OWASP ASVS v4.0.3**. Implements deny-by-default RBAC, record-level authorization (IDOR defense), Argon2id password hashing, RFC 6238 TOTP MFA, AES-256-GCM column encryption with key rotation, streaming upload verification, CSP/HSTS headers, and cryptographic append-only audit logging.

---

## Quick Start

### 1. Installation

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend && npm install && cd ..
```

### 2. Environment Configuration

Copy `.env.example` in both root and `backend/`:

```bash
# Frontend configuration
cp .env.example .env

# Backend configuration
cp backend/.env.example backend/.env
```

Review and customize the environment settings. See the [Configuration Reference](#configuration-reference) below.

### 3. Running Locally

```bash
# Terminal 1: Start backend API server (port 4000)
cd backend
npm run dev

# Terminal 2: Start frontend dev server (port 5173)
npm run dev
```

---

## Configuration Reference

### Backend Settings (`backend/.env`)

| Variable | Type | Default | Description & Safe Setting |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | String | `development` | Set to `production` in production (enforces fail-fast rules). |
| `PORT` | Number | `4000` | Port for the API server. |
| `ALLOWED_ORIGINS` | Comma list | `http://localhost:5173` | Allowed browser origins for CORS & CSRF. No wildcards. |
| `TRUST_PROXY` | Number | `0` | Number of reverse proxy hops (e.g. `1` behind Nginx/Cloudflare). |
| `COOKIE_SECURE` | Boolean | `false` | In production MUST be `true` (`__Host-sid` cookie flag). |
| `SESSION_SECRET` | String | *dev-string* | High-entropy session secret (minimum 32 characters in production). |
| `SESSION_IDLE_TIMEOUT_SECONDS`| Number | `180` | Inactivity seconds before session expiration (3 minutes). |
| `SESSION_WARNING_SECONDS` | Number | `30` | Seconds before idle timeout to show warning modal (at 2m30s). |
| `SESSION_ABSOLUTE_TIMEOUT_SECONDS`| Number | `28800` | Hard cap on session lifetime (8 hours). |
| `DEMO_ROLE_SWITCHER` | Boolean | `false` | Must NEVER be `true` in production (enforced at startup). |
| `SUPABASE_URL` | URL | - | Supabase project URL. |
| `SUPABASE_ANON_KEY` | String | - | Public anon key for client-side authentication. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | - | Secret server key for database operations. |
| `DATABASE_URL` | URL | - | Direct PostgreSQL URL (must include `sslmode=require` in prod). |
| `APP_ENCRYPTION_KEY` | Hex / 32B | - | 32-byte key for AES-256-GCM column encryption. |
| `ACTIVE_KEY_ID` | String | `v1` | Identifier tagged to new ciphertexts (`keyId:iv:tag:cipher`). |
| `APP_ENCRYPTION_KEY_RING` | String | - | Historical key ring for zero-downtime key rotation. |
| `FEATURES_MFA` | Boolean | `true` | Multi-Factor Authentication (TOTP + recovery codes). |
| `FEATURES_SELF_SERVICE_RESET` | Boolean | `false` | Self-service email password reset flag. |
| `GOOGLE_ALLOWED_DOMAINS` | Comma list | `university.edu` | Allowed Google Workspace domains for OAuth login. |
| `MAX_FILE_SIZE_MB` | Number | `10` | Maximum file size per attachment in megabytes. |
| `MAX_FILES_PER_APPOINTMENT` | Number | `5` | Maximum number of attachments per appointment. |
| `MAX_STORAGE_PER_USER_MB` | Number | `50` | Maximum aggregate storage quota per user in megabytes. |
| `CLAMAV_ENABLED` | Boolean | `false` | ClamAV TCP streaming scanner. Recommended `true` in production. |
| `CLAMAV_HOST` | String | `localhost` | ClamAV daemon TCP host. |
| `CLAMAV_PORT` | Number | `3310` | ClamAV daemon TCP port. |

### Frontend Settings (`.env`)

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `VITE_DATA_SOURCE` | String | `mock` | `mock` for client demo data; `supabase` to connect to backend. |
| `VITE_API_BASE_URL` | URL | `http://localhost:4000` | Backend API base URL. |
| `VITE_DEMO_SWITCHER` | Boolean | `false` | Set to `false` in production to hide demo controls. |

---

## Security Verification & Audits

### Automated Test & Scan Commands

```bash
# Run the complete Automated Security Test Suite (backend + frontend)
npm run test:security

# Run the Unified Security Audit (npm audit, gitleaks/secrets, license compliance, ZAP)
npm run security:scan

# Run all unit and integration tests
npm test
```

### OWASP ZAP Baseline Scanning

To run an automated dynamic application security test (DAST) using OWASP ZAP:

```bash
# Start Docker Desktop and ensure backend (port 4000) is running locally
docker run -t --rm -v $(pwd):/zap/wrk/:rw zaproxy/zap-stable zap-baseline.py \
  -t http://host.docker.internal:4000 -r zap_report.html
```

> **IMPORTANT**: NEVER run OWASP ZAP or any automated vulnerability scanner against a production environment.

---

## Security Documentation Index

- [Manual Security Test Checklist](file:///c:/MIS%20appointment%20system/docs/security-test-checklist.md): Step-by-step verification procedures for manual QA and penetration testing.
- [OWASP ASVS Implementation Guide](file:///c:/MIS%20appointment%20system/docs/security.md): Detailed mapping of controls to OWASP ASVS v4.0.3, threat model, and limitations.
- [Security Operations Runbook](file:///c:/MIS%20appointment%20system/docs/security-runbook.md): Emergency session revocation, key rotation, breach incident response, and restore.
- [Production Deployment Security Checklist](file:///c:/MIS%20appointment%20system/docs/deployment-security.md): Infrastructure, reverse proxy, database isolation, and pre-launch hardening.
- [Database Security Specification](file:///c:/MIS%20appointment%20system/DATABASE_SECURITY.md): Least-privilege runtime user (`app_portal_runtime`), migrator user, and TLS setup.
