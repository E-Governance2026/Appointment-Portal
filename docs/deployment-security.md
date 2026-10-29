# Production Deployment & Infrastructure Security Checklist

This document details mandatory infrastructure, operational, and architectural requirements for production deployment that application code cannot enforce alone. Every item must be validated prior to launching the Appointment Portal into production.

---

## Pre-Launch Security Checklist Matrix

| Area | Security Requirement | Production Standard | Verification Method |
| :--- | :--- | :--- | :--- |
| **Transport** | HTTPS & TLS Encryption | Valid CA certificate; TLS 1.2 minimum, TLS 1.3 preferred. Disable SSLv2/v3, TLS 1.0/1.1. | Run SSL Labs test (`ssllabs.com`); score must be A+. |
| **Reverse Proxy** | Proxy Configuration | Configure Nginx/Cloudflare/Caddy with strict HSTS, real client IP forwarding, and `TRUST_PROXY=1`. | Inspect `X-Forwarded-For` and `Strict-Transport-Security` headers. |
| **Network & Firewall** | VPC & Ingress Filtering | Application in private subnet behind reverse proxy/WAF. Ingress restricted to 443 only. | Port scan public IP; only port 443 must be open. |
| **Database Network** | Private Database Isolation | PostgreSQL instance bound to private VPC subnet. Public internet access completely disabled. | Verify database host has non-routable private IP (`10.x.x.x` or `172.16.x.x`). |
| **Database Users** | Least-Privilege Users | Runtime user (`app_portal_runtime`) has DML only (`SELECT`, `INSERT`, `UPDATE`, `DELETE`). DDL reserved for `app_portal_migrator`. | Review `DATABASE_SECURITY.md` and query `information_schema.table_privileges`. |
| **Data Protection** | Encrypted Backups | Automated daily database snapshots encrypted with AES-256 (KMS-managed). Regular restore rehearsal. | Perform monthly test restoration to an isolated staging database. |
| **OS & Runtime** | Hardening & Patching | Ubuntu LTS / Debian minimal; automatic security updates (`unattended-upgrades`). Node.js Active LTS. | Automated vulnerability scanning (`AWS Inspector` or `Trivy`). |
| **Logging & SIEM** | Log Retention & Monitoring | Application JSON logs shipped to centralized SIEM (Datadog, CloudWatch, OpenSearch). Minimum 90-day retention. | Verify alerts trigger on security warning logs (`level: warn`). |
| **Secrets Storage** | External Secrets Manager | Secrets stored in Vault / AWS Secrets Manager / Doppler. Never stored in plaintext files on disk. | Verify zero `.env` files present on production filesystem. |
| **Time Sync** | NTP Synchronization | System clock synchronized via Network Time Protocol (`chrony` or `systemd-timesyncd`). Drift < 1 second. | Run `timedatectl status` on host VM. |
| **Assurance** | Independent Security Audit | Third-party penetration testing and vulnerability assessment prior to public cutover. | Executive sign-off on remediation of all critical/high findings. |

---

## Detailed Infrastructure Configurations

### 1. Reverse Proxy & Web Application Firewall (Nginx / Cloudflare)

When deploying behind an Nginx reverse proxy:

```nginx
# /etc/nginx/sites-available/appointment-portal.conf

server {
    listen 80;
    server_name portal.university.edu;
    # Enforce immediate HTTPS redirection
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name portal.university.edu;

    # TLS Certificates (Let's Encrypt / University CA)
    ssl_certificate /etc/letsencrypt/live/portal.university.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portal.university.edu/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # HSTS (Preload eligible)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Request Body Size Limitation (enforces upload ceiling)
    client_max_body_size 12M;

    # Forward to Node.js backend
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

*Note: Ensure `TRUST_PROXY=1` is set in the backend environment so Express correctly parses the client IP from `X-Forwarded-For`.*

---

### 2. Network Isolation & Firewall Architecture

```
                  ┌────────────────────────┐
                  │    Internet Traffic    │
                  └───────────┬────────────┘
                              │ Port 443 (HTTPS)
                              ▼
                  ┌────────────────────────┐
                  │   WAF / Reverse Proxy  │
                  └───────────┬────────────┘
                              │
                    Private VPC Subnet
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
            ▼                                   ▼
┌────────────────────────┐         ┌────────────────────────┐
│  Node.js API Service   │◄───────►│  ClamAV Antivirus Daemon│
│     (Port 4000)        │ TCP 3310│       (Port 3310)      │
└───────────┬────────────┘         └────────────────────────┘
            │ PostgreSQL (Port 5432, TLS Mandatory)
            ▼
┌────────────────────────┐
│   Managed PostgreSQL   │ (No public IP assigned;
│   Database Instance    │  accessible only within VPC)
└────────────────────────┘
```

- **Database Ingress**: Only allow TCP port 5432 ingress from the security group of the Node.js backend instances.
- **ClamAV Ingress**: Only allow TCP port 3310 ingress from the Node.js backend instances.
- **SSH / Admin Management**: Restrict SSH access to a private VPN or AWS Systems Manager Session Manager (no public port 22).

---

### 3. Least-Privilege Database Users

As specified in `DATABASE_SECURITY.md`, never connect the application in production using the `postgres` superuser:

1. **Runtime Application User (`app_portal_runtime`)**:
   - Granted `SELECT`, `INSERT`, `UPDATE`, `DELETE` on tables and sequences.
   - Strictly forbidden from `DROP TABLE`, `ALTER TABLE`, `CREATE TABLE`, or superuser roles.
2. **Schema Migration User (`app_portal_migrator`)**:
   - Used only in CI/CD deployment pipelines to execute migrations (`0001` through `0010`).
   - Credentials are not stored on application runtime servers.
3. **Database TLS Enforcement**:
   - Ensure the PostgreSQL server requires SSL connections (`pg_hba.conf`: `hostssl all all all scram-sha-256`).
   - Connection strings must specify `sslmode=require` or `sslmode=verify-full`.

---

## 4. Secrets Management in Production

Plaintext `.env` files must not exist on production servers:

- **Recommended Solutions**:
  - **AWS Systems Manager Parameter Store / Secrets Manager**
  - **HashiCorp Vault**
  - **Doppler**
  - **Kubernetes Secrets** (backed by external KMS encryption)
- **Injection Method**: Inject secrets directly into process environment variables at container startup (`docker run --env-file <(vault kv get ...)` or Kubernetes container spec).

---

## 5. Time Synchronization via NTP

Accurate system time is critical for:
1. **RFC 6238 TOTP Validation**: TOTP 30-second token windows will fail if the server clock drifts by more than 15 seconds.
2. **Session Idle Timeout Verification**: Inactivity calculations rely on accurate Unix timestamps.
3. **Audit Trail Cryptographic Hashing**: Event order and timestamps are incorporated into SHA-256 block hashes.

Ensure `chrony` or `systemd-timesyncd` is active on all host instances:
```bash
sudo timedatectl set-ntp true
timedatectl status
```

---

## 6. Pre-Launch Independent Penetration Testing

Before final public launch of the Appointment Portal:
1. Conduct an independent gray-box and black-box penetration assessment by a certified third party (OSCP, CEH, CREST).
2. The scope must cover:
   - Authentication bypass and brute-force resilience.
   - Access control, horizontal privilege escalation (IDOR), and vertical privilege escalation.
   - File upload pipeline and antivirus bypass attempts.
   - Transport security, CORS, and CSRF barriers.
   - Database isolation and SQL injection attempts.
3. All identified vulnerabilities must be remediated and retested before production cutover.
