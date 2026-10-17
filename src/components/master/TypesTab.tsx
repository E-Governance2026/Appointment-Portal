import { useState } from 'react'
import { Plus } from 'lucide-react'
import MasterTable, { type Column } from './MasterTable'
import EntityFormModal, { type FieldDef, type FormValues } from './EntityFormModal'
import DeleteConfirm from './DeleteConfirm'
import { useCreateType, useUpdateType, useDeleteType } from '../../hooks/useMasterData'
import type { MasterAppointmentType } from '../../data/masterData'

interface TypesTabProps {
  types: MasterAppointmentType[]
}

const FIELDS: FieldDef[] = [
  { key: 'name',        label: 'Name',        type: 'text',     required: true },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'defaultDurationMinutes', label: 'Default duration (minutes)', type: 'number', required: true, min: 5 },
  { key: 'active',      label: 'Active',      type: 'toggle' },
]

const COLUMNS: Column<MasterAppointmentType>[] = [
  { header: 'Name', render: t => t.name },
  { header: 'Description', render: t => (
    <span style={{ color: 'var(--color-text-secondary)', display: 'inline-block', maxWidth: '360px',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {t.description || '—'}
    </span>
  ) },
  { header: 'Duration', render: t => `${t.defaultDurationMinutes} min` },
]

export default function TypesTab({ types }: TypesTabProps) {
  const create = useCreateType()
  const update = useUpdateType()
  const remove = useDeleteType()

  const [editing, setEditing] = useState<MasterAppointmentType | 'new' | null>(null)
  const [deleting, setDeleting] = useState<MasterAppointmentType | null>(null)
  const [error, setError] = useState('')

  function handleSubmit(values: FormValues) {
    setError('')
    const base = {
      name: String(values.name ?? ''),
      description: String(values.description ?? ''),
      defaultDurationMinutes: Number(values.defaultDurationMinutes || 0),
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
          {types.length} appointment type{types.length !== 1 ? 's' : ''}
        </p>
        <button onClick={() => { setError(''); setEditing('new') }} className="btn-primary" style={{ fontSize: '13px' }}>
          <Plus size={14} aria-hidden="true" /> Add type
        </button>
      </div>

      <MasterTable
        rows={types}
        columns={COLUMNS}
        onEdit={t => { setError(''); setEditing(t) }}
        onDelete={t => { setError(''); setDeleting(t) }}
        emptyLabel="No appointment types yet."
      />

      {editing && (
        <EntityFormModal
          title={editing === 'new' ? 'Add appointment type' : 'Edit appointment type'}
          fields={FIELDS}
          initial={editing === 'new'
            ? { name: '', description: '', defaultDurationMinutes: 30, active: true }
            : { name: editing.name, description: editing.description, defaultDurationMinutes: editing.defaultDurationMinutes, active: editing.active }}
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
