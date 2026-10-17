// ─── Status Machine ───────────────────────────────────────────────────────────
// Single source of truth for appointment status transitions (PRD §8).
// Every status change in the app must go through canTransition().
// The 10 statuses and their definitions come directly from the PRD.

import type { AppointmentStatus } from '../data/mockAppointments'

// ─── Status definitions (PRD §8) ──────────────────────────────────────────────
export const STATUS_DEFINITIONS: Record<AppointmentStatus, string> = {
  'draft':            'Saved but not submitted.',
  'submitted':        'Request recorded successfully.',
  'additional-info':  'Additional information requested.',
  'approved':         'Required approval has been granted.',
  'confirmed':        'Appointment schedule has been finalised.',
  'rejected':         'Request declined.',
  'rescheduled':      'New schedule recorded.',
  'cancelled':        'Appointment cancelled.',
  'completed':        'Appointment completed.',
  // PRD "Not reported" = the confirmed appointment time passed with no
  // check-in, expired under the configured policy. Terminal state.
  'not-reported':     'Appointment time passed without the requester reporting.',
}

// ─── Legal transition table ───────────────────────────────────────────────────
// Key = from-status, value = list of statuses it may move to.
// PRD rule: "Approved does not mean Confirmed if further confirmation steps remain."
// so approved → confirmed is explicit and separate.
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  // Draft can be submitted or cancelled (discarded)
  draft: ['submitted', 'cancelled'],

  // Submitted: enters review. Can be approved, rejected, sent back for info,
  // rescheduled (authority proposes), or cancelled.
  submitted: ['approved', 'rejected', 'additional-info', 'rescheduled', 'cancelled'],

  // Additional info required: requester responds -> back to submitted (re-review),
  // or the request may be rejected or cancelled.
  'additional-info': ['submitted', 'rejected', 'cancelled'],

  // Approved: NOT yet confirmed. Needs the confirmation step.
  // May still be rescheduled or cancelled before confirmation.
  approved: ['confirmed', 'rescheduled', 'cancelled'],

  // Confirmed: finalised. Can be completed, rescheduled, cancelled, or expire
  // to not-reported when the time passes with no check-in.
  confirmed: ['completed', 'rescheduled', 'cancelled', 'not-reported'],

  // Rescheduled: a new schedule was recorded; it re-enters submitted for
  // re-approval, or can be confirmed directly if policy allows, or cancelled.
  rescheduled: ['submitted', 'approved', 'confirmed', 'cancelled'],

  // Terminal states — no outgoing transitions.
  rejected:     [],
  cancelled:    [],
  completed:    [],
  'not-reported': [],
}

// ─── canTransition ─────────────────────────────────────────────────────────────
/**
 * Returns true if moving from `from` to `to` is a legal status transition.
 * Same-status "transition" is never legal (no-op changes are rejected).
 */
export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  if (from === to) return false
  return TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Returns the list of statuses that `from` may legally move to.
 */
export function allowedNextStatuses(from: AppointmentStatus): AppointmentStatus[] {
  return TRANSITIONS[from] ?? []
}

/**
 * Asserts a transition is legal; throws a descriptive error if not.
 * Use this in the mock API where an illegal transition is a programming error.
 */
export function assertTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Illegal status transition: "${from}" cannot move to "${to}".`,
    )
  }
}

/** Terminal statuses that accept no further transitions. */
export const TERMINAL_STATUSES: AppointmentStatus[] = ['rejected', 'cancelled', 'completed', 'not-reported']

export function isTerminal(status: AppointmentStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}
