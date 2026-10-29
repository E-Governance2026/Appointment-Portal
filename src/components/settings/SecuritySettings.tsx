import React, { useState, useEffect } from 'react'
import {
  Shield, Key, Smartphone, Laptop, Clock,
  CheckCircle2, XCircle, AlertTriangle, Copy, Check, LogOut,
} from 'lucide-react'
import { api } from '../../services/apiClient'
import { useAuthStore } from '../../store/authStore'

interface SessionInfo {
  sessionId:      string
  device:         string
  maskedIp:       string
  createdAt:      string
  lastActivityAt: string
  isCurrent:      boolean
}

export default function SecuritySettings() {
  const user = useAuthStore(s => s.user)

  // ── Change Password State ──
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passLoading, setPassLoading] = useState(false)
  const [passError, setPassError] = useState('')
  const [passSuccess, setPassSuccess] = useState('')

  // ── MFA State ──
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaLoading, setMfaLoading] = useState(false)
  const [mfaSetup, setMfaSetup] = useState<{ secretBase32: string; qrCodeDataUrl: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [mfaSuccess, setMfaSuccess] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedCodes, setCopiedCodes] = useState(false)

  // ── Active Sessions State ──
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionActionMsg, setSessionActionMsg] = useState('')

  // Load initial data
  useEffect(() => {
    fetchActiveSessions()
    fetchUserMfaStatus()
  }, [])

  async function fetchUserMfaStatus() {
    try {
      const res = await api.get<{ mfaEnabled?: boolean }>('/auth/me')
      if (res && typeof res.mfaEnabled === 'boolean') {
        setMfaEnabled(res.mfaEnabled)
      }
    } catch { /* ok */ }
  }

  async function fetchActiveSessions() {
    setSessionsLoading(true)
    try {
      const res = await api.get<{ sessions: SessionInfo[] }>('/auth/sessions/all')
      setSessions(res.sessions || [])
    } catch {
      // Fallback local session representation if offline
      setSessions([
        {
          sessionId: 'current-session',
          device: 'Current Browser on Windows',
          maskedIp: '127.0.0.xxx',
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          isCurrent: true,
        },
      ])
    } finally {
      setSessionsLoading(false)
    }
  }

  // ── Password Policy Real-time Checks ──
  const lengthValid = newPassword.length >= 12 && newPassword.length <= 128
  const matchesConfirm = newPassword.length > 0 && newPassword === confirmPassword
  const noEmployeeId = !user?.employeeId || !newPassword.toLowerCase().includes(user.employeeId.toLowerCase())
  const noEmail = !user?.email || !newPassword.toLowerCase().includes(user.email.split('@')[0].toLowerCase())
  const noName = !user?.name || !newPassword.toLowerCase().includes(user.name.split(' ')[0].toLowerCase())

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPassError('')
    setPassSuccess('')

    if (!lengthValid) {
      setPassError('Password must be between 12 and 128 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPassError('New passwords do not match.')
      return
    }

    setPassLoading(true)
    try {
      const res = await api.post<{ message?: string }>('/auth/change-password', {
        currentPassword,
        newPassword,
      })
      setPassSuccess(res.message || 'Password changed successfully. All other active sessions have been signed out.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      fetchActiveSessions()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not change password.'
      setPassError(msg)
    } finally {
      setPassLoading(false)
    }
  }

  async function startMfaSetup() {
    setMfaError('')
    setMfaLoading(true)
    try {
      const res = await api.post<{ secretBase32: string; qrCodeDataUrl: string }>('/auth/mfa/setup')
      setMfaSetup(res)
    } catch (err: unknown) {
      setMfaError(err instanceof Error ? err.message : 'Failed to initialize MFA.')
    } finally {
      setMfaLoading(false)
    }
  }

  async function confirmMfa() {
    if (!mfaSetup || totpCode.trim().length !== 6) {
      setMfaError('Please enter the 6-digit code from your authenticator app.')
      return
    }
    setMfaError('')
    setMfaLoading(true)
    try {
      const res = await api.post<{ recoveryCodes: string[]; message?: string }>('/auth/mfa/confirm', {
        secretBase32: mfaSetup.secretBase32,
        code: totpCode.trim(),
      })
      setRecoveryCodes(res.recoveryCodes || [])
      setMfaEnabled(true)
      setMfaSetup(null)
      setMfaSuccess(res.message || 'Two-factor authentication has been enabled.')
    } catch (err: unknown) {
      setMfaError(err instanceof Error ? err.message : 'Verification failed. Try again.')
    } finally {
      setMfaLoading(false)
    }
  }

  async function revokeSession(id: string) {
    try {
      await api.delete(`/auth/sessions/${id}`)
      setSessionActionMsg('Session signed out.')
      fetchActiveSessions()
      setTimeout(() => setSessionActionMsg(''), 4000)
    } catch (err: unknown) {
      setSessionActionMsg(err instanceof Error ? err.message : 'Could not sign out session.')
    }
  }

  async function revokeOtherSessions() {
    try {
      const res = await api.post<{ message?: string }>('/auth/sessions/revoke-others')
      setSessionActionMsg(res.message || 'All other sessions have been signed out.')
      fetchActiveSessions()
      setTimeout(() => setSessionActionMsg(''), 4000)
    } catch (err: unknown) {
      setSessionActionMsg(err instanceof Error ? err.message : 'Could not revoke sessions.')
    }
  }

  function copySecret() {
    if (mfaSetup?.secretBase32) {
      navigator.clipboard.writeText(mfaSetup.secretBase32)
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
    }
  }

  function copyAllRecoveryCodes() {
    if (recoveryCodes) {
      navigator.clipboard.writeText(recoveryCodes.join('\n'))
      setCopiedCodes(true)
      setTimeout(() => setCopiedCodes(false), 2000)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* ── SECTION 1: CHANGE PASSWORD ── */}
      <section className="card" style={{ padding: '1.75rem', borderRadius: '12px', border: '1px solid var(--color-sage)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
            <Key size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-charcoal)', margin: 0 }}>Change Password</h2>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>
              Requires minimum 12 characters. Changing your password signs out all other sessions.
            </p>
          </div>
        </div>

        {passSuccess && (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#ECFDF5', color: '#065F46', marginBottom: '1.25rem', fontSize: '14px' }}>
            <CheckCircle2 size={16} />
            <span>{passSuccess}</span>
          </div>
        )}

        {passError && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#FEF2F2', color: '#991B1B', marginBottom: '1.25rem', fontSize: '14px' }}>
            <AlertTriangle size={16} />
            <span>{passError}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} style={{ maxWidth: '480px' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="current-password" style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-charcoal)', marginBottom: '0.35rem' }}>
              Current Password
            </label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
              className="input-field"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-sage)', fontSize: '14px' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="new-password" style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-charcoal)', marginBottom: '0.35rem' }}>
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              className="input-field"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-sage)', fontSize: '14px' }}
            />
          </div>

          {/* Password policy checklist */}
          <div style={{ backgroundColor: 'var(--color-sand)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '12px' }}>
            <p style={{ fontWeight: 600, color: 'var(--color-charcoal)', margin: '0 0 0.5rem 0' }}>Password requirements:</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: lengthValid ? '#059669' : '#6B7280' }}>
                {lengthValid ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                12 to 128 characters long
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: noEmployeeId && noEmail && noName ? '#059669' : '#DC2626' }}>
                {noEmployeeId && noEmail && noName ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                Does not contain your employee ID, email, or name
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#059669' }}>
                <CheckCircle2 size={13} />
                No arbitrary symbol or number rules
              </li>
            </ul>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="confirm-password" style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-charcoal)', marginBottom: '0.35rem' }}>
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              className="input-field"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-sage)', fontSize: '14px' }}
            />
            {newPassword && confirmPassword && !matchesConfirm && (
              <span style={{ fontSize: '12px', color: '#DC2626', marginTop: '0.25rem', display: 'block' }}>
                Passwords do not match
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={passLoading || !lengthValid || !matchesConfirm}
            className="btn-primary"
            style={{ padding: '0.6rem 1.25rem' }}
          >
            {passLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </section>

      {/* ── SECTION 2: MULTI-FACTOR AUTHENTICATION (TOTP) ── */}
      <section className="card" style={{ padding: '1.75rem', borderRadius: '12px', border: '1px solid var(--color-sage)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED' }}>
              <Smartphone size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-charcoal)', margin: 0 }}>
                Two-Factor Authentication (TOTP)
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>
                RFC 6238 standard: compatible with Google Authenticator, Microsoft Authenticator, and 1Password.
              </p>
            </div>
          </div>

          <span style={{
            fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px',
            backgroundColor: mfaEnabled ? '#ECFDF5' : '#F3F4F6',
            color: mfaEnabled ? '#059669' : '#6B7280',
          }}>
            {mfaEnabled ? 'Enabled & Active' : 'Not Configured'}
          </span>
        </div>

        {mfaSuccess && (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#ECFDF5', color: '#065F46', marginBottom: '1.25rem', fontSize: '14px' }}>
            <CheckCircle2 size={16} />
            <span>{mfaSuccess}</span>
          </div>
        )}

        {mfaError && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#FEF2F2', color: '#991B1B', marginBottom: '1.25rem', fontSize: '14px' }}>
            <AlertTriangle size={16} />
            <span>{mfaError}</span>
          </div>
        )}

        {!mfaEnabled && !mfaSetup && (
          <button
            type="button"
            onClick={startMfaSetup}
            disabled={mfaLoading}
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem' }}
          >
            <Shield size={16} />
            {mfaLoading ? 'Loading...' : 'Set up Authenticator App'}
          </button>
        )}

        {/* QR Code Enrollment Step */}
        {mfaSetup && (
          <div style={{ backgroundColor: 'var(--color-ivory)', border: '1px solid var(--color-sage)', borderRadius: '10px', padding: '1.5rem', maxWidth: '520px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-charcoal)', margin: '0 0 0.5rem 0' }}>
              1. Scan this QR code in your authenticator app
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 1rem 0' }}>
              Open your authenticator app (e.g. Google Authenticator) and scan the code below.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', margin: '1rem 0', padding: '0.75rem', backgroundColor: '#fff', borderRadius: '8px', width: 'fit-content' }}>
              <img src={mfaSetup.qrCodeDataUrl} alt="TOTP QR Code" style={{ width: '180px', height: '180px' }} />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                Can't scan? Enter this manual key instead:
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <code style={{ fontFamily: 'monospace', fontSize: '13px', letterSpacing: '1px', backgroundColor: 'var(--color-sand)', padding: '4px 8px', borderRadius: '4px' }}>
                  {mfaSetup.secretBase32}
                </code>
                <button type="button" onClick={copySecret} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-forest)' }} aria-label="Copy key">
                  {copiedKey ? <Check size={16} color="#059669" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-charcoal)', margin: '1rem 0 0.5rem 0' }}>
              2. Confirm 6-digit code
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '280px', marginBottom: '1rem' }}>
              <input
                type="text"
                maxLength={6}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '18px', fontWeight: 600, padding: '0.5rem', width: '140px', borderRadius: '6px', border: '1px solid var(--color-sage)' }}
              />
              <button
                type="button"
                onClick={confirmMfa}
                disabled={totpCode.length !== 6 || mfaLoading}
                className="btn-primary"
                style={{ flex: 1 }}
              >
                {mfaLoading ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </div>
        )}

        {/* Display Recovery Codes once on successful enrollment */}
        {recoveryCodes && (
          <div style={{ backgroundColor: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '10px', padding: '1.5rem', marginTop: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#854D0E', fontWeight: 600, marginBottom: '0.5rem' }}>
              <AlertTriangle size={18} />
              Save your backup recovery codes
            </div>
            <p style={{ fontSize: '13px', color: '#713F12', margin: '0 0 1rem 0' }}>
              These 10 single-use recovery codes allow you to sign in if you lose access to your authenticator app.
              They will not be shown again.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', backgroundColor: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #FEF08A', marginBottom: '1rem' }}>
              {recoveryCodes.map((code, idx) => (
                <code key={idx} style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '14px', color: '#1F2937' }}>
                  {code}
                </code>
              ))}
            </div>

            <button
              type="button"
              onClick={copyAllRecoveryCodes}
              className="btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {copiedCodes ? <Check size={16} /> : <Copy size={16} />}
              {copiedCodes ? 'Copied to Clipboard!' : 'Copy all recovery codes'}
            </button>
          </div>
        )}
      </section>

      {/* ── SECTION 3: ACTIVE SESSIONS ── */}
      <section className="card" style={{ padding: '1.75rem', borderRadius: '12px', border: '1px solid var(--color-sage)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <Laptop size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-charcoal)', margin: 0 }}>Active Sessions</h2>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>
                Devices and browsers currently signed in to your account.
              </p>
            </div>
          </div>

          {sessions.length > 1 && (
            <button
              type="button"
              onClick={revokeOtherSessions}
              className="btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '13px' }}
            >
              <LogOut size={14} />
              Sign out of all other sessions
            </button>
          )}
        </div>

        {sessionActionMsg && (
          <div role="status" style={{ padding: '0.6rem 1rem', borderRadius: '6px', backgroundColor: 'var(--color-sand)', fontSize: '13px', color: 'var(--color-forest)', marginBottom: '1rem' }}>
            {sessionActionMsg}
          </div>
        )}

        {sessionsLoading ? (
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Loading active sessions...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {sessions.map(s => (
              <div
                key={s.sessionId}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '1rem', borderRadius: '8px', border: '1px solid var(--color-sage)',
                  backgroundColor: s.isCurrent ? '#F0FDF4' : '#fff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <Laptop size={20} color={s.isCurrent ? '#059669' : '#6B7280'} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-charcoal)' }}>
                        {s.device}
                      </span>
                      {s.isCurrent && (
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', backgroundColor: '#DCFCE7', color: '#166534' }}>
                          Current Session
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                      IP: {s.maskedIp} • Last active {new Date(s.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                {!s.isCurrent && (
                  <button
                    type="button"
                    onClick={() => revokeSession(s.sessionId)}
                    className="btn-secondary"
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    Sign out
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
