import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import type { Role } from '../../config/permissions'

interface RequireRoleProps {
  /** Roles permitted to view the wrapped route. */
  allow: Role[]
  children: React.ReactNode
}

// ─── RequireRole ──────────────────────────────────────────────────────────────
// Route guard. If the current user's role is not in `allow`, redirect to the
// access-denied page. If there is no user at all, send to login.
//
// PRD §10: server-side authorization is the real gate; this is the UI layer.

export default function RequireRole({ allow, children }: RequireRoleProps) {
  const user = useAuthStore(s => s.user)

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!allow.includes(user.role)) {
    return <Navigate to="/access-denied" replace />
  }

  return <>{children}</>
}
