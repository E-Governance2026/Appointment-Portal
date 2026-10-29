import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import PageContainer from '../ui/PageContainer'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useSidebar } from '../../hooks/useSidebar'
import { useAuthStore } from '../../store/authStore'
import SessionManager from '../session/SessionManager'

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
  const navigate = useNavigate()
  useDocumentTitle(titleForPath(location.pathname))

  const user = useAuthStore(s => s.user)
  const refreshUser = useAuthStore(s => s.refreshUser)
  const [isCheckingAuth, setIsCheckingAuth] = useState(!user && !!import.meta.env.VITE_API_BASE_URL)

  useEffect(() => {
    if (!user && import.meta.env.VITE_API_BASE_URL) {
      refreshUser().then(u => {
        setIsCheckingAuth(false)
        if (!u) {
          const next = encodeURIComponent(location.pathname + location.search)
          navigate(`/login?next=${next}`, { replace: true })
        }
      })
    }
  }, [user, refreshUser, location, navigate])

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

  if (isCheckingAuth) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-cream)' }}>
        <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)', fontSize: '15px' }}>Verifying session...</p>
      </div>
    )
  }

  const sidebarWidth = collapsed ? COLLAPSED : EXPANDED

  return (
    <SessionManager>
      <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: 'var(--color-cream)', width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>

      {/* ── Desktop sidebar: full height sticky panel ── */}
      {!isMobile && (
        <aside
          style={{
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            height: '100vh',
            width: sidebarWidth,
            transition: 'width var(--motion-slow) var(--ease-out)',
            display: 'flex',
            flexDirection: 'column',
            margin: 0,
            padding: 0,
            borderRadius: 0,
            boxShadow: 'none',
            zIndex: 30,
          }}
        >
          <Sidebar collapsed={collapsed} />
        </aside>
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
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
        <Navbar onMenuClick={toggle} />
        <main style={{ flex: 1, minWidth: 0, width: '100%', overflowX: 'hidden' }}>
          <PageContainer>
            <Outlet />
          </PageContainer>
        </main>
      </div>
    </div>
    </SessionManager>
  )
}

