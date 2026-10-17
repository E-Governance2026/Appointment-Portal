import { useNavigate } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'

// ─── AccessDenied ─────────────────────────────────────────────────────────────
// Shown when a role is not permitted to perform an action (e.g. reception
// attempting to access the booking flow).

export default function AccessDenied() {
  const navigate = useNavigate()

  return (
    <div
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        minHeight:      '60vh',
        padding:        '2rem',
        textAlign:      'center',
        gap:            '1rem',
      }}
    >
      <div
        style={{
          width:           '56px',
          height:          '56px',
          borderRadius:    '12px',
          backgroundColor: '#fce8e6',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
        }}
      >
        <ShieldOff size={26} style={{ color: 'var(--color-danger)' }} aria-hidden="true" />
      </div>

      <h1
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 600,
          fontSize:   '22px',
          color:      'var(--color-charcoal)',
          margin:     0,
        }}
      >
        Access denied
      </h1>

      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize:   '15px',
          color:      'var(--color-text-secondary)',
          maxWidth:   '420px',
          margin:     0,
          lineHeight: 1.6,
        }}
      >
        Your role does not have permission to book appointments. Contact your
        coordinator or an administrator if you believe this is an error.
      </p>

      <button
        onClick={() => navigate('/dashboard')}
        className="btn-secondary"
        style={{ marginTop: '0.5rem' }}
      >
        Back to dashboard
      </button>
    </div>
  )
}
