-- ═══════════════════════════════════════════════════════════════════════════
-- 0005 — Appointments (the central table)
-- Mirrors src/data/approvalData.ts (ApprovalRecord). date/time are NULLABLE:
-- under the revised flow the requester may leave the slot open and the
-- authority sets it at approval.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists appointments (
  id                 text primary key,                 -- 'APT-2026-xxxx'
  requester          text not null,
  requester_id       text,                             -- app user id when known
  requester_initials text not null default '',
  requester_category text not null default '',         -- Staff / Student / External

  type_id            text references appointment_types(id) on update cascade,
  type_name          text not null default '',
  purpose_label      text not null default '',
  department         text not null default '',

  authority_id       text references authorities(id) on update cascade,
  authority_name     text not null default '',

  date               date,                             -- nullable: slot optional
  time               text,                             -- 'HH:MM', nullable
  subject            text not null default '',
  description        text not null default '',
  mode               meeting_mode not null default 'physical',
  location_label     text not null default '',
  documents_count    integer not null default 0,

  status             appointment_status not null default 'submitted',
  submitted_at       timestamptz not null default now(),

  -- Workflow assignment
  assigned_stage     text not null default '',
  assigned_role      role,
  assigned_to_id     text,

  -- Reschedule proposal (authority proposes; requester responds)
  proposed_date      date,
  proposed_time      text,

  -- Visit tracking (reception desk)
  checked_in_at      timestamptz,
  checked_out_at     timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists trg_appointments_updated on appointments;
create trigger trg_appointments_updated before update on appointments
  for each row execute function set_updated_at();

create index if not exists idx_appointments_status        on appointments(status);
create index if not exists idx_appointments_date          on appointments(date);
create index if not exists idx_appointments_authority     on appointments(authority_id);
create index if not exists idx_appointments_assigned_role on appointments(assigned_role);
create index if not exists idx_appointments_requester_id  on appointments(requester_id);
