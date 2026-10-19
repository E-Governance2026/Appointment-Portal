-- ═══════════════════════════════════════════════════════════════════════════
-- 0006 — Audit events (append-only timeline)
-- Mirrors src/data/auditLog.ts (AuditEvent). Every approval decision, status
-- change, remark, check-in/out and notification is appended here. Rows are
-- never updated or deleted in normal operation.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists audit_events (
  id                   uuid primary key default gen_random_uuid(),
  appointment_id       text not null references appointments(id) on delete cascade,
  action               audit_action not null,
  actor_id             text not null,
  actor_name           text not null,
  actor_role           text not null,                 -- 'system' allowed, so plain text
  summary              text not null,
  detail               text,
  from_status          appointment_status,
  to_status            appointment_status,
  visible_to_requester boolean not null default true,
  timestamp            timestamptz not null default now()
);

create index if not exists idx_audit_appointment on audit_events(appointment_id);
create index if not exists idx_audit_timestamp   on audit_events(timestamp);
