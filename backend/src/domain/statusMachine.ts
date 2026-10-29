// ─── Status machine (server copy) ────────────────────────────────────────────
// Verbatim copy of the frontend's src/config/statusMachine.ts so the server
// enforces the exact same transition rules. The two must never diverge.

export type AppointmentStatus =
  | 'draft'
  | 'submitted'
  | 'additional-info'
  | 'approved'
  | 'confirmed'
  | 'rescheduled'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'not-reported'

export const STATUS_DEFINITIONS: Record<AppointmentStatus, string> = {
  'draft':           'Saved but not submitted.',
  'submitted':       'Request recorded successfully.',
  'additional-info': 'Additional information requested.',
  'approved':        'Required approval has been granted.',
  'confirmed':       'Appointment schedule has been finalised.',
  'rejected':        'Request declined.',
  'rescheduled':     'New schedule recorded.',
  'cancelled':       'Appointment cancelled.',
  'completed':       'Appointment completed.',
  'not-reported':    'Appointment time passed without the requester reporting.',
}

// Legal transition table — key = from-status, value = statuses it may move to.
// Approved → confirmed is explicit and separate (approval ≠ confirmation).
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  draft:            ['submitted', 'cancelled'],
  submitted:        ['approved', 'rejected', 'additional-info', 'rescheduled', 'cancelled'],
  'additional-info':['submitted', 'rejected', 'cancelled'],
  approved:         ['confirmed', 'rescheduled', 'cancelled'],
  confirmed:        ['completed', 'rescheduled', 'cancelled', 'not-reported'],
  rescheduled:      ['submitted', 'approved', 'confirmed', 'cancelled'],
  rejected:         [],
  cancelled:        [],
  completed:        [],
  'not-reported':   [],
}

/** True if moving from -> to is legal. When role is provided, checks if the role is permitted to trigger the transition. */
export function canTransition(from: AppointmentStatus, to: AppointmentStatus, role?: string): boolean {
  if (from === to) return false
  const transitionAllowed = TRANSITIONS[from]?.includes(to) ?? false
  if (!transitionAllowed) return false
  if (!role) return true

  // Role-based restrictions
  if (role === 'requester') {
    // Requesters can only submit, provide info, respond to reschedule, or cancel
    const allowedForRequester = (
      (from === 'draft' && to === 'submitted') ||
      (from === 'additional-info' && to === 'submitted') ||
      (from === 'rescheduled' && (to === 'confirmed' || to === 'cancelled')) ||
      (['submitted', 'approved', 'confirmed'].includes(from) && to === 'cancelled')
    )
    return allowedForRequester
  }

  if (role === 'coordinator_authority') {
    // Coordinators cannot complete (check-out) or mark not-reported (reception desk actions)
    if (to === 'completed' || to === 'not-reported') return false
    return true
  }

  // admin_dispatcher and super_admin can perform all valid transitions
  return true
}

/** The statuses `from` may legally move to. */
export function allowedNextStatuses(from: AppointmentStatus): AppointmentStatus[] {
  return TRANSITIONS[from] ?? []
}

/** Throws a descriptive Error if the transition is illegal. */
export function assertTransition(from: AppointmentStatus, to: AppointmentStatus, role?: string): void {
  if (!canTransition(from, to, role)) {
    throw new Error(`Illegal status transition: "${from}" cannot move to "${to}"${role ? ` for role "${role}"` : ''}.`)
  }
}

export const TERMINAL_STATUSES: AppointmentStatus[] = ['rejected', 'cancelled', 'completed', 'not-reported']

export function isTerminal(status: AppointmentStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}
