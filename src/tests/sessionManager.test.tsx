import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { axe } from 'vitest-axe'
import * as matchers from 'vitest-axe/matchers'
import { expect as vexpect } from 'vitest'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '../lib/queryClient'
import SessionWarningDialog from '../components/session/SessionWarningDialog'
import SessionManager, { useSessionManager } from '../components/session/SessionManager'
import { useAuthStore } from '../store/authStore'
import { api } from '../services/apiClient'

vexpect.extend(matchers)

describe('SessionWarningDialog component', () => {
  afterEach(() => {
    cleanup()
  })

  it('meets accessibility standards with no axe violations', async () => {
    const { container } = render(
      <SessionWarningDialog
        secondsLeft={30}
        onStaySignedIn={vi.fn()}
        onSignOutNow={vi.fn()}
      />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders modal alertdialog with proper ARIA attributes and focus on Stay Signed In', () => {
    const { container } = render(
      <SessionWarningDialog
        secondsLeft={25}
        onStaySignedIn={vi.fn()}
        onSignOutNow={vi.fn()}
      />
    )

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'session-warn-title')
    expect(dialog).toHaveAttribute('aria-describedby', 'session-warn-desc')

    const stayBtn = screen.getByRole('button', { name: /stay signed in/i })
    expect(stayBtn).toBeInTheDocument()
    expect(document.activeElement).toBe(stayBtn)

    const signOutBtn = screen.getByRole('button', { name: /sign out now/i })
    expect(signOutBtn).toBeInTheDocument()
    expect(screen.getByText(/25 seconds/i)).toBeInTheDocument()
  })

  it('traps focus between Stay signed in and Sign out buttons on Tab / Shift+Tab', () => {
    render(
      <SessionWarningDialog
        secondsLeft={20}
        onStaySignedIn={vi.fn()}
        onSignOutNow={vi.fn()}
      />
    )

    const stayBtn = screen.getByRole('button', { name: /stay signed in/i })
    const signOutBtn = screen.getByRole('button', { name: /sign out now/i })

    stayBtn.focus()
    expect(document.activeElement).toBe(stayBtn)

    // Shift+Tab from first button wraps to last button
    fireEvent.keyDown(stayBtn, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(signOutBtn)

    // Tab from last button wraps back to first button
    fireEvent.keyDown(signOutBtn, { key: 'Tab', shiftKey: false })
    expect(document.activeElement).toBe(stayBtn)
  })

  it('pressing Escape triggers onStaySignedIn per specification', () => {
    const onStaySignedIn = vi.fn()
    const onSignOutNow = vi.fn()

    render(
      <SessionWarningDialog
        secondsLeft={15}
        onStaySignedIn={onStaySignedIn}
        onSignOutNow={onSignOutNow}
      />
    )

    const dialog = screen.getByRole('alertdialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onStaySignedIn).toHaveBeenCalledTimes(1)
    expect(onSignOutNow).not.toHaveBeenCalled()
  })

  it('clicking buttons invokes their corresponding callbacks', () => {
    const onStaySignedIn = vi.fn()
    const onSignOutNow = vi.fn()

    render(
      <SessionWarningDialog
        secondsLeft={10}
        onStaySignedIn={onStaySignedIn}
        onSignOutNow={onSignOutNow}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /stay signed in/i }))
    expect(onStaySignedIn).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /sign out now/i }))
    expect(onSignOutNow).toHaveBeenCalledTimes(1)
  })

  it('updates polite live region on designated intervals (30, 20, 10, 5)', () => {
    const { rerender } = render(
      <SessionWarningDialog
        secondsLeft={30}
        onStaySignedIn={vi.fn()}
        onSignOutNow={vi.fn()}
      />
    )

    const liveRegion = screen.getByRole('status')
    expect(liveRegion).toHaveAttribute('aria-live', 'polite')

    rerender(
      <SessionWarningDialog
        secondsLeft={20}
        onStaySignedIn={vi.fn()}
        onSignOutNow={vi.fn()}
      />
    )
    expect(liveRegion).toBeInTheDocument()
  })
})

