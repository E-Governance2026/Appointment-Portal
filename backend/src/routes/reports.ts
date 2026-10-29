import { Router, type Request, type Response, type NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { getSupabase } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'
import { requireAuth } from '../middleware/auth.js'
import { requireRecentAuth } from '../middleware/recentAuth.js'
import { declarePermission } from '../middleware/permission.js'
import { hasPermission, canViewAppointment } from '../domain/permissions.js'
import {
  computeReport,
  buildRegisterReport,
  buildPendingReport,
  buildTurnaroundReport,
  buildChangesReport,
  generateCsvStream,
  recordExportAudit,
  type ReportFilters,
} from '../domain/report.js'
import { APPOINTMENT_COLUMNS, toAppointmentDto, type AppointmentRow } from './appointmentMapper.js'
import { AUDIT_COLUMNS, toTimelineDto, type AuditRow } from './auditLog.js'
import { applyScope } from './appointments.js'
import { recordAuditEvent } from '../lib/auditTrail.js'
import type { AppointmentStatus } from '../domain/statusMachine.js'

// ─── Reports router ────────────────────────────────────────────────────────────
// Endpoints:
// - GET / (and /overview): Aggregated summary metrics and breakdowns
// - GET /register: Paginated & sorted appointment register
// - GET /pending: Paginated & sorted pending requests with waiting time
// - GET /turnaround: Paginated & sorted decision turnaround records
// - GET /changes: Paginated & sorted reschedule & cancellation history
// - GET /:type/export.csv: Streamed CSV with UTF-8 BOM, rate limiting, and audit logging
export const reportsRouter = Router()

const exportLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many export attempts. Try again in a minute.' } },
})

async function loadScopedData(req: Request) {
  const actor = req.actor!
  const canAll = hasPermission(actor.role, 'reports.viewAll')
  const canOwn = hasPermission(actor.role, 'reports.view')
  if (!canAll && !canOwn) {
    throw new HttpError('forbidden', 'You do not have permission to view reports.')
  }

  // Parse + validate query filters.
  const from = String(req.query.from ?? '').trim()
  const to   = String(req.query.to ?? '').trim()
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRe.test(from) || !dateRe.test(to)) {
    throw new HttpError('validation', 'Provide from and to dates as YYYY-MM-DD.')
  }

  const fromDate = new Date(`${from}T00:00:00Z`)
  const toDate   = new Date(`${to}T23:59:59Z`)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    throw new HttpError('validation', 'Invalid date value provided.')
  }
  if (fromDate.getTime() > toDate.getTime()) {
    throw new HttpError('validation', 'The "from" date must be earlier than or equal to the "to" date.')
  }
  const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays > 366) {
    throw new HttpError('validation', 'Date range cannot exceed 366 days.')
  }

  const dateBasis = (req.query.dateBasis === 'submitted') ? 'submitted' : 'appointment'

  let status: AppointmentStatus | AppointmentStatus[] | undefined
  if (req.query.status) {
    const raw = String(req.query.status).trim()
    if (raw.includes(',')) {
      status = raw.split(',').map(s => s.trim()) as AppointmentStatus[]
    } else {
      status = raw as AppointmentStatus
    }
  }

  const filters: ReportFilters = {
    from,
    to,
    dateBasis,
    department:  req.query.department ? String(req.query.department).trim() : undefined,
    authorityId: req.query.authorityId ? String(req.query.authorityId).trim() : undefined,
    typeId:      req.query.typeId ? String(req.query.typeId).trim() : undefined,
    status,
    search:      req.query.search ? String(req.query.search).trim() : undefined,
  }

  const supabase = getSupabase()
  let query = supabase.from('appointments').select(APPOINTMENT_COLUMNS)

  // Enforce query-level scope (WHERE clause): viewAll sees everything;
  // view is restricted at the DB query level to what the actor may see.
  if (!canAll) {
    query = applyScope(query, actor)
  }

  const all = await query
  if (all.error) throw new HttpError('internal_error', all.error.message)

  const rows = (all.data ?? []) as unknown as AppointmentRow[]
  const scopedRows = canAll
    ? rows
    : rows.filter(r => canViewAppointment(
        { id: actor.id, name: actor.name, role: actor.role },
        { requester: r.requester, requesterId: r.requester_id ?? undefined, assignedRole: r.assigned_role ?? undefined },
      ))
  // Meeting URLs are excluded from reports and exports per requirement 4
  const appointments = scopedRows.map(r => toAppointmentDto(r, { includeMeetingUrl: false }))

  // Audit events for the scoped appointments (for turnaround & changes).
  const ids = scopedRows.map(r => r.id)
  let events: ReturnType<typeof toTimelineDto>[] = []
  if (ids.length > 0) {
    const ev = await supabase.from('audit_events').select(AUDIT_COLUMNS).in('appointment_id', ids)
    if (ev.error) throw new HttpError('internal_error', ev.error.message)
    events = ((ev.data ?? []) as unknown as AuditRow[]).map(toTimelineDto)
  }

  return { actor, appointments, events, filters }
}

