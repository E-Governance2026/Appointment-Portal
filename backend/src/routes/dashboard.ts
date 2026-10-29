import { Router, type Request, type Response, type NextFunction } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'
import { requireAuth } from '../middleware/auth.js'
import { declarePermission } from '../middleware/permission.js'
import { canViewAppointment } from '../domain/permissions.js'
import { applyScope } from './appointments.js'
import type { AppointmentRow } from './appointmentMapper.js'

// ─── Dashboard route ──────────────────────────────────────────────────────────
// GET /dashboard/stats — scoped counts matching the same visibility as /appointments
export const dashboardRouter = Router()

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

dashboardRouter.get(
  '/stats',
  requireAuth(),
  declarePermission('GET', '/dashboard/stats', ['appointment.viewOwn', 'appointment.viewAssigned']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!
      const supabase = getSupabase()

      let query = supabase.from('appointments').select('id, requester, requester_id, assigned_role, status, date')
      query = applyScope(query, actor)
      const { data, error } = await query
      if (error) throw new HttpError('internal_error', error.message)

      const rows = (data ?? []) as unknown as AppointmentRow[]
      const visible = rows.filter(r =>
        canViewAppointment(
          { id: actor.id, name: actor.name, role: actor.role },
          { requester: r.requester, requesterId: r.requester_id ?? undefined, assignedRole: r.assigned_role ?? undefined },
        ),
      )
      const today = todayISO()
      res.json({
        stats: {
          total:            visible.length,
          awaitingApproval: visible.filter(r => r.status === 'submitted').length,
          confirmed:        visible.filter(r => r.status === 'confirmed' || r.status === 'approved').length,
          todayCount:       visible.filter(r => r.date === today).length,
        },
      })
    } catch (err) {
      next(err)
    }
  },
)
