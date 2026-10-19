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

/** True if moving from → to is legal. Same-status is never legal. */
export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  if (from === to) return false
  return TRANSITIONS[from]?.includes(to) ?? false
}

/** The statuses `from` may legally move to. */
export function allowedNextStatuses(from: AppointmentStatus): AppointmentStatus[] {
  return TRANSITIONS[from] ?? []
}

/** Throws a descriptive Error if the transition is illegal. */
export function assertTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal status transition: "${from}" cannot move to "${to}".`)
  }
}

export const TERMINAL_STATUSES: AppointmentStatus[] = ['rejected', 'cancelled', 'completed', 'not-reported']

export function isTerminal(status: AppointmentStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}
