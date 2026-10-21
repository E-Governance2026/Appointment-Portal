# Frontend → Backend cutover

The frontend can run against in-memory mock data (default) or the real Node +
Supabase backend. The switch is a single environment variable.

## Run both together (local)

1. Backend (see `backend/README.md` for full setup — needs `backend/.env` with
   Supabase keys, and migrations 0001–0010 applied):

   ```
   cd backend
   npm install
   npm run dev          # http://localhost:4000
   ```

2. Frontend: create `.env` (or `.env.local`) at the repo root from
   `.env.example`:

   ```
   VITE_DATA_SOURCE=supabase
   VITE_API_BASE_URL=http://localhost:4000
   ```

   Then:

   ```
   npm install
   npm run dev          # http://localhost:5173
   ```

3. Sign in with a demo account (password `Portal@2026`):

   | Role | Email |
   | --- | --- |
   | requester | rohan.mehta@university.edu |
   | coordinator_authority | dr.amit.patel@university.edu |
   | admin_dispatcher | admin.user@university.edu |
   | super_admin | super.admin@university.edu |

Leave `VITE_DATA_SOURCE` unset (or `mock`) to run fully offline against the demo
data — no backend required. The automated test suite always runs on the mock
path.

## What is wired to the backend

Through `src/services/appointmentsService.ts` (and the login flow):

- Auth: real login (`POST /auth/login`), token stored and sent as a bearer on
  every request.
- Appointments: list, single, calendar range, single day, reception queue.
- Workflow: approve, reject, request info, confirm, forward, internal remark,
  reschedule (propose + respond), cancel, provide info, mark not-reported.
- Visitors: check-in, check-out.
- Timeline + availability read/update, reports, master-data CRUD, user CRUD.
- Booking submit (`POST /appointments`, 3-step flow with an idempotency key).

The full appointment lifecycle — book, review, request/provide info, approve,
confirm, reschedule, cancel, check in/out, and no-show — now runs against the
backend, with every action recorded in the audit timeline.

## What is still mock (deferred)

These have no backend endpoint yet and keep serving demo data even when
`VITE_DATA_SOURCE=supabase`:

- Dashboard widgets (`useDashboard` / `mockAppointments`: today's list, all
  appointments, dashboard stats).
- Booking reference reads (appointment types, purposes, authority lists,
  month/day slot availability, locations, document types, draft save/load,
  document upload, next-available).
- Static pages that render seed data directly: Track, My appointments,
  Appointment detail.
