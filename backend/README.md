# Appointment Portal — Backend

Node + Express + Supabase API that serves the Appointment Portal frontend. The
API holds the Supabase **service-role** key and is the only thing that talks to
the database; the browser never connects to Supabase directly. The server
reuses the frontend's domain rules (status machine, permissions, report
aggregation) so both sides enforce the same logic.

## Stack

- Node (ESM) + Express 4
- `@supabase/supabase-js` (service-role client)
- zod for request validation
- helmet + CORS allowlist + rate limiting on `/auth`
- TypeScript (NodeNext), Vitest + Supertest for tests

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the values from your Supabase
   project (Settings → API):

   ```
   NODE_ENV=development
   PORT=4000
   CORS_ORIGIN=http://localhost:5173
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_ANON_KEY=<anon key>            # used for user sign-in
   SUPABASE_SERVICE_ROLE_KEY=<service key> # SECRET — server only
   ```

   `.env` is gitignored and must never be committed.

## Database migrations

Run the SQL files in `supabase/migrations/` in order (0001 → 0010) via the
Supabase SQL Editor:

| File | Purpose |
| --- | --- |
| 0001 | extensions + enums (role, status, audit action, meeting mode) |
| 0002 | master data (departments, appointment types, authorities) |
| 0003 | availability (working hours, holidays) |
| 0004 | users |
| 0005 | appointments |
| 0006 | audit events |
| 0007 | disable RLS temporarily (dev bootstrap) |
| 0008 | grants (service-role table privileges) |
| 0009 | RLS policies (defense-in-depth) |
| 0010 | collapse roles to four (coordinator_authority, drop reception) |

Then seed and create demo logins:

```
npx tsx src/scripts/seed.ts            # reference + demo data
npx tsx src/scripts/createAuthUsers.ts # Supabase Auth logins for the 4 demo accounts
```

Demo accounts (password `Portal@2026`):

| Role | Email |
| --- | --- |
| requester | rohan.mehta@university.edu |
| coordinator_authority | dr.amit.patel@university.edu |
| admin_dispatcher | admin.user@university.edu |
| super_admin | super.admin@university.edu |

## Scripts

- `npm run dev` — start with hot reload (tsx watch)
- `npm run build` — compile TypeScript to `dist/`
- `npm start` — run the compiled server (`node dist/server.js`)
- `npm test` — run the full Vitest suite (16 test files)
- `npm run test:security` — run security hardening tests (auth, authz, session, security)
- `npm run scan:secrets` — scan repository for leaked credentials and unignored `.env`
- `npm run security:scan` — run unified audit (npm audit, gitleaks, license compliance)

Operational / verification scripts (run with `npx tsx src/scripts/<name>.ts`):

- `ping` — confirm the Supabase connection
- `check-schema` / `check-rls` / `check-roles` — verify DB state
- `check-b4` … `check-b10` — per-phase end-to-end checks
- `sweep-no-shows` — mark past, un-checked-in confirmed appointments as
  not-reported. Run on a schedule (e.g. every 15 minutes via cron / Task
  Scheduler).

## API surface

- `GET /health`
- `POST /auth/login`, `GET /auth/me`
- `GET/POST /appointments`, `GET /appointments/:id`
- Workflow: `POST /appointments/:id/{approve,reject,request-info,confirm}`
- Visitors: `POST /appointments/:id/{check-in,check-out,not-reported}`,
  `GET /appointments/reception/queue`
- Calendar: `GET /appointments/calendar`, `GET /appointments/day`
- Timeline + notifications: `GET /appointments/:id/{timeline,notifications}`
- `POST /appointments/sweep-no-shows`
- `GET/PUT /availability/:authorityId`
- `GET /reports`
- `GET /master` + CRUD for `/master/{departments,types,authorities}` (super admin)
- `GET/POST/PUT/PATCH/DELETE /users` (super admin)

All errors return `{ error: { code, message } }`.

## Deploy notes

- Set `NODE_ENV=production`, a real `CORS_ORIGIN`, and all Supabase vars. The
  server fails fast on boot if Supabase is not configured in production.
- `npm run build && npm start`.
- RLS is enabled; the API uses the service-role key, which bypasses RLS. The
  policies are defense-in-depth for any direct browser access.
