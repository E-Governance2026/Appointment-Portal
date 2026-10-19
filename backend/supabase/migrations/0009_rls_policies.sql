-- ═══════════════════════════════════════════════════════════════════════════
-- 0009 — Row Level Security policies (defense-in-depth)
--
-- IMPORTANT: the Node API connects with the SERVICE ROLE key, which BYPASSES
-- RLS. So re-enabling RLS here does NOT affect the API — every current feature
-- keeps working. These policies gate any DIRECT browser → Supabase access
-- (e.g. if the frontend ever uses the anon key), mirroring canViewAppointment
-- and the role → action rules from src/config/permissions.ts.
--
-- Run AFTER 0001–0008. This reverses the temporary 0007 (disable RLS).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helper: the signed-in caller's application role ──
-- Maps the Supabase auth user (auth.uid()) to the app users row and returns the
-- role. Returns NULL for an unauthenticated / unlinked caller.
create or replace function current_app_role()
returns role
language sql
stable
security definer
set search_path = public
as $$
  select u.role
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1
$$;

-- ── Helper: the signed-in caller's application user id ──
create or replace function current_app_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1
$$;

-- Convenience predicates.
-- staff that may see any appointment
create or replace function is_admin_like()
returns boolean language sql stable as $$
  select current_app_role() in ('super_admin', 'admin_dispatcher', 'reception')
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Re-enable RLS on every table (reverses 0007).
-- ═══════════════════════════════════════════════════════════════════════════
alter table departments       enable row level security;
alter table appointment_types enable row level security;
alter table authorities       enable row level security;
alter table authority_types   enable row level security;
alter table availability      enable row level security;
alter table working_hours     enable row level security;
alter table holidays          enable row level security;
alter table users             enable row level security;
alter table appointments      enable row level security;
alter table audit_events      enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- Reference / master data: any authenticated user may READ; only super_admin
-- may WRITE. (The booking flow and dashboards read these.)
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['departments','appointment_types','authorities','authority_types','availability','working_hours','holidays']
  loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format(
      'create policy %I_read on %I for select to authenticated using (true)', t, t);
    execute format(
      'create policy %I_write on %I for all to authenticated using (current_app_role() = ''super_admin'') with check (current_app_role() = ''super_admin'')', t, t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- users: a user may read their own row; super_admin may read/write all.
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists users_self_read on users;
drop policy if exists users_admin_all on users;

create policy users_self_read on users
  for select to authenticated
  using (auth_user_id = auth.uid() or current_app_role() = 'super_admin');

create policy users_admin_all on users
  for all to authenticated
  using (current_app_role() = 'super_admin')
  with check (current_app_role() = 'super_admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- appointments: mirrors canViewAppointment.
--   requester  → rows where requester_id = own id
--   authority/coordinator → rows whose assigned_role = their role (or null)
--   admin_dispatcher / super_admin / reception → all
-- Writes are performed by the API (service role) only; no direct-client write
-- policy is granted here, so the anon/authenticated path is read-only.
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists appointments_read on appointments;

create policy appointments_read on appointments
  for select to authenticated
  using (
    is_admin_like()
    or (current_app_role() in ('authority','coordinator')
        and (assigned_role is null or assigned_role = current_app_role()))
    or (current_app_role() = 'requester'
        and requester_id = current_app_user_id())
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- audit_events: follow the parent appointment's visibility, and hide
-- internal (visible_to_requester = false) events from requesters.
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists audit_read on audit_events;

create policy audit_read on audit_events
  for select to authenticated
  using (
    exists (
      select 1 from appointments a
      where a.id = audit_events.appointment_id
        and (
          is_admin_like()
          or (current_app_role() in ('authority','coordinator')
              and (a.assigned_role is null or a.assigned_role = current_app_role()))
          or (current_app_role() = 'requester'
              and a.requester_id = current_app_user_id()
              and audit_events.visible_to_requester = true)
        )
    )
  );

-- service_role bypasses all of the above automatically (used by the Node API).
