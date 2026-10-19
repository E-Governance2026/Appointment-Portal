-- ═══════════════════════════════════════════════════════════════════════════
-- 0007 — Temporarily DISABLE Row Level Security (development only)
--
-- WHY: Supabase enables RLS on new tables by default. With the new API key
-- system, the legacy service_role JWT no longer reliably bypasses RLS, so the
-- backend (holding the service key) is blocked by the default "deny all".
--
-- For Phases B1–B2 the Node API is the ONLY path to the database (the browser
-- never talks to Supabase directly), so RLS adds no protection yet. Proper RLS
-- policies that mirror permissions.ts / canViewAppointment are added in B3,
-- at which point we re-enable it.
--
-- Run this AFTER 0001–0006.
-- ═══════════════════════════════════════════════════════════════════════════

alter table departments       disable row level security;
alter table appointment_types disable row level security;
alter table authorities       disable row level security;
alter table authority_types   disable row level security;
alter table availability      disable row level security;
alter table working_hours     disable row level security;
alter table holidays          disable row level security;
alter table users             disable row level security;
alter table appointments      disable row level security;
alter table audit_events      disable row level security;
