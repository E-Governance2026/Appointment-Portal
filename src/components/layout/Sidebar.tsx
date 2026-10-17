import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarPlus,
  CalendarDays,
  CalendarCheck,
  CheckSquare,
  Users,
  BarChart2,
  Settings2,
  UserCog,
  Settings,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useDashboardStats } from '../../hooks/useDashboard'
import { useAuthStore } from '../../store/authStore'
import { canAccessRoute, ROLE_LABELS } from '../../config/permissions'
import Logo from '../ui/Logo'
import Avatar from '../ui/Avatar'

// ─── Nav item ─────────────────────────────────────────────────────────────────
interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
  showBadge?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',          path: '/dashboard',          icon: <LayoutDashboard size={20} aria-hidden="true" /> },
  { label: 'Book appointment',   path: '/book',               icon: <CalendarPlus    size={20} aria-hidden="true" /> },
  { label: 'My appointments',    path: '/my-appointments',    icon: <CalendarDays    size={20} aria-hidden="true" /> },
  { label: 'Calendar',           path: '/calendar',           icon: <CalendarCheck   size={20} aria-hidden="true" /> },
  { label: 'Approvals',          path: '/approvals',          icon: <CheckSquare     size={20} aria-hidden="true" />, showBadge: true },
  { label: 'Visitor management', path: '/visitor-management', icon: <Users           size={20} aria-hidden="true" /> },
  { label: 'Reports',            path: '/reports',            icon: <BarChart2       size={20} aria-hidden="true" /> },
  { label: 'Master management',  path: '/master-management',  icon: <Settings2       size={20} aria-hidden="true" /> },
  { label: 'User management',    path: '/user-management',    icon: <UserCog         size={20} aria-hidden="true" /> },
  { label: 'Settings',           path: '/settings',           icon: <Settings        size={20} aria-hidden="true" /> },
]

interface SidebarProps {
  collapsed?: boolean
  /** Called when a nav item is chosen (used to close the mobile drawer). */
  onNavigate?: () => void
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
// Full-bleed forest panel: 264px expanded, 72px icon rail collapsed. The parent
// (Layout) positions it (sticky on desktop, drawer on mobile); this component
// only renders the brand, nav and user block.
export default function Sidebar({ collapsed = false, onNavigate }: SidebarProps) {
  const navigate = useNavigate()
  const [profileExpanded, setProfileExpanded] = useState(false)
  const { data: stats } = useDashboardStats()
  const approvalCount   = stats?.awaitingApproval ?? 0

  const user   = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)

  const role = user?.role
  const visibleItems = NAV_ITEMS.filter(item => role && canAccessRoute(role, item.path))

  function handleSignOut() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div
      style={{
        height: '100%',
        backgroundColor: 'var(--color-forest)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ── Brand block ── */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? 'var(--space-4) 0' : 'var(--space-4)',
          borderBottom: '1px solid var(--color-on-forest-12)',
          minHeight: '72px',
        }}
      >
        {collapsed ? <Logo size="md" variant="dark" showText={false} /> : <Logo size="md" variant="dark" />}
      </div>

      {/* ── Nav ── */}
      <nav
        aria-label="Main navigation"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: 'var(--space-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
        }}
      >
        {visibleItems.map(item => {
          const badge = item.showBadge && approvalCount > 0 ? approvalCount : undefined
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/dashboard'}
              onClick={onNavigate}
              className="on-dark sidebar-nav-item"
              data-collapsed={collapsed ? 'true' : undefined}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                height: '44px',
                padding: collapsed ? '0' : '0 var(--space-3)',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 'var(--radius-lg)',
                textDecoration: 'none',
                position: 'relative',
                backgroundColor: isActive ? 'var(--color-emerald)' : 'transparent',
                color: isActive ? '#ffffff' : 'rgb(255 255 255 / 0.78)',
                transition: 'background-color var(--motion-fast) var(--ease-out)',
              })}
            >
              <span style={{ flexShrink: 0, lineHeight: 1 }}>{item.icon}</span>

              {!collapsed && (
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
                  fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
              )}

              {badge !== undefined && !collapsed && (
                <span className="tnum" style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)',
                  fontWeight: 700, backgroundColor: 'var(--color-danger)', color: '#ffffff',
                  borderRadius: 'var(--radius-sm)', padding: '1px 6px', flexShrink: 0, lineHeight: 1.6 }}>
                  {badge}
                </span>
              )}

              {badge !== undefined && collapsed && (
                <span aria-label={`${badge} pending`} style={{ position: 'absolute', top: '6px', right: '10px',
                  width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-danger)' }} />
              )}

              {collapsed && (
                <span role="tooltip" className="sidebar-tooltip" style={{ position: 'absolute',
                  left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)',
                  backgroundColor: 'var(--color-charcoal)', color: '#ffffff', fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-xs)', fontWeight: 500, padding: '4px 10px', borderRadius: 'var(--radius-md)',
                  whiteSpace: 'nowrap', pointerEvents: 'none', opacity: 0, zIndex: 100, boxShadow: 'var(--elevation-2)' }}>
                  {item.label}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* ── User block pinned at bottom ── */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--color-on-forest-12)', padding: 'var(--space-2)' }}>
        <button
          onClick={() => !collapsed && setProfileExpanded(p => !p)}
          className="on-dark"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            height: '44px', padding: collapsed ? '0' : '0 var(--space-3)',
            borderRadius: 'var(--radius-lg)', backgroundColor: 'transparent', border: 'none',
            color: 'rgb(255 255 255 / 0.85)', cursor: 'pointer',
            justifyContent: collapsed ? 'center' : 'flex-start',
            transition: 'background-color var(--motion-fast) var(--ease-out)',
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-on-forest-08)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <Avatar name={user?.name ?? 'AU'} size={32} />
          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 'var(--text-sm)',
                  color: '#ffffff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                  {user?.name ?? 'Signed out'}
                </p>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)',
                  color: 'rgb(255 255 255 / 0.55)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user ? ROLE_LABELS[user.role] : ''}
                </p>
              </div>
              {profileExpanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
            </>
          )}
        </button>

        {!collapsed && profileExpanded && (
          <div style={{ marginTop: 'var(--space-1)', borderRadius: 'var(--radius-md)', overflow: 'hidden',
            backgroundColor: 'var(--color-on-forest-08)' }}>
            {[
              { label: 'My profile',      color: 'rgb(255 255 255 / 0.8)', onClick: () => { navigate('/settings'); onNavigate?.() } },
              { label: 'Change password', color: 'rgb(255 255 255 / 0.8)', onClick: () => { navigate('/settings'); onNavigate?.() } },
              { label: 'Sign out',        color: '#fca5a5',                onClick: handleSignOut },
            ].map(item => (
              <button
                key={item.label}
                onClick={item.onClick}
                className="on-dark"
                style={{ width: '100%', textAlign: 'left', padding: '8px 14px', fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-xs)', color: item.color, backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-on-forest-08)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .sidebar-tooltip { transition: opacity var(--motion-fast) var(--ease-out); }
        .sidebar-nav-item:hover .sidebar-tooltip,
        .sidebar-nav-item:focus-visible .sidebar-tooltip { opacity: 1 !important; }
        .sidebar-nav-item:hover[aria-current="page"] { background-color: var(--color-emerald) !important; }
        .sidebar-nav-item:not([aria-current="page"]):hover { background-color: var(--color-on-forest-08); }
        .sidebar-nav-item:not([aria-current="page"]):active { background-color: var(--color-on-forest-12); }
      `}</style>
    </div>
  )
}
