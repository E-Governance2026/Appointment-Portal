// ─── Permissions (server copy) ───────────────────────────────────────────────
// Verbatim copy of the frontend's src/config/permissions.ts so the server
// enforces the exact same role → action map and row-level visibility. Role is
// re-exported from the shared backend types.

import type { Role } from '../types.js'
export type { Role }

export const ROLES: Role[] = [
  'requester', 'coordinator_authority', 'admin_dispatcher', 'super_admin',
]

export const ROLE_LABELS: Record<Role, string> = {
  requester:             'Requester',
  coordinator_authority: 'Coordinator / Authority',
  admin_dispatcher:      'Admin dispatcher',
  super_admin:           'Super admin',
}

// Every permission-gated capability (23 actions) — mirrors the frontend union.
export type Action =
  | 'appointment.create'
  | 'appointment.viewOwn'
  | 'appointment.requestCancel'
  | 'appointment.respondReschedule'
  | 'appointment.provideInfo'
  | 'appointment.viewAssigned'
  | 'appointment.approve'
  | 'appointment.reject'
  | 'appointment.requestInfo'
  | 'appointment.proposeReschedule'
  | 'appointment.forward'
  | 'appointment.internalRemark'
  | 'appointment.confirm'
  | 'appointment.cancel'
  | 'appointment.markNotReported'
  | 'calendar.view'
  | 'calendar.manageOwn'
  | 'calendar.manageAny'
  | 'visitor.checkIn'
  | 'visitor.checkOut'
  | 'master.manage'
  | 'user.manage'
  | 'reports.view'
  | 'reports.viewAll'

const PERMISSIONS: Record<Role, Action[]> = {
  requester: [
    'appointment.create',
    'appointment.viewOwn',
    'appointment.requestCancel',
    'appointment.respondReschedule',
    'appointment.provideInfo',
    'calendar.view',
  ],
  coordinator_authority: [
    'appointment.create',
    'appointment.viewOwn',
    'appointment.viewAssigned',
    'appointment.approve',
    'appointment.reject',
    'appointment.requestInfo',
    'appointment.proposeReschedule',
    'appointment.forward',
    'appointment.confirm',
    'appointment.cancel',
    'appointment.internalRemark',
    'calendar.view',
    'calendar.manageOwn',
    'reports.view',
  ],
  admin_dispatcher: [
    'appointment.viewAssigned',
    'appointment.approve',
    'appointment.reject',
    'appointment.requestInfo',
    'appointment.proposeReschedule',
    'appointment.forward',
    'appointment.confirm',
    'appointment.cancel',
    'appointment.markNotReported',
    'appointment.internalRemark',
    'calendar.view',
    'calendar.manageAny',
    'visitor.checkIn',
    'visitor.checkOut',
    'reports.view',
  ],
  super_admin: [
    'appointment.viewAssigned',
    'appointment.approve',
    'appointment.reject',
    'appointment.requestInfo',
    'appointment.proposeReschedule',
    'appointment.forward',
    'appointment.confirm',
    'appointment.cancel',
    'appointment.markNotReported',
    'appointment.internalRemark',
    'calendar.view',
    'calendar.manageAny',
    'visitor.checkIn',
    'visitor.checkOut',
    'master.manage',
    'user.manage',
    'reports.view',
    'reports.viewAll',
  ],
}

export function hasPermission(role: Role, action: Action): boolean {
  return PERMISSIONS[role]?.includes(action) ?? false
}

export function actionsFor(role: Role): Action[] {
  return PERMISSIONS[role] ?? []
}

// ─── Row-level appointment visibility ─────────────────────────────────────────
// The single rule for "can this user see this appointment", matching the
// frontend's canViewAppointment. The RLS policies in migration 0009 express the
// same logic in SQL.
export interface ViewerLike {
  id?:   string
  name?: string
  role:  Role
}
export interface ViewableAppointment {
  requester?:    string
  requesterId?:  string
  assignedRole?: Role
}

export function canViewAppointment(user: ViewerLike | null | undefined, appt: ViewableAppointment): boolean {
  if (!user) return false
  if (user.role === 'super_admin' || user.role === 'admin_dispatcher') {
    return true
  }
  if (user.role === 'coordinator_authority') {
    return appt.assignedRole === undefined || appt.assignedRole === user.role
  }
  // requester: own records only
  if (appt.requesterId && user.id) return appt.requesterId === user.id
  return !!user.name && appt.requester === user.name
}
