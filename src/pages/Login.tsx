import { useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, ChevronDown } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import type { Role } from '../config/permissions'
import Logo from '../components/ui/Logo'
import Button from '../components/ui/Button'

// Demo role switcher — enabled only in dev builds.
const features = { demoRoleSwitcher: import.meta.env.DEV === true }

const DEMO_ROLE_OPTIONS: { label: string; role: Role }[] = [
  { label: 'Requester',        role: 'requester'        },
  { label: 'Coordinator',      role: 'coordinator'      },
  { label: 'Authority',        role: 'authority'        },
  { label: 'Admin dispatcher', role: 'admin_dispatcher' },
  { label: 'Reception',        role: 'reception'        },
  { label: 'Super admin',      role: 'super_admin'      },
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
  const loginAs  = useAuthStore(s => s.loginAs)
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? '/dashboard'

  const [identifier, setIdentifier] = useState('')
  const [password,   setPassword]   = useState('')
  const [showPass,   setShowPass]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [capsOn,     setCapsOn]     = useState(false)

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
    await new Promise(r => setTimeout(r, 900))
    setLoading(false)

    if (identifier === 'wrong' || password === 'wrong') {
      setBannerErr('Employee ID or password is incorrect. Check both and try again.')
      // Move focus to the error banner for assistive technology.
      requestAnimationFrame(() => bannerRef.current?.focus())
      return
    }
    loginAs('requester')
    navigate(returnTo, { replace: true })
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

          <div style={{ aspectRatio: '4 / 3', maxWidth: '560px', borderRadius: '12px',
            border: '1px dashed rgb(255 255 255 / 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'rgb(255 255 255 / 0.55)',
              textAlign: 'center', padding: '1rem', margin: 0 }}>
              Replace with official campus photograph
            </p>
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

          {bannerErr && (
            <div ref={bannerRef} role="alert" tabIndex={-1} style={{ fontFamily: 'var(--font-sans)', fontSize: '14px',
              color: '#7d1c18', backgroundColor: '#fce8e6', border: '1px solid #f5c6c4', borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem', marginBottom: 'var(--space-5)', lineHeight: 1.5, outline: 'none' }}>
              {bannerErr}
            </div>
          )}

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
