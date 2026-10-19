-- ═══════════════════════════════════════════════════════════════════════════
-- 0010 — Collapse the role enum from 6 values to 4 (PRD §3)
--
-- The PRD defines four roles. This migration:
--   1. remaps existing data: coordinator|authority -> coordinator_authority,
--      reception -> admin_dispatcher;
--   2. replaces the `role` enum type with a 4-value version;
--   3. recreates the RLS helper functions + policies from 0009 that depend on
--      the type, using the 4-role logic.
--
-- Postgres cannot drop values from an enum in use, so we build a new type and
-- swap the columns over. The RLS helpers/policies from 0009 depend on the type,
-- so we drop them first and recreate them at the end (superseding 0009's
-- role-dependent objects). Run AFTER 0009. Safe to run once.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Drop the policies + helper functions that depend on type `role` ──
-- (They are recreated at the end. Master-data / users policies that do not use
-- the appointments role logic are dropped and recreated too, since they call
-- current_app_role() which we are about to replace.)
drop policy if exists appointments_read on appointments;
drop policy if exists audit_read        on audit_events;
drop policy if exists users_self_read   on users;
drop policy if exists users_admin_all   on users;
do $$
declare t text;
begin
  foreach t in array array['departments','appointment_types','authorities','authority_types','availability','working_hours','holidays']
  loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
  end loop;
end $$;

drop function if exists is_admin_like();
drop function if exists current_app_role();
-- current_app_user_id() does not depend on type `role`, leave it in place.

-- ── 2. Remap existing data to the target values (as TEXT, before the swap) ──
-- Temporarily widen the columns to text so we can rewrite the values without
-- the old enum rejecting the (not-yet-existing) new label.
alter table users        alter column role         type text using role::text;
alter table appointments alter column assigned_role type text using assigned_role::text;

update users
  set role = case role
    when 'coordinator' then 'coordinator_authority'
    when 'authority'   then 'coordinator_authority'
    when 'reception'   then 'admin_dispatcher'
    else role
  end;

update appointments
  set assigned_role = case assigned_role
    when 'coordinator' then 'coordinator_authority'
    when 'authority'   then 'coordinator_authority'
    when 'reception'   then 'admin_dispatcher'
    else assigned_role
  end
  where assigned_role is not null;

-- ── 3. Swap the enum type ──
alter type role rename to role_old;

create type role as enum (
  'requester',
  'coordinator_authority',
  'admin_dispatcher',
  'super_admin'
);

alter table users
  alter column role type role using role::role;
alter table appointments
  alter column assigned_role type role using assigned_role::role;

drop type role_old;

-- ── 4. Recreate the helper function + policies (4-role logic) ──
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

-- staff that may see any appointment (admin dispatcher also runs reception)
create or replace function is_admin_like()
returns boolean language sql stable as $$
  select current_app_role() in ('super_admin', 'admin_dispatcher')
$$;

-- Reference / master data: any authenticated user READs; super_admin WRITEs.
do $$
declare t text;
begin
  foreach t in array array['departments','appointment_types','authorities','authority_types','availability','working_hours','holidays']
  loop
    execute format(
      'create policy %I_read on %I for select to authenticated using (true)', t, t);
    execute format(
      'create policy %I_write on %I for all to authenticated using (current_app_role() = ''super_admin'') with check (current_app_role() = ''super_admin'')', t, t);
  end loop;
end $$;

-- users: own row, or super_admin sees/writes all.
create policy users_self_read on users
  for select to authenticated
  using (auth_user_id = auth.uid() or current_app_role() = 'super_admin');

create policy users_admin_all on users
  for all to authenticated
  using (current_app_role() = 'super_admin')
  with check (current_app_role() = 'super_admin');

-- appointments: mirrors canViewAppointment (4-role).
--   requester              → own rows
--   coordinator_authority  → rows assigned to their role (or unassigned)
--   admin_dispatcher / super_admin → all
create policy appointments_read on appointments
  for select to authenticated
  using (
    is_admin_like()
    or (current_app_role() = 'coordinator_authority'
        and (assigned_role is null or assigned_role = current_app_role()))
    or (current_app_role() = 'requester'
        and requester_id = current_app_user_id())
  );

-- audit_events: follow the parent appointment's visibility; hide internal
-- events from requesters.
create policy audit_read on audit_events
  for select to authenticated
  using (
    exists (
      select 1 from appointments a
      where a.id = audit_events.appointment_id
        and (
          is_admin_like()
          or (current_app_role() = 'coordinator_authority'
              and (a.assigned_role is null or a.assigned_role = current_app_role()))
          or (current_app_role() = 'requester'
              and a.requester_id = current_app_user_id()
              and audit_events.visible_to_requester = true)
        )
    )
  );

commit;

-- service_role bypasses all of the above automatically (used by the Node API).
