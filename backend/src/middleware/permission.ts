// ─── Permission Middleware & Central Route Registry ───────────────────────────
// Enforces "DENY BY DEFAULT":
// 1. Every route must declare an explicit permission (e.g. requirePermission(action))
//    or belong to an explicit allowlist.
// 2. An automated validator (assertAllRoutesDeclared) traverses all registered routes
//    and throws if any route is undeclared.

import type { Request, Response, NextFunction, RequestHandler, Express } from 'express'
import { hasPermission, type Action } from '../domain/permissions.js'
import { recordAuditEvent } from '../lib/auditTrail.js'

export type RoutePermissionDeclaration = Action | Action[] | 'allowlist'

interface DeclaredRoute {
  method: string
  path: string
  declaration: RoutePermissionDeclaration
}

// ── Central Route Declaration Registry ──
const ROUTE_REGISTRY: DeclaredRoute[] = []

/**
 * Register an explicit route declaration.
 */
export function registerRoutePermission(
  method: string,
  path: string,
  declaration: RoutePermissionDeclaration,
): void {
  const normMethod = method.toUpperCase()
  const normPath = normalizePath(path)
  const existing = ROUTE_REGISTRY.findIndex(
    r => r.method === normMethod && r.path === normPath,
  )
  if (existing !== -1) {
    ROUTE_REGISTRY[existing].declaration = declaration
  } else {
    ROUTE_REGISTRY.push({ method: normMethod, path: normPath, declaration })
  }
}

/**
 * Normalize route path for consistent matching across router mounts.
 */
