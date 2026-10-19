-- ═══════════════════════════════════════════════════════════════════════════
-- 0002 — Master data: departments, appointment_types, authorities
-- Mirrors src/data/masterData.ts. Text slug ids match the frontend seed
-- (e.g. 'academic', 'auth-ss') so mock and real data line up one-to-one.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── departments ──
create table if not exists departments (
  id         text primary key,
  name       text not null unique,
  code       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_departments_updated on departments;
create trigger trg_departments_updated before update on departments
  for each row execute function set_updated_at();

-- ── appointment_types ──
create table if not exists appointment_types (
  id                       text primary key,
  name                     text not null unique,
  description              text not null default '',
  default_duration_minutes integer not null default 30 check (default_duration_minutes > 0),
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

drop trigger if exists trg_types_updated on appointment_types;
create trigger trg_types_updated before update on appointment_types
  for each row execute function set_updated_at();

-- ── authorities ──
create table if not exists authorities (
  id          text primary key,
  name        text not null,
  initials    text not null default '',
  designation text not null default '',
  department  text not null references departments(name) on update cascade,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_authorities_updated on authorities;
create trigger trg_authorities_updated before update on authorities
  for each row execute function set_updated_at();

create index if not exists idx_authorities_department on authorities(department);

-- ── authority_types (which types each authority handles) ──
create table if not exists authority_types (
  authority_id text not null references authorities(id) on delete cascade,
  type_id      text not null references appointment_types(id) on delete cascade,
  primary key (authority_id, type_id)
);

create index if not exists idx_authority_types_type on authority_types(type_id);
