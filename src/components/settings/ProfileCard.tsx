import { useAuthStore } from '../../store/authStore'
import { ROLE_LABELS } from '../../config/permissions'

function initialsOf(name: string): string {
  return name.split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px',
      padding: '10px 0', borderBottom: '1px solid var(--color-sage)' }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-charcoal)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

// ─── ProfileCard ──────────────────────────────────────────────────────────────
export default function ProfileCard() {
  const user = useAuthStore(s => s.user)

  if (!user) {
    return (
      <div className="card" style={{ padding: '1.5rem' }}>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0 }}>
          You are not signed in.
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: '1.5rem', maxWidth: '560px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '1.25rem' }}>
        <div aria-hidden="true" style={{ width: '56px', height: '56px', borderRadius: '50%',
          backgroundColor: 'var(--color-forest)', color: 'var(--color-ivory)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '20px', flexShrink: 0 }}>
          {initialsOf(user.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '18px',
            color: 'var(--color-charcoal)', margin: 0 }}>
            {user.name}
          </p>
          <span style={{ display: 'inline-flex', alignItems: 'center', marginTop: '4px',
            backgroundColor: 'var(--color-sage)', color: 'var(--color-charcoal)',
            fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600,
            lineHeight: '18px', padding: '2px 8px', borderRadius: '6px' }}>
            {ROLE_LABELS[user.role]}
          </span>
        </div>
      </div>

      {/* Identity details (managed by an administrator) */}
      <Row label="Employee ID" value={user.employeeId} />
      <Row label="Department"  value={user.department} />
      <Row label="Account ID"  value={user.id} />

      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-secondary)',
        margin: '1rem 0 0 0', lineHeight: 1.5 }}>
        Your name, role and department are managed by an administrator. Contact the MIS office to request a change.
      </p>
    </div>
  )
}
