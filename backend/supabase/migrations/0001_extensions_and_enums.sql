-- ═══════════════════════════════════════════════════════════════════════════
-- 0001 — Extensions and enums
-- Run first. Enum values mirror the frontend TypeScript unions EXACTLY:
--   role              → src/config/permissions.ts  (Role)
--   appointment_status→ src/data/mockAppointments.ts (AppointmentStatus, 10)
--   audit_action      → src/data/auditLog.ts (AuditAction, 17)
--   meeting_mode      → ApprovalRecord.mode
-- ═══════════════════════════════════════════════════════════════════════════

-- gen_random_uuid()
create extension if not exists pgcrypto;

-- Case-insensitive text for unique emails.
create extension if not exists citext;

-- ── role (6) ──
do $$ begin
  create type role as enum (
    'requester',
    'coordinator',
    'authority',
    'admin_dispatcher',
    'super_admin',
    'reception'
  );
exception when duplicate_object then null; end $$;

-- ── appointment_status (10) ──
do $$ begin
  create type appointment_status as enum (
    'draft',
    'submitted',
    'additional-info',
    'approved',
    'confirmed',
    'rescheduled',
    'completed',
    'cancelled',
    'rejected',
    'not-reported'
  );
exception when duplicate_object then null; end $$;

-- ── audit_action (17) ──
do $$ begin
  create type audit_action as enum (
    'submitted',
    'reviewed',
    'info-requested',
    'info-provided',
    'approved',
    'rejected',
    'confirmed',
    'reschedule-proposed',
    'reschedule-accepted',
    'reschedule-declined',
    'cancelled',
    'forwarded',
    'internal-remark',
    'checked-in',
    'checked-out',
    'completed',
    'not-reported',
    'notification-sent'
  );
exception when duplicate_object then null; end $$;

-- ── meeting_mode (3) ──
do $$ begin
  create type meeting_mode as enum ('physical', 'online', 'phone');
exception when duplicate_object then null; end $$;

-- ── Shared updated_at trigger function ──
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
