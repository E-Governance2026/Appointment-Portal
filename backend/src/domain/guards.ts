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

/** Throw 403 unless the actor may see this appointment (row-level visibility). */
export function requireCanView(actor: ViewerLike, appt: ViewableAppointment): void {
  if (!canViewAppointment(actor, appt)) {
    throw new HttpError('forbidden', 'You do not have access to this appointment.')
  }
}

/** Throw 409 if the status transition is not legal. */
export function assertTransitionOrThrow(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!canTransition(from, to)) {
    throw new HttpError('illegal_transition', `This action is not allowed from status "${from}".`)
  }
}
