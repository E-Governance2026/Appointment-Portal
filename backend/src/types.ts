// ─── Shared backend types ─────────────────────────────────────────────────────

// The 4 roles (PRD §3) — mirrors the frontend's Role union
// (src/config/permissions.ts). coordinator_authority is the single
// "Department Coordinator / Authority" role; the admin dispatcher runs the
// reception desk, so there is no separate reception role.
export type Role =
  | 'requester'
  | 'coordinator_authority'
  | 'admin_dispatcher'
  | 'super_admin'

// The acting user the API trusts, resolved from a verified token. This is the
// same shape the frontend service layer passes as `Actor`.
export interface Actor {
  id:          string      // app users.id (e.g. 'u-sup')
  name:        string
  role:        Role
  email:       string
  department?: string
}

// Augment Express Request so routes can read req.actor after requireAuth.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor
      sessionId?: string
      session?: import('./lib/sessionStore.js').SessionEntry
      requestId?: string
    }
  }
}

