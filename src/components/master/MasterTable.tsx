import { Pencil, Trash2 } from 'lucide-react'

export interface Column<T> {
  header: string
  width?: string
  render: (row: T) => React.ReactNode
}

interface MasterTableProps<T extends { id: string; active: boolean }> {
  rows:    T[]
  columns: Column<T>[]
  onEdit:  (row: T) => void
  onDelete: (row: T) => void
  emptyLabel?: string
}

// Small active / inactive tag (not a status chip — distinct concept).
function ActiveTag({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      backgroundColor: active ? '#DCEFE9' : '#E5E9E5',
      color: active ? '#0B5F4F' : '#4A5A55',
      fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600,
      lineHeight: '18px', padding: '2px 8px', borderRadius: '6px',
    }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

// ─── MasterTable ──────────────────────────────────────────────────────────────
export default function MasterTable<T extends { id: string; active: boolean }>({
  rows, columns, onEdit, onDelete, emptyLabel = 'Nothing here yet.',
}: MasterTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: '2.5rem', textAlign: 'center', fontFamily: 'var(--font-sans)',
        fontSize: '14px', color: 'var(--color-text-secondary)' }}>
        {emptyLabel}
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.header} style={{ ...th, width: c.width }}>{c.header}</th>
            ))}
            <th style={{ ...th, width: '90px' }}>Status</th>
            <th style={{ ...th, width: '90px', textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id} style={{ borderTop: idx > 0 ? '1px solid var(--color-sage)' : 'none' }}>
              {columns.map(c => (
                <td key={c.header} style={td}>{c.render(row)}</td>
              ))}
              <td style={td}><ActiveTag active={row.active} /></td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button
                  onClick={() => onEdit(row)}
                  aria-label="Edit"
                  className="btn-secondary"
                  style={{ padding: '0.35rem', fontSize: '13px', marginRight: '6px' }}
                >
                  <Pencil size={14} aria-hidden="true" />
                </button>
                <button
                  onClick={() => onDelete(row)}
                  aria-label="Delete"
                  className="btn-secondary"
                  style={{ padding: '0.35rem', fontSize: '13px', color: 'var(--color-danger)' }}
                >
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
  fontSize: '14px', color: 'var(--color-charcoal)',
}