export function normalizePath(path: string): string {
  // Strip duplicate slashes, trailing slashes (except root) and ensure leading slash
  let p = path.trim().replace(/\/+/g, '/')
  if (!p.startsWith('/')) p = `/${p}`
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

// ── Explicit Allowlist (Public, Auth & Session Lifecycle) ──
export const PUBLIC_OR_ALLOWLIST_ROUTES = new Set<string>([
  'GET /health',
  'POST /auth/login',
  'POST /api/auth/login',
  'POST /auth/mfa/verify',
  'POST /api/auth/mfa/verify',
  'POST /auth/mfa/recovery-code',
  'POST /api/auth/mfa/recovery-code',
  'POST /auth/forgot-password',
  'POST /api/auth/forgot-password',
  'POST /auth/reset-password',
  'POST /api/auth/reset-password',
  'POST /auth/google',
  'POST /api/auth/google',
  'POST /auth/logout',
  'POST /api/auth/logout',
  'GET /auth/csrf',
  'GET /api/auth/csrf',
  'GET /auth/me',
  'GET /api/auth/me',
  'GET /auth/session',
  'GET /api/auth/session',
  'POST /auth/session/touch',
  'POST /api/auth/session/touch',
  'GET /auth/session/all',
  'GET /api/auth/session/all',
  'DELETE /auth/session/:sessionId',
  'DELETE /api/auth/session/:sessionId',
  'POST /auth/session/revoke-others',
  'POST /api/auth/session/revoke-others',
  'GET /auth/sessions',
  'GET /api/auth/sessions',
  'GET /auth/sessions/all',
  'GET /api/auth/sessions/all',
  'POST /auth/sessions/touch',
  'POST /api/auth/sessions/touch',
  'DELETE /auth/sessions/:sessionId',
  'DELETE /api/auth/sessions/:sessionId',
  'POST /auth/sessions/revoke-others',
  'POST /api/auth/sessions/revoke-others',
  'POST /auth/change-password',
  'POST /api/auth/change-password',
  'POST /auth/reauthenticate',
  'POST /api/auth/reauthenticate',
  'POST /auth/mfa/setup',
  'POST /api/auth/mfa/setup',
  'POST /auth/mfa/confirm',
  'POST /api/auth/mfa/confirm',
  'GET /track/:id',
  'GET /api/track/:id',
])

// Seed registry with explicit allowlist entries
for (const entry of PUBLIC_OR_ALLOWLIST_ROUTES) {
  const [method, ...rest] = entry.split(' ')
  registerRoutePermission(method, rest.join(' '), 'allowlist')
}

/**
 * Require explicit permission action(s).
 * If actor does not have ANY of the listed actions, records an audit event and returns 403.
 */
export function requirePermission(action: Action | Action[]): RequestHandler {
  const required = Array.isArray(action) ? action : [action]

  return (req: Request, res: Response, next: NextFunction) => {
    const actor = req.actor
    if (!actor) {
      return res.status(401).json({
        error: { code: 'unauthorized', message: 'Authentication required.' },
      })
    }

    const permitted = required.some(a => hasPermission(actor.role, a))
    if (!permitted) {
      recordAuditEvent({
        req,
        action: 'permission_denied',
        entityType: 'system',
        entityId: req.originalUrl,
        outcome: 'failure',
        before: { requiredPermissions: required, actorRole: actor.role },
      }).catch(() => {})

      return res.status(403).json({
        error: {
          code: 'forbidden',
          message: 'You do not have permission to perform this action.',
        },
      })
    }

    next()
  }
}

/**
 * Helper to register a route permission and return the middleware in one call.
 */
export function declarePermission(
  method: string,
  fullPath: string,
  action: Action | Action[],
): RequestHandler {
  registerRoutePermission(method, fullPath, action)
  if (!fullPath.startsWith('/api')) {
    registerRoutePermission(method, `/api${fullPath}`, action)
  }
  return requirePermission(action)
}

/**
 * Recursively inspect Express application routes and assert every route is declared.
 * Throws an Error if any route fails the deny-by-default check.
 */
export function assertAllRoutesDeclared(app: Express): { totalRoutes: number; declaredRoutes: number } {
  const routesFound: { method: string; path: string }[] = []

  // Helper to extract routes from Express router layer stack
  function extractLayers(stack: any[], prefix = '') {
    for (const layer of stack) {
      if (layer.route) {
        const routePath = normalizePath(prefix + (layer.route.path || ''))
        const methods = Object.keys(layer.route.methods || {})
        for (const m of methods) {
          routesFound.push({ method: m.toUpperCase(), path: routePath })
        }
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        // Sub-router mount
        let subPrefix = prefix
        if (layer.regexp) {
          const match = layer.regexp.source
            // convert express regex prefix to string path
            .replace('^\\', '')
            .replace('\\/?(?=\\/|$)', '')
            .replace(/\\\//g, '/')
            .replace(/\^/g, '')
            .replace(/\$/g, '')
            .replace(/\(\?:\(\[\^\\\/]\+\?\)\)/g, ':id')
            .replace(/\(\?:\([^\)]+\)\)/g, '')
          if (match && !match.startsWith('(?=')) {
            subPrefix = normalizePath(prefix + '/' + match)
          }
        }
        extractLayers(layer.handle.stack, subPrefix)
      }
    }
  }

  if ((app as any)._router && (app as any)._router.stack) {
    extractLayers((app as any)._router.stack)
  }

  // Verify every found route against ROUTE_REGISTRY or PUBLIC_OR_ALLOWLIST_ROUTES
  const undeclared: string[] = []

  for (const r of routesFound) {
    const key = `${r.method} ${r.path}`
    const isAllowlisted = PUBLIC_OR_ALLOWLIST_ROUTES.has(key)
    const isRegistered = ROUTE_REGISTRY.some(
      reg => reg.method === r.method && (reg.path === r.path || pathsMatch(reg.path, r.path)),
    )

    if (!isAllowlisted && !isRegistered) {
      undeclared.push(key)
    }
  }

  if (undeclared.length > 0) {
    throw new Error(
      `DENY BY DEFAULT VIOLATION: Found ${undeclared.length} undeclared route(s):\n` +
      undeclared.map(u => `  - ${u}`).join('\n') +
      `\nEvery route must declare an explicit permission via registerRoutePermission / requirePermission.`,
    )
  }

  return {
    totalRoutes: routesFound.length,
    declaredRoutes: ROUTE_REGISTRY.length,
  }
}

function pathsMatch(registeredPattern: string, routePath: string): boolean {
  if (registeredPattern === routePath) return true
  // Match :param wildcard
  const regParts = registeredPattern.split('/')
  const routeParts = routePath.split('/')
  if (regParts.length !== routeParts.length) return false
  for (let i = 0; i < regParts.length; i++) {
    if (regParts[i].startsWith(':') || routeParts[i].startsWith(':')) continue
    if (regParts[i] !== routeParts[i]) return false
  }
  return true
}

export function __getRouteRegistry(): DeclaredRoute[] {
  return [...ROUTE_REGISTRY]
}
