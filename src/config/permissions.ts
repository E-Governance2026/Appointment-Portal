// ─── Permissions ──────────────────────────────────────────────────────────────
// Single source of truth for role → allowed actions (PRD §3).
// The UI hides controls based on this map, AND the mock API checks it again
// (PRD §10: "Do not rely solely on hiding frontend controls to enforce permissions").

// ─── Roles (PRD §3) ────────────────────────────────────────────────────────────
// The PRD defines four roles. "Department Coordinator / Authority" is a single
// role (coordinator_authority); the admin dispatcher also handles the reception
// desk (visitor check-in/out), so there is no separate reception role.
export type Role =
  | 'requester'
  | 'coordinator_authority'
  | 'admin_dispatcher'
  | 'super_admin'

export const ROLES: Role[] = [
  'requester',
  'coordinator_authority',
  'admin_dispatcher',
  'super_admin',
]

export const ROLE_LABELS: Record<Role, string> = {
  requester:             'Requester',
  coordinator_authority: 'Coordinator / Authority',
  admin_dispatcher:      'Admin dispatcher',
  super_admin:           'Super admin',
}

// ─── Actions ──────────────────────────────────────────────────────────────────
// Every permission-gated capability in the system has a stable action key.
export type Action =
  // Requester capabilities
  | 'appointment.create'
  | 'appointment.viewOwn'
  | 'appointment.requestCancel'
  | 'appointment.respondReschedule'
  | 'appointment.provideInfo'
  // Review / approval capabilities
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
  // Calendar / availability
  | 'calendar.view'
  | 'calendar.manageOwn'
  | 'calendar.manageAny'
  // Reception desk (handled by admin dispatcher)
  | 'visitor.checkIn'
  | 'visitor.checkOut'
  // Admin
  | 'master.manage'
  | 'user.manage'
  | 'reports.view'
  | 'reports.viewAll'

// ─── Role → allowed actions map ────────────────────────────────────────────────
const PERMISSIONS: Record<Role, Action[]> = {
  // Requester: own records only (PRD §3 "Access only own records")
  requester: [
    'appointment.create',
    'appointment.viewOwn',
    'appointment.requestCancel',
    'appointment.respondReschedule',
    'appointment.provideInfo',
    'calendar.view',
  ],

  // Coordinator / Authority: review assigned requests, request info, route, and
  // approve/reject/confirm when assigned. The union of the old coordinator and
  // authority capabilities (coordinator contributed 'forward').
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

  // Admin dispatcher: acts on assigned requests in absence of someone, and runs
  // the reception desk (visitor check-in/out + mark no-shows).
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

  // Super admin: full administrative control
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

// ─── hasPermission ─────────────────────────────────────────────────────────────
export function hasPermission(role: Role, action: Action): boolean {
  return PERMISSIONS[role]?.includes(action) ?? false
}

/** All actions granted to a role (useful for debugging / tests). */
export function actionsFor(role: Role): Action[] {
  return PERMISSIONS[role] ?? []
}

// ─── Nav visibility per role (PRD §9) ─────────────────────────────────────────
// Maps a nav route to the roles allowed to see it in the sidebar.
export const NAV_ACCESS: Record<string, Role[]> = {
  '/dashboard':          ROLES,                                   // everyone
  '/book':               ['requester','coordinator_authority','admin_dispatcher','super_admin'],
  '/book-appointment':   ['requester','coordinator_authority','admin_dispatcher','super_admin'],
  '/my-appointments':    ROLES,
  '/calendar':           ROLES,
  '/approvals':          ['coordinator_authority','admin_dispatcher','super_admin'],
  '/visitor-management': ['admin_dispatcher','super_admin'],
  '/reports':            ['coordinator_authority','admin_dispatcher','super_admin'],
  '/master-management':  ['super_admin'],
  '/user-management':    ['super_admin'],
  '/settings':           ROLES,
}

export function canAccessRoute(role: Role, route: string): boolean {
  const allowed = NAV_ACCESS[route]
  if (!allowed) return true   // unlisted routes are open to authenticated users
  return allowed.includes(role)
}

// ─── Row-level appointment visibility (PRD §3, §10) ───────────────────────────
// The single source of truth for "can this user see this appointment". The mock
// data layer and the service both apply it; the backend mirrors it with RLS.
//
// Rules:
//  - super_admin / admin_dispatcher: every appointment (admin also runs the
//    reception desk, so it needs the full day).
//  - coordinator_authority: appointments assigned to their role.
//  - requester: only their own (matched by name in the mock; by id on the server).
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
    // Assigned rows; when an appointment carries no assignment (older mock
    // records) fall back to visible so staff dashboards are not empty.
    return appt.assignedRole === undefined || appt.assignedRole === user.role
  }
  // requester: own records only.
  if (appt.requesterId && user.id) return appt.requesterId === user.id
  return !!user.name && appt.requester === user.name
}
