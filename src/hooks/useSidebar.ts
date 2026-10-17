import { useEffect, useState } from 'react'

const STORAGE_KEY = 'at_sidebar_collapsed'
const MOBILE_BREAKPOINT = 1024

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

// ─── useSidebar ───────────────────────────────────────────────────────────────
// Owns the shell's sidebar state:
//  - collapsed: 264px <-> 72px icon rail, persisted to localStorage (desktop).
//  - isMobile: below 1024px the sidebar becomes an overlay drawer.
//  - drawerOpen: whether the mobile drawer is showing.
// The single menu button in the header toggles collapse on desktop and the
// drawer on mobile.
export function useSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(loadCollapsed)
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false,
  )
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Track the breakpoint.
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (!mobile) setDrawerOpen(false)   // leaving mobile closes the drawer
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Persist the collapse choice (desktop only concept).
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(collapsed)) } catch { /* ignore */ }
  }, [collapsed])

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (isMobile && drawerOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [isMobile, drawerOpen])

  function toggle() {
    if (isMobile) setDrawerOpen(o => !o)
    else setCollapsed(c => !c)
  }

  return {
    collapsed,
    isMobile,
    drawerOpen,
    toggle,
    closeDrawer: () => setDrawerOpen(false),
  }
}
