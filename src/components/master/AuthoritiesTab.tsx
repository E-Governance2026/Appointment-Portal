import { useState } from 'react'
import { Plus } from 'lucide-react'
import MasterTable, { type Column } from './MasterTable'
import EntityFormModal, { type FieldDef, type FormValues } from './EntityFormModal'
import DeleteConfirm from './DeleteConfirm'
import { useCreateAuthority, useUpdateAuthority, useDeleteAuthority } from '../../hooks/useMasterData'
import type { MasterAuthority, Department, MasterAppointmentType } from '../../data/masterData'

interface AuthoritiesTabProps {
  authorities: MasterAuthority[]
  departments: Department[]
  types:       MasterAppointmentType[]
}

const COLUMNS: Column<MasterAuthority>[] = [
  { header: 'Name', render: a => a.name },
  { header: 'Designation', render: a => (
    <span style={{ color: 'var(--color-text-secondary)' }}>{a.designation || '—'}</span>
  ) },
  { header: 'Department', render: a => a.department },
  { header: 'Types', render: a => (
    <span style={{ color: 'var(--color-text-secondary)' }}>{a.typeIds.length}</span>
  ) },
]

export default function AuthoritiesTab({ authorities, departments, types }: AuthoritiesTabProps) {
  const create = useCreateAuthority()
  const update = useUpdateAuthority()
  const remove = useDeleteAuthority()

  const [editing, setEditing] = useState<MasterAuthority | 'new' | null>(null)
  const [deleting, setDeleting] = useState<MasterAuthority | null>(null)
  const [error, setError] = useState('')

  const fields: FieldDef[] = [
    { key: 'name',        label: 'Name',        type: 'text',   required: true },
    { key: 'designation', label: 'Designation', type: 'text' },
    { key: 'department',  label: 'Department',  type: 'select', required: true,
      options: departments.map(d => ({ value: d.name, label: d.name })) },
    { key: 'typeIds',     label: 'Handles types', type: 'multiselect',
      options: types.map(t => ({ value: t.id, label: t.name })) },
    { key: 'active',      label: 'Active',      type: 'toggle' },
  ]

  function handleSubmit(values: FormValues) {
    setError('')
    const base = {
      name: String(values.name ?? ''),
      designation: String(values.designation ?? ''),
      department: String(values.department ?? ''),
      typeIds: Array.isArray(values.typeIds) ? values.typeIds : [],
      active: !!values.active,
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

  function handleDelete() {
    if (!deleting) return
    setError('')
    remove.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
      onError: e => setError(e instanceof Error ? e.message : 'Could not delete.'),
    })
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.875rem 1rem', borderBottom: '1px solid var(--color-sage)' }}>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 600, color: 'var(--color-charcoal)', margin: 0 }}>
          {authorities.length} authorit{authorities.length !== 1 ? 'ies' : 'y'}
        </p>
        <button onClick={() => { setError(''); setEditing('new') }} className="btn-primary" style={{ fontSize: '13px' }}>
          <Plus size={14} aria-hidden="true" /> Add authority
        </button>
      </div>

      <MasterTable
        rows={authorities}
        columns={COLUMNS}
        onEdit={a => { setError(''); setEditing(a) }}
        onDelete={a => { setError(''); setDeleting(a) }}
        emptyLabel="No authorities yet."
      />

      {editing && (
        <EntityFormModal
          title={editing === 'new' ? 'Add authority' : 'Edit authority'}
          fields={fields}
          initial={editing === 'new'
            ? { name: '', designation: '', department: '', typeIds: [], active: true }
            : { name: editing.name, designation: editing.designation, department: editing.department, typeIds: [...editing.typeIds], active: editing.active }}
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
