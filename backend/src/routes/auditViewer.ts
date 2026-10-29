// ─── Super Admin Audit Log Viewer & Integrity Verification ─────────────────────
// Endpoints:
// - GET  /audit            — paginated audit trail with date/actor/action/entity filters
// - GET  /audit/export.csv — CSV export with UTF-8 BOM, requires recent authentication
// - POST /audit/verify     — cryptographic hash chain verification (tamper detection)

import { Router, type Request, type Response, type NextFunction } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireRecentAuth } from '../middleware/recentAuth.js'
import { declarePermission } from '../middleware/permission.js'
import {
  queryAuditEvents,
  verifyAuditHashChain,
  recordAuditEvent,
} from '../lib/auditTrail.js'

export const auditViewerRouter = Router()

// Default retention days (configurable via AUDIT_RETENTION_DAYS, defaults to 365)
const AUDIT_RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || '365', 10)

// GET /audit — paginated list of audit records
auditViewerRouter.get(
  '/',
  requireAuth(),
  declarePermission('GET', '/audit', 'user.manage'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10) || 20))

      const result = queryAuditEvents({
        startDate:  req.query.startDate ? String(req.query.startDate).trim() : undefined,
        endDate:    req.query.endDate ? String(req.query.endDate).trim() : undefined,
        actorId:    req.query.actorId ? String(req.query.actorId).trim() : undefined,
        action:     req.query.action ? String(req.query.action).trim() : undefined,
        entityType: req.query.entityType ? String(req.query.entityType).trim() : undefined,
        entityId:   req.query.entityId ? String(req.query.entityId).trim() : undefined,
        page,
        pageSize,
      })

      res.setHeader('Cache-Control', 'no-store')
      res.json({
        ...result,
        retentionDays: AUDIT_RETENTION_DAYS,
      })
    } catch (err) {
      next(err)
    }
  },
)

import { sanitizeCsvCell } from '../lib/sanitizer.js'

// Helper to escape CSV values safely against formula injection (=, +, -, @)
function escapeCsv(value: unknown): string {
  return sanitizeCsvCell(value)
}

// GET /audit/export.csv — CSV export with UTF-8 BOM, requiring recent authentication
auditViewerRouter.get(
  '/export.csv',
  requireAuth(),
  declarePermission('GET', '/audit/export.csv', 'user.manage'),
  requireRecentAuth(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = queryAuditEvents({
        startDate:  req.query.startDate ? String(req.query.startDate).trim() : undefined,
        endDate:    req.query.endDate ? String(req.query.endDate).trim() : undefined,
        actorId:    req.query.actorId ? String(req.query.actorId).trim() : undefined,
        action:     req.query.action ? String(req.query.action).trim() : undefined,
        entityType: req.query.entityType ? String(req.query.entityType).trim() : undefined,
        entityId:   req.query.entityId ? String(req.query.entityId).trim() : undefined,
        page:       1,
        pageSize:   10000, // Export all matching records up to 10k
      })

      const headers = [
        'ID',
        'Timestamp (UTC)',
        'Actor ID',
        'Actor Role',
        'Action',
        'Entity Type',
        'Entity ID',
        'Outcome',
        'IP Hash',
        'Request ID',
        'Hash',
        'Prev Hash',
      ]

      const rows: string[] = [headers.join(',')]

      for (const r of result.records) {
        rows.push([
          escapeCsv(r.id),
          escapeCsv(r.timestamp),
          escapeCsv(r.actorId),
          escapeCsv(r.actorRole),
          escapeCsv(r.action),
          escapeCsv(r.entityType),
          escapeCsv(r.entityId),
          escapeCsv(r.outcome),
          escapeCsv(r.ipHash),
          escapeCsv(r.requestId),
          escapeCsv(r.hash),
          escapeCsv(r.prevHash),
        ].join(','))
      }

      // Record audit export event
      await recordAuditEvent({
        req,
        action: 'audit_log_exported',
        entityType: 'audit_log',
        entityId: 'export.csv',
        outcome: 'success',
        after: { rowCount: result.records.length },
      })

      const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('Cache-Control', 'no-store')
      res.status(200)

      // Prepend UTF-8 BOM (\uFEFF)
      res.write('\uFEFF')
      res.write(rows.join('\r\n'))
      res.end()
    } catch (err) {
      next(err)
    }
  },
)

// POST /audit/verify — verify hash chain integrity
auditViewerRouter.post(
  '/verify',
  requireAuth(),
  declarePermission('POST', '/audit/verify', 'user.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const verification = verifyAuditHashChain()

      // Record the verification check itself
      await recordAuditEvent({
        req,
        action: 'audit_hash_chain_verified',
        entityType: 'audit_log',
        entityId: 'chain',
        outcome: verification.valid ? 'success' : 'failure',
        after: {
          valid: verification.valid,
          verifiedCount: verification.verifiedCount,
          error: verification.error ?? null,
        },
      })

      res.setHeader('Cache-Control', 'no-store')
      res.json({
        ...verification,
        checkedAt: new Date().toISOString(),
      })
    } catch (err) {
      next(err)
    }
  },
)
