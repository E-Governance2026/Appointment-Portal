import { useState } from 'react'
import { Plus } from 'lucide-react'
import MasterTable, { type Column } from './MasterTable'
import EntityFormModal, { type FieldDef, type FormValues } from './EntityFormModal'
import DeleteConfirm from './DeleteConfirm'
import { useCreateDepartment, useUpdateDepartment, useDeleteDepartment } from '../../hooks/useMasterData'
import type { Department } from '../../data/masterData'

interface DepartmentsTabProps {
  departments: Department[]
}

const FIELDS: FieldDef[] = [
  { key: 'name',   label: 'Name',   type: 'text',   required: true },
  { key: 'code',   label: 'Code',   type: 'text',   required: true },
  { key: 'active', label: 'Active', type: 'toggle' },
]

const COLUMNS: Column<Department>[] = [
  { header: 'Name', render: d => d.name },
  { header: 'Code', render: d => d.code },
]

export default function DepartmentsTab({ departments }: DepartmentsTabProps) {
  const create = useCreateDepartment()
  const update = useUpdateDepartment()
  const remove = useDeleteDepartment()

  const [editing, setEditing] = useState<Department | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Department | null>(null)
  const [error, setError] = useState('')

  function openNew()  { setError(''); setEditing('new') }
  function openEdit(d: Department) { setError(''); setEditing(d) }

  function handleSubmit(values: FormValues) {
    setError('')
    const base = {
      name: String(values.name ?? ''),
      code: String(values.code ?? ''),
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
          {departments.length} department{departments.length !== 1 ? 's' : ''}
        </p>
        <button onClick={openNew} className="btn-primary" style={{ fontSize: '13px' }}>
          <Plus size={14} aria-hidden="true" /> Add department
        </button>
      </div>

      <MasterTable
        rows={departments}
        columns={COLUMNS}
        onEdit={openEdit}
        onDelete={d => { setError(''); setDeleting(d) }}
        emptyLabel="No departments yet."
      />

      {editing && (
        <EntityFormModal
          title={editing === 'new' ? 'Add department' : 'Edit department'}
          fields={FIELDS}
          initial={editing === 'new'
            ? { name: '', code: '', active: true }
            : { name: editing.name, code: editing.code, active: editing.active }}
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
