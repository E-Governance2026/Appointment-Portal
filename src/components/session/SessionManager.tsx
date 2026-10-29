import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api, onSessionExpiry } from '../../services/apiClient'
import { useAuthStore } from '../../store/authStore'
import { queryClient } from '../../lib/queryClient'
import SessionWarningDialog from './SessionWarningDialog'

interface SessionContextType {
  touch: () => Promise<void>
  trackUpload: (isUploading: boolean) => void
  registerDraftAutosave: (fn: () => void | Promise<void>) => () => void
}

const SessionContext = createContext<SessionContextType | null>(null)

export function useSessionManager() {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error('useSessionManager must be used within SessionManager')
  }
  return ctx
}

interface Props {
  children: React.ReactNode
}

// 150 seconds of inactivity before warning dialog opens (180s idle - 30s warning)
const INACTIVITY_BEFORE_WARN_MS = 150_000
// Throttle session touch requests to at most once per 30 seconds
const TOUCH_THROTTLE_MS = 30_000
// Throttle pointermove to 1 per second
const POINTER_MOVE_THROTTLE_MS = 1_000

export default function SessionManager({ children }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore(s => s.user)
  const logoutStore = useAuthStore(s => s.logout)

  const [warningOpen, setWarningOpen] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(30)

  const lastActivityRef = useRef<number>(Date.now())
  const lastTouchRef = useRef<number>(0)
  const lastPointerMoveRef = useRef<number>(0)
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const uploadCountRef = useRef<number>(0)
  const draftAutosaveCallbackRef = useRef<(() => void | Promise<void>) | null>(null)
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null)

  // Safe current path for redirect
  const getSafeNextPath = useCallback((): string => {
    const p = window.location.pathname + window.location.search
    if (p.startsWith('/login') || p === '/') return '/dashboard'
    return encodeURIComponent(p)
  }, [])

  // ── Expiry Flow ─────────────────────────────────────────────────────────────
  const runExpiryFlow = useCallback((reason: string) => {
    // Clear all intervals / timers
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current)
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    setWarningOpen(false)

    // Clear TanStack Query cache & client state
    queryClient.clear()
    logoutStore()

    const nextPath = getSafeNextPath()

    // Broadcast expiry to other tabs
    try {
      broadcastChannelRef.current?.postMessage({
        type: 'EXPIRED',
        reason,
        next: nextPath,
      })
    } catch { /* ok */ }

    let reasonCode = 'timeout'
    if (reason === 'session_absolute_timeout' || reason === 'absolute') {
      reasonCode = 'absolute'
    } else if (reason === 'expired') {
      reasonCode = 'expired'
    }

    navigate(`/login?reason=${reasonCode}&next=${nextPath}`, { replace: true })
  }, [logoutStore, getSafeNextPath, navigate])

  // ── Touch the server session ────────────────────────────────────────────────
  const touchServer = useCallback(async (force = false): Promise<void> => {
    const now = Date.now()
    if (!force && now - lastTouchRef.current < TOUCH_THROTTLE_MS) {
      return
    }
    lastTouchRef.current = now
    try {
      await api.post('/auth/session/touch', undefined, { passive: false })
      // Notify other tabs
      try {
        broadcastChannelRef.current?.postMessage({ type: 'TOUCH' })
      } catch { /* ok */ }
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e?.code === 'session_expired') {
        runExpiryFlow('timeout')
      }
    }
  }, [runExpiryFlow])

  // ── Check session with server (used at 150s, visibility change, and focus) ───
  const checkSessionWithServer = useCallback(async () => {
    if (!user) return
    try {
      const res = await api.get<{
        authenticated: boolean
        remainingIdleSeconds: number
        remainingAbsoluteSeconds: number
        idleTimeoutSeconds: number
        warningSeconds: number
      }>('/auth/session')

      if (!res.authenticated || res.remainingIdleSeconds <= 0) {
        runExpiryFlow('timeout')
        return
      }

      // If within warning window, open warning dialog with server's remaining seconds
      const warnThreshold = res.warningSeconds || 30
      if (res.remainingIdleSeconds <= warnThreshold) {
        // Trigger draft autosave before showing warning dialog
        if (draftAutosaveCallbackRef.current) {
          try { await draftAutosaveCallbackRef.current() } catch { /* ok */ }
        }
        setSecondsLeft(res.remainingIdleSeconds)
        setWarningOpen(true)
      } else {
        // Reset local timer based on server remaining time minus warning window
        setWarningOpen(false)
        if (warnTimerRef.current) clearTimeout(warnTimerRef.current)
        const msUntilWarning = (res.remainingIdleSeconds - warnThreshold) * 1000
        warnTimerRef.current = setTimeout(() => {
          checkSessionWithServer()
        }, Math.max(1000, msUntilWarning))
      }
    } catch {
      // If error indicates session expiry, run expiry flow
    }
  }, [user, runExpiryFlow])

  // ── Reset local inactivity timer ───────────────────────────────────────────
  const scheduleWarning = useCallback(() => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current)
    warnTimerRef.current = setTimeout(() => {
      checkSessionWithServer()
    }, INACTIVITY_BEFORE_WARN_MS)
  }, [checkSessionWithServer])

  // ── "Stay signed in" Action ─────────────────────────────────────────────────
  const handleStaySignedIn = useCallback(async () => {
    setWarningOpen(false)
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    await touchServer(true)
    scheduleWarning()
    try {
      broadcastChannelRef.current?.postMessage({ type: 'STAY_SIGNED_IN' })
    } catch { /* ok */ }
  }, [touchServer, scheduleWarning])

  // ── "Sign out now" Action ───────────────────────────────────────────────────
  const handleSignOutNow = useCallback(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    setWarningOpen(false)
    try {
      broadcastChannelRef.current?.postMessage({ type: 'LOGOUT' })
    } catch { /* ok */ }
    queryClient.clear()
    logoutStore()
    navigate('/login', { replace: true })
  }, [logoutStore, navigate])

  // ── Handle incoming 401 session_expired broadcast from apiClient ───────────
  useEffect(() => {
    onSessionExpiry((reason) => {
      runExpiryFlow(reason)
    })
  }, [runExpiryFlow])

  // ── Multi-tab sync via BroadcastChannel ─────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return
    const channel = new BroadcastChannel('ap_session_sync')
    broadcastChannelRef.current = channel

    channel.onmessage = (event) => {
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (data.type === 'ACTIVITY' || data.type === 'TOUCH' || data.type === 'STAY_SIGNED_IN') {
        // Reset warning dialog and timers in this tab
        setWarningOpen(false)
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
        scheduleWarning()
      } else if (data.type === 'LOGOUT') {
        queryClient.clear()
        logoutStore()
        navigate('/login', { replace: true })
      } else if (data.type === 'EXPIRED') {
        queryClient.clear()
        logoutStore()
        navigate(`/login?reason=${data.reason || 'timeout'}&next=${data.next || ''}`, { replace: true })
      }
    }

    return () => {
      channel.close()
    }
  }, [scheduleWarning, logoutStore, navigate])

  // ── Countdown timer when warning dialog is open ────────────────────────────
  useEffect(() => {
    if (!warningOpen) {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
      return
    }

    countdownIntervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current!)
          runExpiryFlow('timeout')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    }
  }, [warningOpen, runExpiryFlow])

  // ── User Activity Listeners ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return

    scheduleWarning()

    function handleActivity(e: Event) {
      // Ignore programmatic (synthetic/untrusted) events
      if ('isTrusted' in e && !e.isTrusted) return

      // When the warning dialog is open, mouse movement or typing must NOT dismiss it.
      // Only the dialog buttons (or Escape) dismiss it.
      if (warningOpen) return

      const now = Date.now()

      // Throttle pointermove to at most 1 event per second
      if (e.type === 'pointermove') {
        if (now - lastPointerMoveRef.current < POINTER_MOVE_THROTTLE_MS) return
        lastPointerMoveRef.current = now
      }

      lastActivityRef.current = now
      scheduleWarning()
      touchServer(false)

      try {
        broadcastChannelRef.current?.postMessage({ type: 'ACTIVITY' })
      } catch { /* ok */ }
    }

    const events = ['mousedown', 'keydown', 'wheel', 'touchstart', 'scroll', 'pointermove']
    events.forEach(ev => window.addEventListener(ev, handleActivity, { passive: true }))

    return () => {
      events.forEach(ev => window.removeEventListener(ev, handleActivity))
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current)
    }
  }, [user, warningOpen, scheduleWarning, touchServer])

  // ── Visibility Change & Focus Re-checks ─────────────────────────────────────
  useEffect(() => {
    if (!user) return

    function handleRecheck() {
      if (document.visibilityState === 'visible') {
        checkSessionWithServer()
      }
    }

    document.addEventListener('visibilitychange', handleRecheck)
    window.addEventListener('focus', handleRecheck)

    return () => {
      document.removeEventListener('visibilitychange', handleRecheck)
      window.removeEventListener('focus', handleRecheck)
    }
  }, [user, checkSessionWithServer])

  // ── File upload tracking: touch every 30 seconds during active uploads ──────
  const trackUpload = useCallback((isUploading: boolean) => {
    if (isUploading) {
      uploadCountRef.current += 1
    } else {
      uploadCountRef.current = Math.max(0, uploadCountRef.current - 1)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const interval = setInterval(() => {
      if (uploadCountRef.current > 0) {
        touchServer(true)
        scheduleWarning()
      }
    }, TOUCH_THROTTLE_MS)

    return () => clearInterval(interval)
  }, [user, touchServer, scheduleWarning])

  // ── Draft autosave callback registration ────────────────────────────────────
  const registerDraftAutosave = useCallback((fn: () => void | Promise<void>) => {
    draftAutosaveCallbackRef.current = fn
    return () => {
      if (draftAutosaveCallbackRef.current === fn) {
        draftAutosaveCallbackRef.current = null
      }
    }
  }, [])

  const contextValue: SessionContextType = {
    touch: () => touchServer(true),
    trackUpload,
    registerDraftAutosave,
  }

  return (
    <SessionContext.Provider value={contextValue}>
      {children}
      {warningOpen && (
        <SessionWarningDialog
          secondsLeft={secondsLeft}
          onStaySignedIn={handleStaySignedIn}
          onSignOutNow={handleSignOutNow}
        />
      )}
    </SessionContext.Provider>
  )
}
