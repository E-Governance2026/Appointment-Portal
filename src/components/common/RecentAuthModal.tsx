import React, { useState, useEffect, useRef } from 'react'
import { ShieldCheck, AlertCircle, Lock, Key } from 'lucide-react'
import { api } from '../../services/apiClient'

interface Props {
  isOpen:    boolean
  onSuccess: () => void
  onCancel:  () => void
  title?:    string
  message?:  string
}

export default function RecentAuthModal({
  isOpen,
  onSuccess,
  onCancel,
  title = 'Re-authentication Required',
  message = 'This sensitive action requires you to confirm your credentials within the last 5 minutes.',
}: Props) {
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [useTotp, setUseTotp] = useState(false)

  const passwordInputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setPassword('')
      setTotpCode('')
      setError('')
      setLoading(false)
      setTimeout(() => passwordInputRef.current?.focus(), 50)
    }
  }, [isOpen])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await api.post('/auth/reauthenticate', {
        password: password || undefined,
        totpCode: totpCode || undefined,
      })
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed. Please check your password or code.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(2px)',
        }}
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recent-auth-title"
        aria-describedby="recent-auth-desc"
        onKeyDown={handleKeyDown}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <div
          ref={dialogRef}
          style={{
            backgroundColor: 'var(--color-ivory)',
            border: '1px solid var(--color-sage)',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '440px',
            width: '100%',
            boxShadow: 'var(--elevation-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#2563EB',
            }}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2
                id="recent-auth-title"
                style={{
                  fontSize: '18px', fontWeight: 600, color: 'var(--color-charcoal)', margin: 0,
                }}
              >
                {title}
              </h2>
            </div>
          </div>

          <p
            id="recent-auth-desc"
            style={{
              fontSize: '14px', lineHeight: 1.5,
              color: 'var(--color-text-secondary)', margin: '0 0 1.25rem 0',
            }}
          >
            {message}
          </p>

          {error && (
            <div role="alert" style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.6rem 0.8rem', borderRadius: '6px',
              backgroundColor: '#FEF2F2', color: '#991B1B', fontSize: '13px',
              marginBottom: '1rem',
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {!useTotp ? (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-charcoal)', marginBottom: '0.35rem' }}>
                  Enter your password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    ref={passwordInputRef}
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Your password"
                    required
                    style={{
                      width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px',
                      border: '1px solid var(--color-sage)', fontSize: '14px',
                    }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-charcoal)', marginBottom: '0.35rem' }}>
                  Enter 6-digit Authenticator Code
                </label>
                <input
                  ref={passwordInputRef}
                  type="text"
                  maxLength={6}
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  required
                  style={{
                    width: '100%', textAlign: 'center', letterSpacing: '4px',
                    fontSize: '18px', fontWeight: 600, padding: '0.6rem',
                    borderRadius: '6px', border: '1px solid var(--color-sage)',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <button
                type="button"
                onClick={() => setUseTotp(!useTotp)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-forest)', fontSize: '12px', padding: 0 }}
              >
                {useTotp ? 'Use Password instead' : 'Use Authenticator Code instead'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onCancel}
                className="btn-secondary"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={loading || (!password && !totpCode)}
              >
                {loading ? 'Verifying...' : 'Confirm'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
