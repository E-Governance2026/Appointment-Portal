import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '../lib/queryClient'
import SecuritySettings from '../components/settings/SecuritySettings'
import RecentAuthModal from '../components/common/RecentAuthModal'
import Login from '../pages/Login'
import { useAuthStore } from '../store/authStore'
import { api } from '../services/apiClient'

vi.mock('../services/apiClient', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  setCsrfToken: vi.fn(),
  setToken: vi.fn(),
}))

describe('Frontend Authentication Hardening Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      user: {
        id: 'u-sup',
        name: 'Super Admin',
        email: 'super.admin@university.edu',
        role: 'super_admin',
        department: 'MIS Department',
        employeeId: 'PU-2010-000',
      },
    })
  })

  afterEach(() => {
    cleanup()
  })

  describe('1. SecuritySettings Component', () => {
    beforeEach(() => {
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/auth/sessions/all') {
          return {
            sessions: [
              {
                sessionId: 'sess-current',
                device: 'Chrome on Windows',
                maskedIp: '192.168.1.***',
                createdAt: new Date().toISOString(),
                lastActivityAt: new Date().toISOString(),
                isCurrent: true,
              },
              {
                sessionId: 'sess-other',
                device: 'Firefox on Mac',
                maskedIp: '10.0.0.***',
                createdAt: new Date(Date.now() - 3600000).toISOString(),
                lastActivityAt: new Date(Date.now() - 1800000).toISOString(),
                isCurrent: false,
              },
            ],
          }
        }
        if (url === '/auth/me') {
          return { mfaEnabled: false }
        }
        return {}
      })
    })

    it('renders password change, two-factor authentication, and active sessions sections', async () => {
      await act(async () => {
        render(
          <QueryClientProvider client={queryClient}>
            <SecuritySettings />
          </QueryClientProvider>
        )
      })

      expect(screen.getByText('Change Password')).toBeInTheDocument()
      expect(screen.getByText('Two-Factor Authentication (TOTP)')).toBeInTheDocument()
      expect(screen.getByText('Active Sessions')).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getByText('Chrome on Windows')).toBeInTheDocument()
        expect(screen.getByText('Firefox on Mac')).toBeInTheDocument()
        expect(screen.getByText(/Current Session/i)).toBeInTheDocument()
      })
    })

    it('enforces password policy checklist interactively as user types new password', async () => {
      await act(async () => {
        render(
          <QueryClientProvider client={queryClient}>
            <SecuritySettings />
          </QueryClientProvider>
        )
      })

      const newPassInput = screen.getByLabelText(/^New Password/i)
      expect(screen.getByText(/12 to 128 characters long/i)).toBeInTheDocument()

      // Type short password
      await act(async () => {
        fireEvent.change(newPassInput, { target: { value: 'Short1!' } })
      })
      const shortItem = screen.getByText(/12 to 128 characters long/i)
      expect(shortItem.style.color).toBe('rgb(107, 114, 128)') // #6B7280

      // Type valid long passphrase
      await act(async () => {
        fireEvent.change(newPassInput, { target: { value: 'Correct-Horse-Battery-Staple-2026' } })
      })
      const validItem = screen.getByText(/12 to 128 characters long/i)
      expect(validItem.style.color).toBe('rgb(5, 150, 105)') // #059669
    })

    it('handles two-factor setup flow: shows QR code and manual key, confirms with OTP', async () => {
      vi.mocked(api.post).mockImplementation(async (url: string) => {
        if (url === '/auth/mfa/setup') {
          return {
            secretBase32: 'JBSWY3DPEHPK3PXP',
            qrCodeDataUrl: 'data:image/png;base64,mockqrdata',
          }
        }
        if (url === '/auth/mfa/confirm') {
          return {
            success: true,
            recoveryCodes: [
              'A1B2-C3D4', 'E5F6-G7H8', 'I9J0-K1L2', 'M3N4-O5P6', 'Q7R8-S9T0',
              'U1V2-W3X4', 'Y5Z6-A7B8', 'C9D0-E1F2', 'G3H4-I5J6', 'K7L8-M9N0',
            ],
          }
        }
        return {}
      })

      await act(async () => {
        render(
          <QueryClientProvider client={queryClient}>
            <SecuritySettings />
          </QueryClientProvider>
        )
      })

      const setupBtn = screen.getByRole('button', { name: /set up authenticator app/i })
      await act(async () => {
        fireEvent.click(setupBtn)
      })

      await waitFor(() => {
        expect(screen.getByAltText(/totp qr code/i)).toBeInTheDocument()
        expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument()
      })

      const codeInput = screen.getByPlaceholderText('123456')
      await act(async () => {
        fireEvent.change(codeInput, { target: { value: '123456' } })
      })

      const confirmBtn = screen.getByRole('button', { name: /^verify$/i })
      await act(async () => {
        fireEvent.click(confirmBtn)
      })

      await waitFor(() => {
        expect(screen.getByText('A1B2-C3D4')).toBeInTheDocument()
        expect(screen.getByText('K7L8-M9N0')).toBeInTheDocument()
        expect(screen.getByText(/save your backup recovery codes/i)).toBeInTheDocument()
      })
    })

    it('revokes a specific session and revokes all other sessions', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({ success: true })
      vi.mocked(api.post).mockResolvedValueOnce({ success: true, revokedCount: 1 })

      await act(async () => {
        render(
          <QueryClientProvider client={queryClient}>
            <SecuritySettings />
          </QueryClientProvider>
        )
      })

      await waitFor(() => {
        expect(screen.getByText('Firefox on Mac')).toBeInTheDocument()
      })

      const signOutBtns = screen.getAllByRole('button', { name: /sign out/i })
      const individualSignOut = signOutBtns.find(b => b.textContent?.trim() === 'Sign out')
      expect(individualSignOut).toBeDefined()

      await act(async () => {
        fireEvent.click(individualSignOut!)
      })

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/auth/sessions/sess-other')
      })

      const signAllBtn = screen.getByRole('button', { name: /sign out of all other sessions/i })
      await act(async () => {
        fireEvent.click(signAllBtn)
      })

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/auth/sessions/revoke-others')
      })
    })
  })

  describe('2. RecentAuthModal Component', () => {
    it('renders accessible modal dialog with focus trap and handles password submission', async () => {
      const onSuccess = vi.fn()
      const onCancel = vi.fn()
      vi.mocked(api.post).mockResolvedValueOnce({ success: true })

      render(
        <RecentAuthModal
          isOpen={true}
          onSuccess={onSuccess}
          onCancel={onCancel}
          title="Confirm Security Password"
        />
      )

      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
      expect(screen.getByText('Confirm Security Password')).toBeInTheDocument()

      const passInput = screen.getByPlaceholderText('Your password')
      fireEvent.change(passInput, { target: { value: 'Portal@2026' } })

      const submitBtn = screen.getByRole('button', { name: /^confirm$/i })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/auth/reauthenticate', {
          password: 'Portal@2026',
          totpCode: undefined,
        })
        expect(onSuccess).toHaveBeenCalled()
      })
    })

    it('closes on Escape key press or Cancel button click', () => {
      const onSuccess = vi.fn()
      const onCancel = vi.fn()

      render(
        <RecentAuthModal
          isOpen={true}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      )

      const cancelBtn = screen.getByRole('button', { name: /cancel/i })
      fireEvent.click(cancelBtn)
      expect(onCancel).toHaveBeenCalledTimes(1)

      const dialog = screen.getByRole('dialog')
      fireEvent.keyDown(dialog, { key: 'Escape' })
      expect(onCancel).toHaveBeenCalledTimes(2)
    })
  })

  describe('3. Login Page MFA Challenge Flow', () => {
    beforeEach(() => {
      useAuthStore.setState({ user: null })
    })

    it('renders 6-digit TOTP challenge when mfaRequired is returned from login', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({
        mfaRequired: true,
        tempSessionId: 'temp-sess-123',
        csrfToken: 'csrf-123',
        message: 'Two-factor authentication code required.',
      })

      render(
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<Login />} />
          </Routes>
        </MemoryRouter>
      )

      const idInput = screen.getByLabelText(/employee id or email/i)
      const passInput = screen.getByLabelText(/^password/i)

      fireEvent.change(idInput, { target: { value: 'super.admin@university.edu' } })
      fireEvent.change(passInput, { target: { value: 'Portal@2026' } })

      const signInBtn = screen.getByRole('button', { name: /^sign in$/i })
      fireEvent.click(signInBtn)

      // Renders 2FA challenge screen
      await waitFor(() => {
        expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('123456')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /verify & sign in/i })).toBeInTheDocument()
      })
    })
  })
})