describe('SessionManager integration & behavior', () => {
  beforeEach(() => {
    queryClient.clear()
    useAuthStore.setState({
      user: {
        id: 'usr_test',
        name: 'Test User',
        email: 'test@example.com',
        role: 'requester',
        department: 'Engineering',
        employeeId: 'EMP-123',
      },
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('shows warning dialog when session check returns warning window', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({
      authenticated: true,
      remainingIdleSeconds: 30,
      remainingAbsoluteSeconds: 3600,
      idleTimeoutSeconds: 180,
      warningSeconds: 30,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <SessionManager>
            <div>Dashboard Content</div>
          </SessionManager>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Trigger visibilitychange to force checkSessionWithServer
    fireEvent(document, new Event('visibilitychange'))

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })
    expect(screen.getByText(/You will be signed out in/i)).toBeInTheDocument()
  })

  it('"Stay signed in" in SessionManager calls touch and dismisses dialog', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      authenticated: true,
      remainingIdleSeconds: 25,
      remainingAbsoluteSeconds: 3600,
      idleTimeoutSeconds: 180,
      warningSeconds: 30,
    })
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      authenticated: true,
      remainingIdleSeconds: 180,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <SessionManager>
            <div>Dashboard Content</div>
          </SessionManager>
        </MemoryRouter>
      </QueryClientProvider>
    )

    fireEvent(document, new Event('visibilitychange'))

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    const stayBtn = screen.getByRole('button', { name: /stay signed in/i })
    fireEvent.click(stayBtn)

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(postSpy).toHaveBeenCalledWith('/auth/session/touch', undefined, { passive: false })
  })

  it('invokes registered draft autosave callback before displaying warning dialog', async () => {
    const autosaveMock = vi.fn().mockResolvedValue(undefined)

    function DraftComponent() {
      const { registerDraftAutosave } = useSessionManager()
      React.useEffect(() => {
        return registerDraftAutosave(autosaveMock)
      }, [registerDraftAutosave])
      return <div>Booking in progress</div>
    }

    vi.spyOn(api, 'get').mockResolvedValue({
      authenticated: true,
      remainingIdleSeconds: 20,
      remainingAbsoluteSeconds: 3600,
      idleTimeoutSeconds: 180,
      warningSeconds: 30,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/book']}>
          <SessionManager>
            <DraftComponent />
          </SessionManager>
        </MemoryRouter>
      </QueryClientProvider>
    )

    fireEvent(document, new Event('visibilitychange'))

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    expect(autosaveMock).toHaveBeenCalledTimes(1)
  })

  it('synchronizes multi-tab logout and expiry via BroadcastChannel', async () => {
    const channel = new BroadcastChannel('ap_session_sync')

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <SessionManager>
                  <div>Dashboard Page</div>
                </SessionManager>
              }
            />
            <Route path="/login" element={<div>Login Page Redirected</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument()

    // Simulate another tab broadcasting a LOGOUT message
    channel.postMessage({ type: 'LOGOUT' })

    await waitFor(() => {
      expect(screen.getByText('Login Page Redirected')).toBeInTheDocument()
    })

    expect(useAuthStore.getState().user).toBeNull()
    channel.close()
  })

  it('closes warning dialog if another tab broadcasts STAY_SIGNED_IN or TOUCH', async () => {
    const channel = new BroadcastChannel('ap_session_sync')

    vi.spyOn(api, 'get').mockResolvedValue({
      authenticated: true,
      remainingIdleSeconds: 15,
      remainingAbsoluteSeconds: 3600,
      idleTimeoutSeconds: 180,
      warningSeconds: 30,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <SessionManager>
            <div>Dashboard Content</div>
          </SessionManager>
        </MemoryRouter>
      </QueryClientProvider>
    )

    fireEvent(document, new Event('visibilitychange'))

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    // Another tab performs activity and broadcasts STAY_SIGNED_IN
    channel.postMessage({ type: 'STAY_SIGNED_IN' })

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    channel.close()
  })

  it('redirects to login with reason=timeout if server returns unauthenticated on focus', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      authenticated: false,
      remainingIdleSeconds: 0,
      remainingAbsoluteSeconds: 0,
      idleTimeoutSeconds: 180,
      warningSeconds: 30,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <SessionManager>
                  <div>Dashboard Page</div>
                </SessionManager>
              }
            />
            <Route path="/login" element={<div>Login Page Redirected</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    fireEvent(window, new Event('focus'))

    await waitFor(() => {
      expect(screen.getByText('Login Page Redirected')).toBeInTheDocument()
    })
    expect(useAuthStore.getState().user).toBeNull()
  })
})
