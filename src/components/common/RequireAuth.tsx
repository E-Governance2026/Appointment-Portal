import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

// ─── RequireAuth ──────────────────────────────────────────────────────────────
// Wraps authenticated routes. If there is no signed-in user, redirects to
// /login and passes the current path as returnTo so the user lands back after
// signing in. Renders <Outlet /> (not children) so nested routes work correctly
// inside React Router's route tree.
export default function RequireAuth() {
  const user     = useAuthStore(s => s.user)
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" state={{ returnTo: location.pathname }} replace />
  }

  return <Outlet />
}