// ── Overview ──
async function handleOverview(req: Request, res: Response, next: NextFunction) {
  try {
    const { appointments, events, filters } = await loadScopedData(req)
    const report = computeReport(appointments, events, filters)
    res.json({ report })
  } catch (err) {
    next(err)
  }
}

reportsRouter.get(
  '/',
  requireAuth(),
  declarePermission('GET', '/reports', 'reports.view'),
  handleOverview,
)

reportsRouter.get(
  '/overview',
  requireAuth(),
  declarePermission('GET', '/reports/overview', 'reports.view'),
  handleOverview,
)

// ── Register Table ──
reportsRouter.get(
  '/register',
  requireAuth(),
  declarePermission('GET', '/reports/register', 'reports.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appointments, filters } = await loadScopedData(req)
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '10'), 10) || 10))
      const sortBy = String(req.query.sortBy ?? 'submittedAt')
      const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc'
      const report = buildRegisterReport(appointments, filters, page, pageSize, sortBy, sortOrder)
      res.json({ report })
    } catch (err) {
      next(err)
    }
  },
)

// ── Pending Table ──
reportsRouter.get(
  '/pending',
  requireAuth(),
  declarePermission('GET', '/reports/pending', 'reports.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appointments, filters } = await loadScopedData(req)
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '10'), 10) || 10))
      const sortBy = String(req.query.sortBy ?? 'waitingTime')
      const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc'
      const report = buildPendingReport(appointments, filters, page, pageSize, sortBy, sortOrder)
      res.json({ report })
    } catch (err) {
      next(err)
    }
  },
)

// ── Turnaround Table ──
reportsRouter.get(
  '/turnaround',
  requireAuth(),
  declarePermission('GET', '/reports/turnaround', 'reports.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appointments, events, filters } = await loadScopedData(req)
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '10'), 10) || 10))
      const sortBy = String(req.query.sortBy ?? 'decidedAt')
      const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc'
      const report = buildTurnaroundReport(appointments, events, filters, page, pageSize, sortBy, sortOrder)
      res.json({ report })
    } catch (err) {
      next(err)
    }
  },
)

// ── Changes Table ──
reportsRouter.get(
  '/changes',
  requireAuth(),
  declarePermission('GET', '/reports/changes', 'reports.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appointments, events, filters } = await loadScopedData(req)
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '10'), 10) || 10))
      const sortBy = String(req.query.sortBy ?? 'changedOn')
      const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc'
      const report = buildChangesReport(appointments, events, filters, page, pageSize, sortBy, sortOrder)
      res.json({ report })
    } catch (err) {
      next(err)
    }
  },
)

// ── CSV Export ──
async function handleExportCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const type = String(req.params.type ?? 'overview').toLowerCase()
    const { actor, appointments, events, filters } = await loadScopedData(req)
    const { filename, csv, rowCount } = generateCsvStream(type, appointments, events, filters)

    // Write audit record: report_exported with report name, filters and row count
    recordExportAudit({
      action: 'report_exported',
      reportName: type,
      actorId: actor.id,
      actorRole: actor.role,
      filters,
      rowCount,
    })

    await recordAuditEvent({
      req,
      action: 'report_exported',
      entityType: 'report',
      entityId: type,
      outcome: 'success',
      after: { reportName: type, rowCount },
    })

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-cache')
    res.status(200)
    res.write(csv)
    res.end()
  } catch (err) {
    next(err)
  }
}

reportsRouter.get(
  '/export.csv',
  exportLimiter,
  requireAuth(),
  declarePermission('GET', '/reports/export.csv', 'reports.view'),
  requireRecentAuth(),
  handleExportCsv,
)

reportsRouter.get(
  '/:type/export.csv',
  exportLimiter,
  requireAuth(),
  declarePermission('GET', '/reports/:type/export.csv', 'reports.view'),
  requireRecentAuth(),
  handleExportCsv,
)
