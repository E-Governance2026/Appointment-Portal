-- ═══════════════════════════════════════════════════════════════════════════
-- 0008 — Table privileges (GRANTs)
--
-- WHY: error 42501 "permission denied" persisted even with RLS disabled. That
-- means the Postgres role the key authenticates as lacks table-level
-- privileges. Supabase normally grants these automatically, but with the new
-- API key system the legacy roles may not have them on freshly created tables.
-- This grants the needed privileges to service_role (the backend) and to the
-- anon/authenticated roles (harmless now; RLS will gate them in B3).
--
-- Run AFTER 0001–0007.
-- ═══════════════════════════════════════════════════════════════════════════

-- Service role: full access (this is the backend's role).
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- anon + authenticated: read/write at the table level; real access is gated by
-- RLS policies added in Phase B3. Granting now avoids 42501 during development.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- Make the grants apply to any tables created later too.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
