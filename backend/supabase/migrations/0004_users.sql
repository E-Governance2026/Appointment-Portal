-- ═══════════════════════════════════════════════════════════════════════════
-- 0004 — User accounts
-- Mirrors src/data/userData.ts (ManagedUser). auth_user_id links to Supabase
-- auth.users once real authentication is wired (Phase B2); nullable for now so
-- the seed can load demo users before auth accounts exist.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists users (
  id           text primary key,                      -- app id, e.g. 'u-sup'
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name         text not null,
  email        citext not null unique,
  employee_id  text not null default '',
  department   text not null default '',
  role         role not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_users_updated on users;
create trigger trg_users_updated before update on users
  for each row execute function set_updated_at();

create index if not exists idx_users_role on users(role);
create index if not exists idx_users_active on users(active);
