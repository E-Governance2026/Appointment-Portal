// Re-export canonical type — all pages import AppointmentStatus from here.
export type { AppointmentStatus } from '../../data/mockAppointments'

// StatusBadge is now an alias for StatusChip so there is one chip implementation.
// All existing imports of StatusBadge continue to work unchanged.
export { default } from './StatusChip'
