import { create } from 'zustand'
import {
  hasPermission as checkPermission,
  canAccessRoute as checkRoute,
  type Role,
  type Action,
} from '../config/permissions'
import { api, setCsrfToken, setToken } from '../services/apiClient'

export interface AuthUser {
  id:         string
  name:       string
  email?:     string
  employeeId: string
  department: string
  role:       Role
}

export const DEMO_USERS: Record<Role, AuthUser> = {
  requester:             { id: 'u-req', name: 'Rohan Mehta',    email: 'rohan.mehta@university.edu', employeeId: 'PU-2024-120', department: 'Academic Affairs', role: 'requester'             },
  coordinator_authority: { id: 'u-ca',  name: 'Dr. Amit Patel', email: 'amit.patel@university.edu', employeeId: 'PU-2015-009', department: 'Human Resources',  role: 'coordinator_authority' },
  admin_dispatcher:      { id: 'u-adm', name: 'Admin User',     email: 'admin.user@university.edu', employeeId: 'PU-2024-001', department: 'MIS Department',   role: 'admin_dispatcher'      },
  super_admin:           { id: 'u-sup', name: 'Super Admin',    email: 'super.admin@university.edu', employeeId: 'PU-2010-000', department: 'MIS Department',   role: 'super_admin'           },
}

interface AuthState {
  user:         AuthUser | null
  isLoading:    boolean
  loginAs:      (role: Role) => void
  login:        (email: string, password: string) => Promise<{ mfaRequired?: boolean; tempSessionId?: string; mustChangePassword?: boolean } | void>
  verifyMfa:    (code: string, tempSessionId?: string) => Promise<{ mustChangePassword?: boolean } | void>
  verifyRecoveryCode: (recoveryCode: string, tempSessionId?: string) => Promise<{ mustChangePassword?: boolean } | void>
  logout:       () => void
  refreshUser:  () => Promise<AuthUser | null>
  can:          (action: Action) => boolean
  canSeeRoute:  (route: string) => boolean
}

// Memory-only user state — never written to localStorage or sessionStorage
export const useAuthStore = create<AuthState>((set, get) => ({
  user: !import.meta.env.VITE_API_BASE_URL ? DEMO_USERS.admin_dispatcher : null,
  isLoading: false,

  loginAs: (role) => {
    const user = DEMO_USERS[role]
    set({ user })
  },

  login: async (email, password) => {
    const res = await api.post<{
      token?: string
      csrfToken?: string
      mfaRequired?: boolean
      tempSessionId?: string
      mustChangePassword?: boolean
      actor?: { id: string; name: string; role: Role; email?: string }
    }>('/auth/login', { identifier: email, email, password })

    if (res.csrfToken) setCsrfToken(res.csrfToken)
    if (res.token) setToken(res.token)

    if (res.mfaRequired) {
      return { mfaRequired: true, tempSessionId: res.tempSessionId }
    }

    if (res.actor) {
      const user: AuthUser = {
        id: res.actor.id,
        name: res.actor.name,
        role: res.actor.role,
        email: res.actor.email,
        employeeId: '',
        department: '',
      }
      set({ user })
    }

    return { mustChangePassword: res.mustChangePassword }
  },

  verifyMfa: async (code: string, tempSessionId?: string) => {
    const res = await api.post<{
      token?: string
      csrfToken?: string
      actor?: { id: string; name: string; role: Role; email?: string }
      mustChangePassword?: boolean
    }>('/auth/mfa/verify', { code, tempSessionId })

    if (res.csrfToken) setCsrfToken(res.csrfToken)
    if (res.token) setToken(res.token)

    if (res.actor) {
      const user: AuthUser = {
        id: res.actor.id,
        name: res.actor.name,
        role: res.actor.role,
        email: res.actor.email,
        employeeId: '',
        department: '',
      }
      set({ user })
    }

    return { mustChangePassword: res.mustChangePassword }
  },

  verifyRecoveryCode: async (recoveryCode: string, tempSessionId?: string) => {
    const res = await api.post<{
      token?: string
      csrfToken?: string
      actor?: { id: string; name: string; role: Role; email?: string }
      mustChangePassword?: boolean
    }>('/auth/mfa/recovery-code', { recoveryCode, tempSessionId })

    if (res.csrfToken) setCsrfToken(res.csrfToken)
    if (res.token) setToken(res.token)

    if (res.actor) {
      const user: AuthUser = {
        id: res.actor.id,
        name: res.actor.name,
        role: res.actor.role,
        email: res.actor.email,
        employeeId: '',
        department: '',
      }
      set({ user })
    }

    return { mustChangePassword: res.mustChangePassword }
  },

  logout: () => {
    // Notify server to destroy session and clear cookies
    if (import.meta.env.VITE_API_BASE_URL) {
      api.post('/auth/logout', undefined, { passive: false }).catch(() => { /* ignore */ })
    }
    setToken(null)
    setCsrfToken(null)
    set({ user: null })
  },

  refreshUser: async () => {
    if (!import.meta.env.VITE_API_BASE_URL) return get().user
    set({ isLoading: true })
    try {
      const res = await api.get<{
        actor: { id: string; name: string; role: Role; email?: string }
        csrfToken?: string
      }>('/auth/me')
      if (res.csrfToken) setCsrfToken(res.csrfToken)
      const user: AuthUser = {
        id: res.actor.id,
        name: res.actor.name,
        role: res.actor.role,
        email: res.actor.email,
        employeeId: '',
        department: '',
      }
      set({ user, isLoading: false })
      return user
    } catch {
      set({ user: null, isLoading: false })
      return null
    }
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

