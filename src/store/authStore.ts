import { create } from 'zustand'
import {
  hasPermission as checkPermission,
  canAccessRoute as checkRoute,
  type Role,
  type Action,
} from '../config/permissions'
import { api, setToken } from '../services/apiClient'

// Whether real auth is active. Under 'mock' the demo switcher drives login; under
// 'supabase' the Login form calls the backend.
const USE_BACKEND = import.meta.env.VITE_DATA_SOURCE === 'supabase'

// The actor shape returned by POST /auth/login and GET /auth/me.
interface ApiActor { id: string; name: string; role: Role; email?: string }

function actorToUser(a: ApiActor): AuthUser {
  return {
    id:         a.id,
    name:       a.name,
    employeeId: '',
    department: '',
    role:       a.role,
  }
}

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
  /** Real backend login (email + password). Stores token + actor. */
  login:    (email: string, password: string) => Promise<void>
  logout:   () => void
  // Selectors
  can:          (action: Action) => boolean
  canSeeRoute:  (route: string) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Under mock, default to admin_dispatcher so the dashboard works before login.
  // Under the real backend, start signed-out so the Login screen is required.
  user: USE_BACKEND ? loadPersisted() : (loadPersisted() ?? DEMO_USERS.admin_dispatcher),

  loginAs: (role) => {
    const user = DEMO_USERS[role]
    persist(user)
    set({ user })
  },

  login: async (email, password) => {
    const res = await api.post<{ token: string; actor: ApiActor }>('/auth/login', { email, password })
    setToken(res.token)
    const user = actorToUser(res.actor)
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

// ─── Convenience hooks ────────────────────────────────────────────────────────
export const useCurrentUser = () => useAuthStore(s => s.user)
export const useCurrentRole = (): Role | null => useAuthStore(s => s.user?.role ?? null)
