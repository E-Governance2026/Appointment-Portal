import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import UserTable from '../components/users/UserTable'
import EntityFormModal, { type FieldDef, type FormValues } from '../components/master/EntityFormModal'
import DeleteConfirm from '../components/master/DeleteConfirm'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useSetUserActive } from '../hooks/useUsers'
import { useMasterData } from '../hooks/useMasterData'
import { ROLES, ROLE_LABELS, type Role } from '../config/permissions'
import type { ManagedUser } from '../data/userData'

const ROLE_OPTIONS = ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] }))

export default function UserManagement() {
  const { data: users = [], isLoading, isError } = useUsers()
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
        onSuccess: () => setEditing(null),
        onError: e => setError(e instanceof Error ? e.message : 'Could not save.'),
      })
    } else if (editing) {
      update.mutate({ ...base, id: editing.id }, {
        onSuccess: () => setEditing(null),
        onError: e => setError(e instanceof Error ? e.message : 'Could not save.'),
      })
    }
  }

  function handleToggle(u: ManagedUser) {
    setBanner('')
    setActive.mutate({ id: u.id, active: !u.active }, {
      onError: e => setBanner(e instanceof Error ? e.message : 'Could not change status.'),
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
        <select value={activeFilter} onChange={e => setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')} className="input"
          style={{ width: 'auto', fontSize: '13px' }} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {isLoading ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center',
          fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          Loading users...
        </div>
      ) : isError ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center',
          fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          Could not load users.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <UserTable
            rows={filtered}
            onEdit={u => { setError(''); setEditing(u) }}
            onToggle={handleToggle}
            onDelete={u => { setError(''); setDeleting(u) }}
          />
        </div>
      )}

      {editing && (
        <EntityFormModal
          title={editing === 'new' ? 'Add user' : 'Edit user'}
          fields={fields}
          initial={editing === 'new'
            ? { name: '', email: '', employeeId: '', department: '', role: 'requester', active: true }
            : { name: editing.name, email: editing.email, employeeId: editing.employeeId,
                department: editing.department, role: editing.role, active: editing.active }}
          submitting={create.isPending || update.isPending}
          errorBanner={error}
          onSubmit={handleSubmit}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <DeleteConfirm
          label={deleting.name}
          errorBanner={error}
          submitting={remove.isPending}
          onConfirm={handleDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
