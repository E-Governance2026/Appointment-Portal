import { create } from 'zustand'
import {
  hasPermission as checkPermission,
  canAccessRoute as checkRoute,
  type Role,
  type Action,
} from '../config/permissions'
import { api, getToken, setToken } from '../services/apiClient'

export interface AuthUser {
  id:         string
  name:       string
  employeeId: string
  department: string
  role:       Role
}

export const DEMO_USERS: Record<Role, AuthUser> = {
  requester:             { id: 'u-req', name: 'Rohan Mehta',    employeeId: 'PU-2024-120', department: 'Academic Affairs', role: 'requester'             },
  coordinator_authority: { id: 'u-ca',  name: 'Dr. Amit Patel', employeeId: 'PU-2015-009', department: 'Human Resources',  role: 'coordinator_authority' },
  admin_dispatcher:      { id: 'u-adm', name: 'Admin User',     employeeId: 'PU-2024-001', department: 'MIS Department',   role: 'admin_dispatcher'      },
  super_admin:           { id: 'u-sup', name: 'Super Admin',    employeeId: 'PU-2010-000', department: 'MIS Department',   role: 'super_admin'           },
}

const STORAGE_KEY = 'at_auth_user'

function loadPersisted(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch { return null }
}

function persist(user: AuthUser | null) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}

// Always read the token directly — never cache it in module scope.
// If a token exists → restore the persisted user (real backend session).
// If no token → start as null (must sign in via the Login form).
// This is called ONCE at store creation, not on every render.
function initialUser(): AuthUser | null {
  const token = getToken()   // reads localStorage directly
  if (token) {
    // Token exists — restore the saved user (real backend session).
    return loadPersisted()
  }
  // No token — check if we're in pure mock mode (no API URL configured).
  const hasApi = !!(import.meta.env.VITE_API_BASE_URL)
  if (!hasApi) {
    // Pure offline mock — default to admin_dispatcher so the app works.
    return loadPersisted() ?? DEMO_USERS.admin_dispatcher
  }
  // Backend mode but no token — must sign in.
  return null
}

interface AuthState {
  user:     AuthUser | null
  loginAs:  (role: Role) => void
  login:    (email: string, password: string) => Promise<void>
  logout:   () => void
  can:          (action: Action) => boolean
  canSeeRoute:  (route: string) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: initialUser(),

  loginAs: (role) => {
    const user = DEMO_USERS[role]
    persist(user)
    set({ user })
  },

  login: async (email, password) => {
    const res = await api.post<{ token: string; actor: { id: string; name: string; role: Role } }>(
      '/auth/login', { email, password }
    )
    setToken(res.token)
    const user: AuthUser = {
      id: res.actor.id, name: res.actor.name, role: res.actor.role,
      employeeId: '', department: '',
    }
    persist(user)
    set({ user })
  },

  logout: () => {
    setToken(null)
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

export const useCurrentUser = () => useAuthStore(s => s.user)
export const useCurrentRole = (): Role | null => useAuthStore(s => s.user?.role ?? null)
