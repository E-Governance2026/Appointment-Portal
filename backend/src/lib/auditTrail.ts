// ─── Cryptographic Append-Only Audit Trail ────────────────────────────────────
// Implements an immutable, append-only audit log with SHA-256 hash chaining.
// Each record stores the hash of the preceding record (prev_hash) and computes
// its own hash over canonical serialized fields. Tampering with any historical
// record invalidates the entire subsequent chain.
//
// In SQL (Supabase / Postgres), the application role has INSERT and SELECT only:
//   GRANT INSERT, SELECT ON TABLE audit_records TO appointment_app_role;
//   REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_records FROM appointment_app_role;

import { createHash, randomUUID } from 'node:crypto'
import type { Request } from 'express'
import { getSupabase } from './supabase.js'
import { isSupabaseConfigured } from '../config/env.js'

export type AuditOutcome = 'success' | 'failure'

export interface AuditRecord {
  id:          string
  timestamp:   string // ISO UTC
  actorId:     string
  actorRole:   string
  action:      string
  entityType:  string // 'appointment' | 'user' | 'department' | 'type' | 'authority' | 'settings' | 'auth' | 'report' | 'document' | 'system'
  entityId:    string
  outcome:     AuditOutcome
  ipHash:      string
  requestId:   string
  before:      Record<string, unknown> | null
  after:       Record<string, unknown> | null
  prevHash:    string
  hash:        string
}

export interface RecordAuditInput {
  actorId?:    string
  actorRole?:  string
  action:      string
  entityType:  string
  entityId:    string
  outcome?:    AuditOutcome
  ip?:         string
  requestId?:  string
  before?:     Record<string, unknown> | null
  after?:      Record<string, unknown> | null
  req?:        Request
}

// ── In-memory append-only audit store (for tests / fallback) ──
const GENESIS_HASH = '0'.repeat(64)
const memoryAuditLog: AuditRecord[] = []

/**
 * Mask / hash IP address using SHA-256 with a salt to protect user privacy
 * while retaining audit correlation capability.
 */
export function hashIp(ip: string | undefined): string {
  if (!ip || ip === 'unknown') return '0'.repeat(64)
  return createHash('sha256')
    .update(`audit-ip-salt-${ip}`)
    .digest('hex')
}

/**
 * Sensitive fields to redact from before/after payloads before storing in audit.
 */
const SENSITIVE_KEYS = new Set([
  'password', 'passwordHash', 'currentPassword', 'newPassword',
  'token', 'refreshToken', 'csrfToken', 'secret', 'secretBase32',
  'totpSecret', 'totpSecretEncrypted', 'recoveryCodes', 'recoveryCodesHashed',
  'codeVerifier', 'nonce', 'meetingUrl',
])

export function redactSensitive(obj: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object') return null
  const clean: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      clean[key] = '[REDACTED]'
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      clean[key] = redactSensitive(val as Record<string, unknown>)
    } else if (typeof val === 'string' && (val.includes('meet.google.com') || val.includes('teams.microsoft.com') || val.includes('zoom.us'))) {
      clean[key] = '[REDACTED_LINK]'
    } else {
      clean[key] = val
    }
  }
  return clean
}

/**
 * Compute SHA-256 hash of an audit record linked to prevHash.
 */
export function computeRecordHash(fields: {
  prevHash:   string
  timestamp:  string
  actorId:    string
  actorRole:  string
  action:     string
  entityType: string
  entityId:   string
  outcome:    string
  ipHash:     string
  requestId:  string
  before:     Record<string, unknown> | null
  after:      Record<string, unknown> | null
}): string {
  // Deterministic JSON string representation
  const canonicalPayload = [
    fields.prevHash,
    fields.timestamp,
    fields.actorId,
    fields.actorRole,
    fields.action,
    fields.entityType,
    fields.entityId,
    fields.outcome,
    fields.ipHash,
    fields.requestId,
    JSON.stringify(fields.before ?? null),
    JSON.stringify(fields.after ?? null),
  ].join('|')

  return createHash('sha256').update(canonicalPayload).digest('hex')
}

/**
 * Record an append-only audit event with cryptographic hash chaining.
 */
