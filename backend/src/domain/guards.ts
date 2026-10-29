// ─── Domain guards ────────────────────────────────────────────────────────────
// Thin wrappers over the pure domain rules that throw HttpError so routes get
// consistent, typed failures (403 forbidden, 409 illegal_transition, etc.).

import { HttpError } from '../lib/httpError.js'
import { hasPermission, canViewAppointment, type Action, type ViewerLike, type ViewableAppointment } from './permissions.js'
import { canTransition, type AppointmentStatus } from './statusMachine.js'
import type { Actor } from '../types.js'

/** Throw 403 unless the actor's role grants the action. */
export function requirePermission(actor: Actor, action: Action): void {
  if (!hasPermission(actor.role, action)) {
    throw new HttpError('forbidden', 'You do not have permission to perform this action.')
  }
}

/** Throw 404 unless the actor may see this appointment (prevent IDOR existence discovery). */
export function requireCanView(actor: ViewerLike, appt: ViewableAppointment): void {
  if (!canViewAppointment(actor, appt)) {
    throw new HttpError('not_found', 'Appointment not found.')
  }
}

/** Check if actor can act on this approval stage. */
export function canActOnApproval(actor: Actor, appt: ViewableAppointment): boolean {
  if (actor.role === 'super_admin') return true
  if (actor.role === 'admin_dispatcher') return true
  if (actor.role === 'coordinator_authority') {
    return appt.assignedRole === undefined || appt.assignedRole === actor.role
  }
  return false
}

/** Throw 409 if the status transition is not legal. */
export function assertTransitionOrThrow(from: AppointmentStatus, to: AppointmentStatus, role?: string): void {
  if (!canTransition(from, to, role)) {
    throw new HttpError('illegal_transition', `This action is not allowed from status "${from}".`)
  }
}
