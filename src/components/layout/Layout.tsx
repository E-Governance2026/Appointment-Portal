import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import PageContainer from '../ui/PageContainer'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useSidebar } from '../../hooks/useSidebar'

// Route prefix -> page label for the document title.
const ROUTE_TITLES: { prefix: string; label: string }[] = [
  { prefix: '/dashboard',          label: 'Dashboard' },
  { prefix: '/book',               label: 'Book appointment' },
  { prefix: '/book-appointment',   label: 'Book appointment' },
  { prefix: '/my-appointments',    label: 'My appointments' },
  { prefix: '/calendar',           label: 'Calendar' },
  { prefix: '/approvals',          label: 'Approvals' },
  { prefix: '/visitor-management', label: 'Visitor management' },
  { prefix: '/reports',            label: 'Reports' },
  { prefix: '/master-management',  label: 'Master management' },
  { prefix: '/user-management',    label: 'User management' },
  { prefix: '/settings',           label: 'Settings' },
]

function titleForPath(pathname: string): string {
  const match = ROUTE_TITLES.find(r => pathname === r.prefix || pathname.startsWith(r.prefix + '/'))
  return match?.label ?? ''
}

const EXPANDED = '264px'
const COLLAPSED = '72px'

export default function Layout() {
  const location = useLocation()
  useDocumentTitle(titleForPath(location.pathname))

  const { collapsed, isMobile, drawerOpen, toggle, closeDrawer } = useSidebar()
  const drawerRef = useRef<HTMLDivElement>(null)

  // Mobile drawer: Escape closes; focus moves into the drawer; simple focus trap.
  useEffect(() => {
    if (!isMobile || !drawerOpen) return
    const node = drawerRef.current
    const focusables = node?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
    )
    focusables?.[0]?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { closeDrawer(); return }
      if (e.key !== 'Tab' || !focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isMobile, drawerOpen, closeDrawer])

  const sidebarWidth = collapsed ? COLLAPSED : EXPANDED

  return (
    <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: 'var(--color-cream)' }}>
      {/* ── Desktop sidebar: sticky floating panel (gap on all sides) ── */}
      {!isMobile && (
        <div
          style={{
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            height: '100vh',
            padding: 'var(--space-4)',
            paddingRight: 0,
            boxSizing: 'border-box',
            display: 'flex',
            width: `calc(${sidebarWidth} + var(--space-4))`,
            transition: 'width var(--motion-slow) var(--ease-out)',
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              borderRadius: 'var(--radius-xl)',
              overflow: 'hidden',
              boxShadow: 'var(--elevation-2)',
            }}
          >
            <Sidebar collapsed={collapsed} />
          </div>
        </div>
      )}

      {/* ── Mobile drawer + overlay ── */}
      {isMobile && drawerOpen && (
        <>
          <div
            onClick={closeDrawer}
            aria-hidden="true"
            style={{ position: 'fixed', inset: 0, zIndex: 45, backgroundColor: 'var(--color-scrim)' }}
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            style={{
              position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 46,
              width: EXPANDED, maxWidth: '85vw',
              boxShadow: 'var(--elevation-3)',
            }}
          >
            <Sidebar collapsed={false} onNavigate={closeDrawer} />
          </div>
        </>
      )}

      {/* ── Content column ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Navbar onMenuClick={toggle} />
        <main style={{ flex: 1, minWidth: 0 }}>
          <PageContainer>
            <Outlet />
          </PageContainer>
        </main>
      </div>
    </div>
  )
}
