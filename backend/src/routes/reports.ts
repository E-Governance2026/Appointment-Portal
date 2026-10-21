import { Router, type Request, type Response, type NextFunction } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'
import { requireAuth } from '../middleware/auth.js'
import { hasPermission, canViewAppointment } from '../domain/permissions.js'
import { computeReport, type ReportFilters } from '../domain/report.js'
import { APPOINTMENT_COLUMNS, toAppointmentDto, type AppointmentRow } from './appointmentMapper.js'
import { AUDIT_COLUMNS, toTimelineDto, type AuditRow } from './auditLog.js'
import type { AppointmentStatus } from '../domain/statusMachine.js'

// ─── Reports route ────────────────────────────────────────────────────────────
// GET /reports?from&to&department&authorityId&status
// reports.viewAll (super_admin) → every appointment; reports.view
// (coordinator_authority / admin_dispatcher) → records in the actor's scope.
// Requesters have no reporting permission. Mirrors fetchReport in the mock
// service and uses the ported computeReport as the single source of truth.
export const reportsRouter = Router()

const STATUSES: AppointmentStatus[] = [
  'draft', 'submitted', 'additional-info', 'approved', 'confirmed',
  'rescheduled', 'completed', 'cancelled', 'rejected', 'not-reported',
]

reportsRouter.get('/', requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
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
    const statusRaw = req.query.status ? String(req.query.status) : undefined
    if (statusRaw && !STATUSES.includes(statusRaw as AppointmentStatus)) {
      throw new HttpError('validation', 'Unknown status filter.')
    }
    const filters: ReportFilters = {
      from, to,
      department:  req.query.department ? String(req.query.department) : undefined,
      authorityId: req.query.authorityId ? String(req.query.authorityId) : undefined,
      status:      statusRaw as AppointmentStatus | undefined,
    }

    const supabase = getSupabase()
    const all = await supabase.from('appointments').select(APPOINTMENT_COLUMNS)
    if (all.error) throw new HttpError('internal_error', all.error.message)

    // Scope the rows: viewAll sees everything; view sees only what the actor
    // may see (canViewAppointment), mirroring the mock's visibleTo.
    const rows = (all.data ?? []) as unknown as AppointmentRow[]
    const scopedRows = canAll
      ? rows
      : rows.filter(r => canViewAppointment(
          { id: actor.id, name: actor.name, role: actor.role },
          { requester: r.requester, requesterId: r.requester_id ?? undefined, assignedRole: r.assigned_role ?? undefined },
        ))
    const appointments = scopedRows.map(toAppointmentDto)

    // Audit events for the scoped appointments (for turnaround).
    const ids = scopedRows.map(r => r.id)
    let events: ReturnType<typeof toTimelineDto>[] = []
    if (ids.length > 0) {
      const ev = await supabase.from('audit_events').select(AUDIT_COLUMNS).in('appointment_id', ids)
      if (ev.error) throw new HttpError('internal_error', ev.error.message)
      events = ((ev.data ?? []) as unknown as AuditRow[]).map(toTimelineDto)
    }

    const report = computeReport(appointments, events, filters)
    res.json({ report })
  } catch (err) {
    next(err)
  }
})
