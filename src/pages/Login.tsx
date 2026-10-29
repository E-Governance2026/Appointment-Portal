import { useRef, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, ChevronDown } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import type { Role } from '../config/permissions'
import Logo from '../components/ui/Logo'
import Button from '../components/ui/Button'

// Demo role switcher — strictly disabled in production builds.
const features = { demoRoleSwitcher: import.meta.env.DEV === true && import.meta.env.MODE !== 'production' }

const DEMO_ROLE_OPTIONS: { label: string; role: Role }[] = [
  { label: 'Requester',               role: 'requester'             },
  { label: 'Coordinator / Authority', role: 'coordinator_authority' },
  { label: 'Admin dispatcher',        role: 'admin_dispatcher'      },
  { label: 'Super admin',             role: 'super_admin'           },
]

function validateId(value: string): string {
  if (!value.trim()) return 'Enter your employee ID or email.'
  return ''
}
function validatePassword(value: string): string {
  if (!value) return 'Enter your password.'
  return ''
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const user     = useAuthStore(s => s.user)
  const loginAs  = useAuthStore(s => s.loginAs)
  const login    = useAuthStore(s => s.login)
  const verifyMfa = useAuthStore(s => s.verifyMfa)
  const verifyRecoveryCode = useAuthStore(s => s.verifyRecoveryCode)

  const searchParams = new URLSearchParams(location.search)
  const reasonParam = searchParams.get('reason')
  const nextParam = searchParams.get('next')
  const rawReturnTo = nextParam ? decodeURIComponent(nextParam) : (location.state as { returnTo?: string } | null)?.returnTo
  const returnTo = (!rawReturnTo || rawReturnTo === '/' || rawReturnTo === '/login' || !rawReturnTo.startsWith('/') || rawReturnTo.startsWith('//'))
    ? '/dashboard'
    : rawReturnTo

  useEffect(() => {
    if (user) {
      navigate(returnTo, { replace: true })
    }
  }, [user, returnTo, navigate])

  // Status banner messages per spec
  let statusBannerText = ''
  if (reasonParam === 'timeout') {
    statusBannerText = 'You were signed out after 3 minutes of inactivity.'
  } else if (reasonParam === 'expired') {
    statusBannerText = 'Your session has expired. Sign in again.'
  } else if (reasonParam === 'absolute') {
    statusBannerText = 'You were signed out after a long session. Sign in again.'
  }

  // Use the real backend whenever VITE_API_BASE_URL is configured or in test mode
  const isTestEnv = import.meta.env.MODE === 'test' || (typeof globalThis !== 'undefined' && (globalThis as unknown as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV === 'test')
  const useBackend = !!(import.meta.env.VITE_API_BASE_URL) || Boolean(isTestEnv)

  const [identifier, setIdentifier] = useState('')
  const [password,   setPassword]   = useState('')
  const [showPass,   setShowPass]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [capsOn,     setCapsOn]     = useState(false)

  // MFA Challenge State
  const [mfaPending, setMfaPending] = useState<{ tempSessionId?: string } | null>(null)
  const [totpCode,   setTotpCode]   = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')

  const [idError,   setIdError]   = useState('')
  const [passError, setPassError] = useState('')
  const [bannerErr, setBannerErr] = useState('')

  const [demoOpen, setDemoOpen] = useState(false)
  const [demoRole, setDemoRole] = useState<Role>('requester')

  const bannerRef = useRef<HTMLDivElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBannerErr('')
    const idErr   = validateId(identifier)
    const passErr = validatePassword(password)
    setIdError(idErr)
    setPassError(passErr)
    if (idErr || passErr) return

    setLoading(true)
    try {
      if (useBackend) {
        const res = await login(identifier.trim(), password)
        if (res && res.mfaRequired) {
          setMfaPending({ tempSessionId: res.tempSessionId })
          setLoading(false)
          return
        }
      } else {
        await new Promise(r => setTimeout(r, 600))
        if (identifier === 'wrong' || password === 'wrong') {
          throw new Error('Email or password is incorrect.')
        }
        loginAs('requester')
      }
      navigate(returnTo, { replace: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign in failed. Try again.'
      setBannerErr(message)
      // Move focus to the error banner for assistive technology.
      requestAnimationFrame(() => bannerRef.current?.focus())
    } finally {
      setLoading(false)
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBannerErr('')
    setLoading(true)

    try {
      if (useRecovery) {
        if (!recoveryCode.trim()) throw new Error('Enter your recovery code.')
        await verifyRecoveryCode(recoveryCode.trim(), mfaPending?.tempSessionId)
      } else {
        if (totpCode.trim().length !== 6) throw new Error('Enter 6-digit code from authenticator app.')
        await verifyMfa(totpCode.trim(), mfaPending?.tempSessionId)
      }
      navigate(returnTo, { replace: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'MFA verification failed.'
      setBannerErr(message)
    } finally {
      setLoading(false)
    }
  }


  function handleDemoSignIn() {
    loginAs(demoRole)
    navigate('/dashboard', { replace: true })
  }

  // Track Caps Lock for the password field hint.
  function onPassKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === 'function') setCapsOn(e.getModifierState('CapsLock'))
  }

  const copyright = '\u00A9 2026 Parul University, MIS Department. All rights reserved.'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', overflowX: 'hidden' }}>
      {/* ── Left panel (desktop only): flex column full height ── */}
      <div
        className="login-left-panel"
        style={{
          width: '50%',
          backgroundColor: 'var(--color-forest)',
          display: 'flex',
          flexDirection: 'column',
          padding: 'clamp(2rem, 4vw, 3rem)',
          flexShrink: 0,
        }}
      >
        <Logo size="md" variant="dark" />

        {/* Centered heading + body + image slot */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'var(--space-6)', paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-8)' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 'clamp(2rem, 3.5vw, 2.5rem)',
              lineHeight: 1.2, color: '#ffffff', margin: '0 0 var(--space-4) 0', textWrap: 'balance' }}>
              Sign in to Appointment Portal
            </h1>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '18px', lineHeight: 1.65,
              color: 'rgb(255 255 255 / 0.85)', margin: 0, maxWidth: '420px' }}>
              Request appointments with university authorities and track each request until it is confirmed.
            </p>
          </div>

          <div style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', flexShrink: 0 }}>
            <img
              src="/images/campus-gate.jpeg"
              alt="Parul University campus gate"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </div>
        </div>

        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'rgb(255 255 255 / 0.7)', margin: 0 }}>
          {copyright}
        </p>
      </div>

      {/* ── Right panel: cream, centered card ── */}
      <div style={{ flex: 1, backgroundColor: 'var(--color-cream)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 'clamp(1.5rem, 4vw, 3rem)', minWidth: 0 }}>

        {/* Mobile compact header (logo above the card) */}
        <div className="login-mobile-header" style={{ display: 'none', marginBottom: 'var(--space-6)' }}>
          <Logo size="md" variant="light" />
        </div>

        <div style={{ width: '100%', maxWidth: '440px', backgroundColor: 'var(--color-ivory)',
          border: '1px solid var(--color-sage)', borderRadius: '12px', padding: '40px' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '28px',
            color: 'var(--color-charcoal)', margin: '0 0 var(--space-1) 0', lineHeight: 1.2 }}>
            Sign in
          </h2>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '16px', color: 'var(--color-text-secondary)',
            margin: '0 0 var(--space-6) 0', lineHeight: 1.5 }}>
            Use your university account.
          </p>

          {statusBannerText && (
            <div
              role="status"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                color: '#1e40af',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                marginBottom: 'var(--space-5)',
                lineHeight: 1.5,
              }}
            >
              {statusBannerText}
            </div>
          )}

          {bannerErr && (
            <div ref={bannerRef} role="alert" tabIndex={-1} style={{ fontFamily: 'var(--font-sans)', fontSize: '14px',
              color: '#7d1c18', backgroundColor: '#fce8e6', border: '1px solid #f5c6c4', borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem', marginBottom: 'var(--space-5)', lineHeight: 1.5, outline: 'none' }}>
              {bannerErr}
            </div>
          )}


          {mfaPending ? (
            <form onSubmit={handleMfaSubmit} noValidate>
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-charcoal)', margin: '0 0 0.5rem 0' }}>
                  Two-Factor Authentication
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', margin: '0 0 1rem 0' }}>
                  {!useRecovery
                    ? 'Enter the 6-digit code from your authenticator app.'
                    : 'Enter one of your 8-character single-use recovery codes.'}
                </p>

                {!useRecovery ? (
                  <div>
                    <label htmlFor="login-totp" style={labelStyle}>6-digit Authenticator Code</label>
                    <input
                      id="login-totp"
                      type="text"
                      maxLength={6}
                      autoFocus
                      value={totpCode}
                      onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="input login-input"
                      style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '20px', fontWeight: 600 }}
                    />
                  </div>
                ) : (
                  <div>
                    <label htmlFor="login-recovery" style={labelStyle}>Recovery Code</label>
                    <input
                      id="login-recovery"
                      type="text"
                      autoFocus
                      value={recoveryCode}
                      onChange={e => setRecoveryCode(e.target.value.toUpperCase())}
                      placeholder="XXXX-XXXX"
                      className="input login-input"
                      style={{ textAlign: 'center', letterSpacing: '2px', fontSize: '18px', fontWeight: 600 }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setUseRecovery(!useRecovery)}
                  className="login-text-link"
                  style={{ fontSize: '13px' }}
                >
                  {useRecovery ? 'Use Authenticator Code instead' : 'Lost device? Use recovery code'}
                </button>
              </div>

              <Button type="submit" variant="primary" size="lg" loading={loading} style={{ width: '100%' }}>
                {loading ? 'Verifying...' : 'Verify & Sign in'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {/* Identifier */}
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <label htmlFor="login-identifier" style={labelStyle}>Employee ID or email</label>
                <input
                  id="login-identifier"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={identifier}
                  onChange={e => { setIdentifier(e.target.value); setIdError('') }}
                  aria-invalid={!!idError}
                  aria-describedby={idError ? 'id-error' : undefined}
                  className="input login-input"
                  style={{ borderColor: idError ? 'var(--color-danger)' : undefined }}
                />
                {idError && <p id="id-error" style={fieldErrStyle}>{idError}</p>}
              </div>

              {/* Password */}
              <div style={{ marginBottom: 'var(--space-6)' }}>
                <label htmlFor="login-password" style={labelStyle}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="login-password"
                    name="password"
                    type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setPassError('') }}
                    onKeyUp={onPassKey}
                    onKeyDown={onPassKey}
                    aria-invalid={!!passError}
                    aria-describedby={[passError ? 'pass-error' : '', capsOn ? 'caps-hint' : ''].filter(Boolean).join(' ') || undefined}
                    className="input login-input"
                    style={{ paddingRight: '2.75rem', borderColor: passError ? 'var(--color-danger)' : undefined }}
                  />
                  <button type="button" onClick={() => setShowPass(p => !p)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    style={{ position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)',
                      background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem', borderRadius: 'var(--radius-sm)' }}>
                    {showPass ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
                {capsOn && (
                  <p id="caps-hint" style={{ fontFamily: 'var(--font-sans)', fontSize: '13px',
                    color: 'var(--color-text-secondary)', margin: '0.3rem 0 0 0' }}>
                    Caps Lock is on
                  </p>
                )}
                {passError && <p id="pass-error" style={fieldErrStyle}>{passError}</p>}
              </div>

              <Button type="submit" variant="primary" size="lg" loading={loading} style={{ width: '100%' }}>
                {loading ? 'Signing in' : 'Sign in'}
              </Button>
            </form>
          )}

          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)',
            margin: 'var(--space-5) 0 0 0', lineHeight: 1.5 }}>
            Need help signing in? Contact the MIS department.
          </p>
        </div>

        {/* Track link */}
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', color: 'var(--color-text-secondary)',
          marginTop: 'var(--space-6)', lineHeight: 1.5 }}>
          Want to track an appointment?{' '}
          <button onClick={() => navigate('/track')} className="login-text-link">
            Track an appointment
          </button>
        </p>

        {/* Demo accounts — collapsible disclosure, closed by default */}
        {features.demoRoleSwitcher && (
          <div style={{ width: '100%', maxWidth: '440px', marginTop: 'var(--space-4)',
            border: '1px solid var(--color-sage)', borderRadius: '12px', backgroundColor: 'var(--color-ivory)', overflow: 'hidden' }}>
            <button
              onClick={() => setDemoOpen(o => !o)}
              aria-expanded={demoOpen}
              aria-controls="demo-panel"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.875rem 1.25rem', background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '15px', color: 'var(--color-charcoal)' }}>
              Demo accounts
              <ChevronDown size={16} aria-hidden="true" style={{ transform: demoOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform var(--motion-slow) var(--ease-out)' }} />
            </button>

            {demoOpen && (
              <div id="demo-panel" style={{ padding: '0 1.25rem 1.25rem' }}>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#7c3000',
                  backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 'var(--radius-sm)',
                  padding: '0.375rem 0.625rem', margin: '0 0 1rem 0' }}>
                  Demo only. Remove before release.
                </p>
                <label htmlFor="demo-role-select" style={labelStyle}>Select a role</label>
                <select id="demo-role-select" value={demoRole} onChange={e => setDemoRole(e.target.value as Role)}
                  className="input" style={{ marginBottom: 'var(--space-3)', cursor: 'pointer' }}>
                  {DEMO_ROLE_OPTIONS.map(opt => <option key={opt.role} value={opt.role}>{opt.label}</option>)}
                </select>
                <Button variant="secondary" size="md" onClick={handleDemoSignIn} style={{ width: '100%' }}>
                  Sign in as {DEMO_ROLE_OPTIONS.find(o => o.role === demoRole)?.label.toLowerCase()}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 767px) {
          .login-left-panel { display: none !important; }
          .login-mobile-header { display: flex !important; }
        }
        .login-text-link {
          font-family: var(--font-sans); font-size: 15px; font-weight: 600;
          color: var(--color-emerald); background: transparent; border: none;
          cursor: pointer; text-decoration: underline; padding: 0;
        }
        /* Keep autofilled inputs on the ivory surface. */
        .login-input:-webkit-autofill,
        .login-input:-webkit-autofill:hover,
        .login-input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px #FFFDF8 inset !important;
          -webkit-text-fill-color: #172522 !important;
          caret-color: #172522;
          transition: background-color 9999s ease-in-out 0s;
        }
      `}</style>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: '15px',
  color: 'var(--color-charcoal)', marginBottom: '0.3rem',
}
const fieldErrStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-danger)', margin: '0.3rem 0 0 0',
}
