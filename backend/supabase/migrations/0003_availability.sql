-- ═══════════════════════════════════════════════════════════════════════════
-- 0003 — Availability configuration per authority
-- Mirrors src/data/availabilityData.ts (Availability, WorkingHours, Holiday).
-- weekday: 0 = Sunday … 6 = Saturday (JS Date.getDay()).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── availability (one row per authority) ──
create table if not exists availability (
  authority_id text primary key references authorities(id) on delete cascade,
  slot_minutes integer not null default 30 check (slot_minutes > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_availability_updated on availability;
create trigger trg_availability_updated before update on availability
  for each row execute function set_updated_at();

-- ── working_hours (one row per authority per weekday) ──
create table if not exists working_hours (
  authority_id text not null references authorities(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),
  enabled      boolean not null default false,
  start_time   text not null default '09:00',   -- HH:MM 24h
  end_time     text not null default '17:00',   -- HH:MM 24h
  primary key (authority_id, weekday)
);

-- ── holidays (one-off closed dates per authority) ──
create table if not exists holidays (
  id           uuid primary key default gen_random_uuid(),
  authority_id text not null references authorities(id) on delete cascade,
  date         date not null,
  label        text not null default '',
  unique (authority_id, date)
);

create index if not exists idx_holidays_authority on holidays(authority_id);
