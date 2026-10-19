// ─── Shared backend types ─────────────────────────────────────────────────────

// The 6 roles — mirrors the frontend's Role union (src/config/permissions.ts).
export type Role =
  | 'requester'
  | 'coordinator'
  | 'authority'
  | 'admin_dispatcher'
  | 'super_admin'
  | 'reception'

// The acting user the API trusts, resolved from a verified token. This is the
// same shape the frontend service layer passes as `Actor`.
export interface Actor {
  id:    string      // app users.id (e.g. 'u-sup')
  name:  string
  role:  Role
  email: string
}

// Augment Express Request so routes can read req.actor after requireAuth.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor
    }
  }
}
