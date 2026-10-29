import { useMemo, useState } from 'react'
import { Plus, Search, Key, Copy, Check, ShieldAlert } from 'lucide-react'
import UserTable from '../components/users/UserTable'
import EntityFormModal, { type FieldDef, type FormValues } from '../components/master/EntityFormModal'
import DeleteConfirm from '../components/master/DeleteConfirm'
import RecentAuthModal from '../components/common/RecentAuthModal'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useSetUserActive } from '../hooks/useUsers'
import { useMasterData } from '../hooks/useMasterData'
import { ROLES, ROLE_LABELS, type Role } from '../config/permissions'
import type { ManagedUser } from '../data/userData'
import { api } from '../services/apiClient'

const ROLE_OPTIONS = ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] }))

export default function UserManagement() {
  const { data: users = [], isLoading, isError, refetch } = useUsers()
  const { data: master } = useMasterData()

  const create = useCreateUser()
  const update = useUpdateUser()
  const remove = useDeleteUser()
  const setActive = useSetUserActive()

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | ''>('')
  const [deptFilter, setDeptFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const [editing, setEditing] = useState<ManagedUser | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ManagedUser | null>(null)
  const [error, setError] = useState('')
  const [banner, setBanner] = useState('')
  const [successBanner, setSuccessBanner] = useState('')

  // Temporary password modal state
  const [tempPassModal, setTempPassModal] = useState<{ name: string; email: string; password: string } | null>(null)
  const [copiedPass, setCopiedPass] = useState(false)

  // Recent re-authentication state
  const [recentAuthOpen, setRecentAuthOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null)

  const departmentOptions = useMemo(
    () => (master?.departments ?? []).map(d => ({ value: d.name, label: d.name })),
    [master],
  )

  const filtered = useMemo(() => users.filter(u => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.employeeId.toLowerCase().includes(q)
    const matchesRole = !roleFilter || u.role === roleFilter
    const matchesDept = !deptFilter || u.department === deptFilter
    const matchesActive = activeFilter === 'all' ||
      (activeFilter === 'active' ? u.active : !u.active)
    return matchesSearch && matchesRole && matchesDept && matchesActive
  }), [users, search, roleFilter, deptFilter, activeFilter])

  const fields: FieldDef[] = [
    { key: 'name',       label: 'Full name',   type: 'text', required: true },
    { key: 'email',      label: 'Email',       type: 'text', required: true },
    { key: 'employeeId', label: 'Employee ID', type: 'text' },
    { key: 'department', label: 'Department',  type: 'select', required: true, options: departmentOptions },
    { key: 'role',       label: 'Role',        type: 'select', required: true, options: ROLE_OPTIONS },
    { key: 'active',     label: 'Active',      type: 'toggle' },
  ]

  async function executeWithRecentAuth(action: () => Promise<void>) {
    try {
      await action()
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e?.code === 'recent_auth_required' || e?.message?.includes('recent authentication')) {
        setPendingAction(() => action)
        setRecentAuthOpen(true)
      } else {
        setBanner(e?.message || 'Action failed.')
      }
    }
  }

  function handleSubmit(values: FormValues) {
    setError('')
    const base = {
      name:       String(values.name ?? ''),
      email:      String(values.email ?? ''),
      employeeId: String(values.employeeId ?? ''),
      department: String(values.department ?? ''),
      role:       String(values.role ?? 'requester') as Role,
      active:     !!values.active,
    }
    if (editing === 'new') {
      create.mutate(base, {
        onSuccess: (data: any) => {
          setEditing(null)
          if (data?.temporaryPassword) {
            setTempPassModal({
              name: base.name,
              email: base.email,
              password: data.temporaryPassword,
            })
          }
        },
        onError: e => {
          const errObj = e as { code?: string; message?: string }
          if (errObj?.code === 'recent_auth_required') {
            setPendingAction(() => async () => handleSubmit(values))
            setRecentAuthOpen(true)
          } else {
            setError(e instanceof Error ? e.message : 'Could not save.')
          }
        },
      })
    } else if (editing) {
      update.mutate({ ...base, id: editing.id }, {
        onSuccess: () => setEditing(null),
        onError: e => {
          const errObj = e as { code?: string; message?: string }
          if (errObj?.code === 'recent_auth_required') {
            setPendingAction(() => async () => handleSubmit(values))
            setRecentAuthOpen(true)
          } else {
            setError(e instanceof Error ? e.message : 'Could not save.')
          }
        },
      })
    }
  }

  function handleToggle(u: ManagedUser) {
    setBanner('')
    setSuccessBanner('')
    executeWithRecentAuth(async () => {
      setActive.mutate({ id: u.id, active: !u.active }, {
        onSuccess: () => setSuccessBanner(`Account ${u.active ? 'deactivated' : 'activated'}.`),
        onError: e => setBanner(e instanceof Error ? e.message : 'Could not change status.'),
      })
    })
  }

  function handleDelete() {
    if (!deleting) return
    setError('')
    remove.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
      onError: e => setError(e instanceof Error ? e.message : 'Could not delete.'),
    })
  }

  function handleResetPassword(u: ManagedUser) {
    setBanner('')
    setSuccessBanner('')
    executeWithRecentAuth(async () => {
      const res = await api.post<{ temporaryPassword: string; message: string }>(`/users/${u.id}/reset-password`)
      setTempPassModal({
        name: u.name,
        email: u.email,
        password: res.temporaryPassword,
      })
    })
  }

  function handleUnlock(u: ManagedUser) {
    setBanner('')
    setSuccessBanner('')
    executeWithRecentAuth(async () => {
      const res = await api.post<{ message: string }>(`/users/${u.id}/unlock`)
      setSuccessBanner(res.message || 'Account unlocked.')
      refetch()
    })
  }

  function handleResetMfa(u: ManagedUser) {
    setBanner('')
    setSuccessBanner('')
    executeWithRecentAuth(async () => {
      const res = await api.post<{ message: string }>(`/users/${u.id}/reset-mfa`)
      setSuccessBanner(res.message || 'User MFA reset.')
      refetch()
    })
  }

  function copyTempPassword() {
    if (tempPassModal) {
      navigator.clipboard.writeText(tempPassModal.password)
      setCopiedPass(true)
      setTimeout(() => setCopiedPass(false), 2000)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h1 className="page-title">User management</h1>
          <p className="page-subtitle">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setError(''); setEditing('new') }} className="btn-primary" style={{ fontSize: '13px' }}>
          <Plus size={14} aria-hidden="true" /> Add user
        </button>
      </div>

      {banner && (
        <div role="alert" style={{ padding: '10px 14px', backgroundColor: '#fce8e6',
          border: '1px solid #f5c6c4', borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#7d1c18', marginBottom: '1rem' }}>
          {banner}
        </div>
      )}

      {successBanner && (
        <div role="status" style={{ padding: '10px 14px', backgroundColor: '#ECFDF5',
          border: '1px solid #A7F3D0', borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#065F46', marginBottom: '1rem' }}>
          {successBanner}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: '0.75rem', top: '50%',
            transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email or employee ID" className="input"
            style={{ paddingLeft: '2.25rem', fontSize: '13px' }} />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as Role | '')} className="input"
          style={{ width: 'auto', fontSize: '13px' }} aria-label="Filter by role">
          <option value="">All roles</option>
          {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="input"
          style={{ width: 'auto', fontSize: '13px' }} aria-label="Filter by department">
          <option value="">All departments</option>
          {departmentOptions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <select value={activeFilter} onChange={e => setActiveFilter(e.target.value as any)} className="input"
          style={{ width: 'auto', fontSize: '13px' }} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>

      {isLoading && <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Loading users...</p>}
      {isError && <p style={{ fontSize: '14px', color: 'var(--color-danger)' }}>Could not load users.</p>}

      {!isLoading && !isError && (
        <UserTable
          rows={filtered}
          onEdit={u => { setError(''); setEditing(u) }}
          onToggle={handleToggle}
          onDelete={u => { setError(''); setDeleting(u) }}
          onResetPassword={handleResetPassword}
          onUnlock={handleUnlock}
          onResetMfa={handleResetMfa}
        />
      )}

      {editing && (
        <EntityFormModal
          title={editing === 'new' ? 'New user' : `Edit ${editing.name}`}
          fields={fields}
          initial={editing === 'new' ? { active: true, role: 'requester' } : (editing as unknown as FormValues)}
          submitting={create.isPending || update.isPending}
          onSubmit={handleSubmit}
          onClose={() => { setError(''); setEditing(null) }}
          errorBanner={error}
        />
      )}

      {deleting && (
        <DeleteConfirm
          label={deleting.name}
          submitting={remove.isPending}
          onConfirm={handleDelete}
          onClose={() => { setError(''); setDeleting(null) }}
          errorBanner={error}
        />
      )}

      {/* Temporary Password Notification Modal */}
      {tempPassModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
        >
          <div style={{ backgroundColor: 'var(--color-ivory)', border: '1px solid var(--color-sage)', borderRadius: '12px', padding: '2rem', maxWidth: '440px', width: '100%', boxShadow: 'var(--elevation-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D97706' }}>
                <Key size={20} />
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-charcoal)', margin: 0 }}>
                Temporary Credentials
              </h2>
            </div>

            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '0 0 1.25rem 0' }}>
              A temporary password has been generated for <strong>{tempPassModal.name}</strong> ({tempPassModal.email}).
              It is valid for 24 hours. The user will be required to change it immediately upon signing in.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F3F4F6', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--color-sage)', marginBottom: '1.5rem' }}>
              <code style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 600, color: 'var(--color-charcoal)' }}>
                {tempPassModal.password}
              </code>
              <button
                type="button"
                onClick={copyTempPassword}
                className="btn-secondary"
                style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.65rem' }}
              >
                {copiedPass ? <Check size={14} color="#059669" /> : <Copy size={14} />}
                {copiedPass ? 'Copied' : 'Copy'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setTempPassModal(null)}
              className="btn-primary"
              style={{ width: '100%' }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Re-authentication Modal for sensitive actions */}
      <RecentAuthModal
        isOpen={recentAuthOpen}
        onCancel={() => {
          setRecentAuthOpen(false)
          setPendingAction(null)
        }}
        onSuccess={async () => {
          setRecentAuthOpen(false)
          if (pendingAction) {
            const act = pendingAction
            setPendingAction(null)
            await act()
          }
        }}
      />
    </div>
  )
}
