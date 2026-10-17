import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle, AlertCircle, X } from 'lucide-react'

type ToastTone = 'success' | 'error' | 'info'
interface Toast { id: number; tone: ToastTone; message: string }

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

// ─── useToast ─────────────────────────────────────────────────────────────────
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) return { notify: () => { /* no provider mounted */ } }
  return ctx
}

const TONE: Record<ToastTone, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
  success: { bg: '#DCEFE9', border: '#bfe0d5', color: '#0B5F4F', icon: <CheckCircle size={16} aria-hidden="true" /> },
  error:   { bg: '#fce8e6', border: '#f5c6c4', color: '#7d1c18', icon: <AlertCircle size={16} aria-hidden="true" /> },
  info:    { bg: '#E3EEF8', border: '#c7ddf0', color: '#1F5FA6', icon: <AlertCircle size={16} aria-hidden="true" /> },
}

// ─── ToastProvider ────────────────────────────────────────────────────────────
// Wrap the app once; call useToast().notify(message, tone). Auto-dismisses
// after 4s. Region is aria-live polite.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++seq.current
    setToasts(t => [...t, { id, tone, message }])
    setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        aria-live="polite"
        style={{ position: 'fixed', right: 'var(--space-4)', bottom: 'var(--space-4)', zIndex: 500,
          display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxWidth: '360px' }}
      >
        {toasts.map(t => {
          const s = TONE[t.tone]
          return (
            <div key={t.id} role="status" style={{
              display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
              backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.color,
              borderRadius: 'var(--radius-md)', padding: '10px 12px',
              boxShadow: 'var(--elevation-2)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
            }}>
              <span style={{ flexShrink: 0, marginTop: '1px' }}>{s.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{t.message}</span>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss"
                style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: s.color, padding: 0 }}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
