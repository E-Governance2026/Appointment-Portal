# Database migrations (Phase B1)

These SQL files create the schema for the Appointment Portal, derived directly
from the frontend data models. Run them with the **Supabase SQL Editor**.

## How to apply

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Open each file below **in order**, paste its contents, and click **Run**.
3. Run them one at a time so an error is easy to locate.

| Order | File | Creates |
|-------|------|---------|
| 1 | `0001_extensions_and_enums.sql` | pgcrypto, citext, enums (`role`, `appointment_status`, `audit_action`, `meeting_mode`), `set_updated_at()` |
| 2 | `0002_master_data.sql` | `departments`, `appointment_types`, `authorities`, `authority_types` |
| 3 | `0003_availability.sql` | `availability`, `working_hours`, `holidays` |
| 4 | `0004_users.sql` | `users` (links to `auth.users`) |
| 5 | `0005_appointments.sql` | `appointments` (date/time nullable — slot optional) |
| 6 | `0006_audit_events.sql` | `audit_events` (append-only timeline) |

Order matters: later files reference tables and enums from earlier ones.

## Notes

- **Ids are text slugs** that match the frontend seed (`academic`, `auth-ss`,
  `u-sup`, `APT-2026-xxxx`) so mock and real data line up one-to-one.
- **Row Level Security is not enabled yet.** It is added in Phase B3 together
  with the policies that mirror `canViewAppointment` / `permissions.ts`.
- These files are idempotent where practical (`if not exists`, guarded enum
  creation), so re-running is safe.

## Verify

After running all six, from `backend/` run:

```
npx tsx src/scripts/check-schema.ts
```

It lists which expected tables exist in the project.
