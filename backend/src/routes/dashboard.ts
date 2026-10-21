import { Router, type Request, type Response, type NextFunction } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'
import { requireAuth } from '../middleware/auth.js'
import { canViewAppointment } from '../domain/permissions.js'
import type { AppointmentRow } from './appointmentMapper.js'
import type { Actor } from '../types.js'

// ─── Dashboard route ──────────────────────────────────────────────────────────
// GET /dashboard/stats — the scoped counts the dashboard shows. Computed over
// the appointments the signed-in actor may see (same scoping as /appointments),
// mirroring the mock fetchDashboardStats.
export const dashboardRouter = Router()

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function applyScope<Q extends { or(f: string): Q; eq(c: string, v: string): Q }>(query: Q, actor: Actor): Q {
  switch (actor.role) {
    case 'super_admin':
    case 'admin_dispatcher':
      return query
    case 'coordinator_authority':
      return query.or(`assigned_role.eq.${actor.role},assigned_role.is.null`)
    case 'requester':
    default:
      return query.eq('requester_id', actor.id)
  }
}

dashboardRouter.get('/stats', requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
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
})
