import { create } from 'zustand'
import {
  hasPermission as checkPermission,
  canAccessRoute as checkRoute,
  type Role,
  type Action,
} from '../config/permissions'

// ─── Auth user ────────────────────────────────────────────────────────────────
export interface AuthUser {
  id:         string
  name:       string
  employeeId: string
  department: string
  role:       Role
}

// Default demo accounts, one per role. Selecting a role in Login logs in as these.
export const DEMO_USERS: Record<Role, AuthUser> = {
  requester:             { id: 'u-req', name: 'Rohan Mehta',   employeeId: 'PU-2024-120', department: 'Academic Affairs', role: 'requester'             },
  coordinator_authority: { id: 'u-ca',  name: 'Dr. Amit Patel',employeeId: 'PU-2015-009', department: 'Human Resources',  role: 'coordinator_authority' },
  admin_dispatcher:      { id: 'u-adm', name: 'Admin User',    employeeId: 'PU-2024-001', department: 'MIS Department',   role: 'admin_dispatcher'      },
  super_admin:           { id: 'u-sup', name: 'Super Admin',   employeeId: 'PU-2010-000', department: 'MIS Department',   role: 'super_admin'           },
}

const STORAGE_KEY = 'at_auth_user'

function loadPersisted(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

function persist(user: AuthUser | null) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    else      localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore storage errors (private mode, etc.) */
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────
interface AuthState {
  user: AuthUser | null
  // Actions
  loginAs:  (role: Role) => void
  logout:   () => void
  // Selectors
  can:          (action: Action) => boolean
  canSeeRoute:  (route: string) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Default to admin_dispatcher so the existing dashboard keeps working until
  // the user logs in with a specific role.
  user: loadPersisted() ?? DEMO_USERS.admin_dispatcher,

  loginAs: (role) => {
    const user = DEMO_USERS[role]
    persist(user)
    set({ user })
  },

  logout: () => {
    persist(null)
    set({ user: null })
  },

  can: (action) => {
    const u = get().user
    return u ? checkPermission(u.role, action) : false
  },

  canSeeRoute: (route) => {
    const u = get().user
    return u ? checkRoute(u.role, route) : false
  },
}))

// ─── Convenience hooks ────────────────────────────────────────────────────────
export const useCurrentUser = () => useAuthStore(s => s.user)
export const useCurrentRole = (): Role | null => useAuthStore(s => s.user?.role ?? null)