export async function recordAuditEvent(input: RecordAuditInput): Promise<AuditRecord> {
  const actorId = input.actorId ?? input.req?.actor?.id ?? 'anonymous'
  const actorRole = input.actorRole ?? input.req?.actor?.role ?? 'anonymous'
  const ip = input.ip ?? input.req?.ip ?? 'unknown'
  const ipHash = hashIp(ip)
  const requestId = input.requestId ?? (input.req?.header('x-request-id') as string) ?? randomUUID()
  const timestamp = new Date().toISOString()
  const outcome: AuditOutcome = input.outcome ?? 'success'
  const before = redactSensitive(input.before)
  const after = redactSensitive(input.after)

  const prevHash = memoryAuditLog.length > 0
    ? memoryAuditLog[memoryAuditLog.length - 1].hash
    : GENESIS_HASH

  const hash = computeRecordHash({
    prevHash,
    timestamp,
    actorId,
    actorRole,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    outcome,
    ipHash,
    requestId,
    before,
    after,
  })

  const record: AuditRecord = {
    id: `aud-${randomUUID()}`,
    timestamp,
    actorId,
    actorRole,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    outcome,
    ipHash,
    requestId,
    before,
    after,
    prevHash,
    hash,
  }

  // Always append to memory chain
  memoryAuditLog.push(record)

  // Persist to Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabase()
      await supabase.from('audit_records').insert({
        id:          record.id,
        timestamp:   record.timestamp,
        actor_id:    record.actorId,
        actor_role:  record.actorRole,
        action:      record.action,
        entity_type: record.entityType,
        entity_id:   record.entityId,
        outcome:     record.outcome,
        ip_hash:     record.ipHash,
        request_id:  record.requestId,
        before:      record.before,
        after:       record.after,
        prev_hash:   record.prevHash,
        hash:        record.hash,
      })
    } catch {
      // Retain in memory chain even if DB insertion is not yet migrated
    }
  }

  return record
}

/**
 * Verify integrity of the audit hash chain.
 * Detects any modified, deleted, or inserted rows.
 */
export function verifyAuditHashChain(records: AuditRecord[] = memoryAuditLog): {
  valid: boolean
  verifiedCount: number
  error?: string
  tamperedIndex?: number
} {
  let expectedPrevHash = GENESIS_HASH

  for (let i = 0; i < records.length; i++) {
    const record = records[i]

    // 1. Verify link to previous row
    if (record.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        verifiedCount: i,
        error: `Broken hash chain at row ${i} (id: ${record.id}). Expected prevHash ${expectedPrevHash}, found ${record.prevHash}`,
        tamperedIndex: i,
      }
    }

    // 2. Recompute row hash from payload
    const recalculated = computeRecordHash({
      prevHash: record.prevHash,
      timestamp: record.timestamp,
      actorId: record.actorId,
      actorRole: record.actorRole,
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId,
      outcome: record.outcome,
      ipHash: record.ipHash,
      requestId: record.requestId,
      before: record.before,
      after: record.after,
    })

    if (recalculated !== record.hash) {
      return {
        valid: false,
        verifiedCount: i,
        error: `Hash mismatch at row ${i} (id: ${record.id}). Content was altered after signing.`,
        tamperedIndex: i,
      }
    }

    expectedPrevHash = record.hash
  }

  return {
    valid: true,
    verifiedCount: records.length,
  }
}

/**
 * Query audit events with pagination and filters.
 */
export interface AuditQueryFilters {
  startDate?:  string
  endDate?:    string
  actorId?:    string
  action?:     string
  entityType?: string
  entityId?:   string
  page?:       number
  pageSize?:   number
}

export function queryAuditEvents(filters: AuditQueryFilters = {}): {
  records: AuditRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
} {
  let filtered = [...memoryAuditLog]

  if (filters.startDate) {
    filtered = filtered.filter(r => r.timestamp >= filters.startDate!)
  }
  if (filters.endDate) {
    filtered = filtered.filter(r => r.timestamp <= filters.endDate!)
  }
  if (filters.actorId) {
    filtered = filtered.filter(r => r.actorId === filters.actorId)
  }
  if (filters.action) {
    filtered = filtered.filter(r => r.action === filters.action)
  }
  if (filters.entityType) {
    filtered = filtered.filter(r => r.entityType === filters.entityType)
  }
  if (filters.entityId) {
    filtered = filtered.filter(r => r.entityId === filters.entityId)
  }

  // Sort descending by timestamp
  filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  const total = filtered.length
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? 20))
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const startIdx = (page - 1) * pageSize
  const paginated = filtered.slice(startIdx, startIdx + pageSize)

  return {
    records: paginated,
    total,
    page,
    pageSize,
    totalPages,
  }
}

/**
 * Clear or reset memory audit log (used in test suite).
 */
export function __resetAuditLog(): void {
  memoryAuditLog.length = 0
}

/**
 * Direct access to memory records for tests (e.g., simulating tampering).
 */
export function __getMemoryAuditLog(): AuditRecord[] {
  return memoryAuditLog
}
