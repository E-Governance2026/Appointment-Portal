import { Pencil, Trash2, Power, KeyRound, Lock, ShieldAlert } from 'lucide-react'
import type { ManagedUser } from '../../data/userData'
import { ROLE_LABELS } from '../../config/permissions'

interface UserTableProps {
  rows:             ManagedUser[]
  onEdit:           (u: ManagedUser) => void
  onToggle:         (u: ManagedUser) => void
  onDelete:         (u: ManagedUser) => void
  onResetPassword?: (u: ManagedUser) => void
  onUnlock?:        (u: ManagedUser) => void
  onResetMfa?:      (u: ManagedUser) => void
}

function RoleChip({ role }: { role: ManagedUser['role'] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center',
      backgroundColor: 'var(--color-sage)', color: 'var(--color-charcoal)',
      fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600,
      lineHeight: '18px', padding: '2px 8px', borderRadius: '6px' }}>
      {ROLE_LABELS[role]}
    </span>
  )
}

function ActiveTag({ active }: { active: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px',
      backgroundColor: active ? '#DCEFE9' : '#E5E9E5',
      color: active ? '#0B5F4F' : '#4A5A55',
      fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600,
      lineHeight: '18px', padding: '2px 8px', borderRadius: '6px' }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

// ─── UserTable ────────────────────────────────────────────────────────────────
export default function UserTable({
  rows, onEdit, onToggle, onDelete,
  onResetPassword, onUnlock, onResetMfa,
}: UserTableProps) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: '2.5rem', textAlign: 'center', fontFamily: 'var(--font-sans)',
        fontSize: '14px', color: 'var(--color-text-secondary)' }}>
        No users match the current filters.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Email</th>
            <th style={th}>Employee ID</th>
            <th style={th}>Department</th>
            <th style={th}>Role</th>
            <th style={th}>Status</th>
            <th style={{ ...th, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u, idx) => (
            <tr key={u.id} style={{ borderTop: idx > 0 ? '1px solid var(--color-sage)' : 'none' }}>
              <td style={{ ...td, fontWeight: 600 }}>{u.name}</td>
              <td style={{ ...td, color: 'var(--color-text-secondary)' }}>{u.email}</td>
              <td style={{ ...td, color: 'var(--color-text-secondary)' }}>{u.employeeId || '—'}</td>
              <td style={td}>{u.department || '—'}</td>
              <td style={td}><RoleChip role={u.role} /></td>
              <td style={td}><ActiveTag active={u.active} /></td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button onClick={() => onEdit(u)} aria-label={`Edit ${u.name}`} className="btn-secondary"
                  title="Edit user" style={{ padding: '0.35rem', fontSize: '13px', marginRight: '6px' }}>
                  <Pencil size={14} aria-hidden="true" />
                </button>
                {onResetPassword && (
                  <button onClick={() => onResetPassword(u)} aria-label={`Reset password for ${u.name}`} className="btn-secondary"
                    title="Reset password" style={{ padding: '0.35rem', fontSize: '13px', marginRight: '6px', color: '#B45309' }}>
                    <KeyRound size={14} aria-hidden="true" />
                  </button>
                )}
                {onUnlock && (
                  <button onClick={() => onUnlock(u)} aria-label={`Unlock account for ${u.name}`} className="btn-secondary"
                    title="Unlock account" style={{ padding: '0.35rem', fontSize: '13px', marginRight: '6px', color: '#2563EB' }}>
                    <Lock size={14} aria-hidden="true" />
                  </button>
                )}
                {onResetMfa && (
                  <button onClick={() => onResetMfa(u)} aria-label={`Reset MFA for ${u.name}`} className="btn-secondary"
                    title="Reset two-factor authentication" style={{ padding: '0.35rem', fontSize: '13px', marginRight: '6px', color: '#7C3AED' }}>
                    <ShieldAlert size={14} aria-hidden="true" />
                  </button>
                )}
                <button onClick={() => onToggle(u)} aria-label={u.active ? `Deactivate ${u.name}` : `Activate ${u.name}`}
                  className="btn-secondary" title={u.active ? 'Deactivate user' : 'Activate user'} style={{ padding: '0.35rem', fontSize: '13px', marginRight: '6px',
                    color: u.active ? 'var(--color-text-secondary)' : 'var(--color-emerald)' }}>
                  <Power size={14} aria-hidden="true" />
                </button>
                <button onClick={() => onDelete(u)} aria-label={`Delete ${u.name}`} className="btn-secondary"
                  title="Delete user" style={{ padding: '0.35rem', fontSize: '13px', color: 'var(--color-danger)' }}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '12px 16px', fontFamily: 'var(--font-sans)',
  fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)',
  borderBottom: '1px solid var(--color-sage)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '12px 16px', verticalAlign: 'middle', fontFamily: 'var(--font-sans)',
  fontSize: '14px', color: 'var(--color-charcoal)', whiteSpace: 'nowrap',
}
