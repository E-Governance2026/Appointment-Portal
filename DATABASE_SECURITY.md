# Database Security & Least-Privilege Architecture

This document establishes the least-privilege database user architecture, migration separation, and transport security policies for the Appointment Portal in accordance with enterprise security hardening standards.

---

## 1. Role & User Separation

In production, the application runtime MUST NEVER connect using `postgres`, `supabase_admin`, or any role with `SUPERUSER` or `CREATEDB` privileges. Separate roles are enforced for runtime queries vs schema migrations.

```
┌─────────────────────────────────┐      ┌─────────────────────────────────┐
│     Application Runtime         │      │      CI/CD / Migration Tool     │
│   User: app_portal_runtime      │      │   User: app_portal_migrator     │
└────────────────┬────────────────┘      └────────────────┬────────────────┘
                 │                                        │
                 │ DML Only (SELECT, INSERT,              │ DDL Only (CREATE, ALTER,
                 │ UPDATE, DELETE on application tables)  │ DROP, GRANT, INDEX)
                 ▼                                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          PostgreSQL Database                             │
│                      (Parul University MIS DB)                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### A. Runtime Role: `app_portal_runtime` (Least Privilege)
- **Permissions**: `SELECT`, `INSERT`, `UPDATE`, `DELETE` on specific application tables only.
- **Explicit Restrictions**:
  - `NO SUPERUSER`
  - `NO CREATEDB`, `NO CREATEROLE`
  - Cannot execute `DROP TABLE`, `ALTER TABLE`, `TRUNCATE`, or `CREATE TABLE` (DDL).
  - Explicitly denied access to PostgreSQL internal catalogs (`pg_authid`, `pg_shadow`) and system secrets.
  - Cannot modify database extensions or foreign data wrappers.

#### SQL Provisioning Script:
```sql
-- 1. Create runtime application user
CREATE ROLE app_portal_runtime WITH LOGIN PASSWORD 'STRONG_RANDOMLY_GENERATED_PASSWORD_MIN_32_CHARS';

-- 2. Revoke default public permissions
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;

-- 3. Grant schema usage
GRANT USAGE ON SCHEMA public TO app_portal_runtime;

-- 4. Grant least-privilege DML access only
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.appointments,
  public.users,
  public.departments,
  public.appointment_types,
  public.system_settings,
  public.audit_log,
  public.sessions
TO app_portal_runtime;

-- 5. Grant sequence usage for autoincrement / serial primary keys
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_portal_runtime;

-- 6. Lock down future table defaults
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC;
```

---

### B. Migration Role: `app_portal_migrator` (DDL Admin)
- **Permissions**: Full schema management (`CREATE`, `ALTER`, `DROP`, `INDEX`) on `public` schema.
- **Execution**: Only invoked during automated deployment CI/CD pipelines (e.g. `supabase db push` or Flyway/Prisma migrations) or authorized DBA maintenance windows.
- **Never Used by Web Workers**: The backend web application process is never configured with migrator credentials.

#### SQL Provisioning Script:
```sql
CREATE ROLE app_portal_migrator WITH LOGIN PASSWORD 'STRONG_MIGRATOR_SECRET_KEY';
GRANT USAGE, CREATE ON SCHEMA public TO app_portal_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_portal_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_portal_migrator;
```

---

## 2. TLS / Transport Security Enforcement

1. **Mandatory SSL/TLS in Production**:
   - Connection strings in production must append `sslmode=verify-full` or `sslmode=require` with trusted CA certificates:
     ```
     DATABASE_URL=postgresql://app_portal_runtime:secret@db.paruluniversity.ac.in:5432/mis_portal?sslmode=verify-full&sslrootcert=/etc/ssl/certs/supabase-root.crt
     ```
2. **Server-side TLS Enforcement in `postgresql.conf`**:
   ```ini
   ssl = on
   ssl_min_protocol_version = 'TLSv1.3'
   ssl_ciphers = 'HIGH:!aNULL:!kEDH'
   ```
3. **`pg_hba.conf` Restrictions**:
   ```
   # Force SSL on all remote client connections
   hostssl    mis_portal    app_portal_runtime    0.0.0.0/0    scram-sha-256
   hostssl    mis_portal    app_portal_migrator   CI_AGENT_IP  scram-sha-256
   # Reject cleartext connections
   hostnossl  all           all                   0.0.0.0/0    reject
   ```

---

## 3. Cryptographic Row-Level & At-Rest Encryption

Sensitive attributes stored in PostgreSQL are encrypted client-side using **AES-256-GCM** before database transmission:
1. **Google OAuth Refresh Tokens**: encrypted with `APP_ENCRYPTION_KEY`.
2. **User MFA TOTP Secrets**: encrypted with `APP_ENCRYPTION_KEY`.
3. **Backup Recovery Codes**: stored as one-way **SHA-256** digests.

Even if a database dump or read replica is compromised, plain-text credentials and 2FA secrets cannot be decrypted without the application host symmetric master key.
