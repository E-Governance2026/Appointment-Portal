import { useState } from 'react'
import { Search, CheckCircle2, AlertCircle } from 'lucide-react'
import {
  DEPARTMENTS,
  AUTHORITIES,
  type AppointmentFormData,
} from '../../types/appointment'

interface Step2Props {
  data: AppointmentFormData
  onChange: (updates: Partial<AppointmentFormData>) => void
}

export default function Step2Authority({ data, onChange }: Step2Props) {
  const [search, setSearch] = useState('')

  // Filter authorities by selected department + search query
  const filtered = AUTHORITIES.filter(a => {
    const matchesDept   = !data.department || a.department === data.department
    const matchesSearch =
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.designation.toLowerCase().includes(search.toLowerCase())
    return matchesDept && matchesSearch
  })

  return (
    <div>
      <h2 className="font-bold text-base mb-1" style={{ color: 'var(--color-text)' }}>
        Select Authority
      </h2>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-muted)' }}>
        Choose the department and the person you want to meet.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        {/* Department dropdown */}
        <div>
          <label className="input-label">Department *</label>
          <select
            className="input"
            value={data.department}
            onChange={e => {
              const dept = DEPARTMENTS.find(d => d.id === e.target.value)
              onChange({
                department:      e.target.value,
                departmentLabel: dept?.label ?? '',
                authorityId:     '',
                authorityName:   '',
                authorityDesignation: '',
              })
            }}
          >
            <option value="">— Select Department —</option>
            {DEPARTMENTS.map(d => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {/* Authority search */}
        <div>
          <label className="input-label">Search Authority</label>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--color-text-muted)' }}
            />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or designation..."
              className="input pl-8"
            />
          </div>
        </div>
      </div>

      {/* Authority cards */}
      {filtered.length === 0 ? (
        <div
          className="text-center py-10 rounded-xl"
          style={{ backgroundColor: 'var(--color-bg)', border: '1px dashed var(--color-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No authorities found. Try a different department or search term.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map(auth => {
            const isSelected = data.authorityId === auth.id

            return (
              <button
                key={auth.id}
                type="button"
                disabled={!auth.available}
                onClick={() => {
                  if (auth.available)
                    onChange({
                      authorityId:          auth.id,
                      authorityName:        auth.name,
                      authorityDesignation: auth.designation,
                      department:           auth.department,
                      departmentLabel:
                        DEPARTMENTS.find(d => d.id === auth.department)?.label ?? '',
                    })
                }}
                className="flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all duration-150"
                style={{
                  backgroundColor: isSelected
                    ? 'rgba(7,59,53,0.06)'
                    : !auth.available
                    ? 'rgba(229,233,229,0.4)'
                    : 'var(--color-surface)',
                  borderColor: isSelected
                    ? 'var(--color-primary)'
                    : 'var(--color-border)',
                  opacity: !auth.available ? 0.65 : 1,
                  cursor: !auth.available ? 'not-allowed' : 'pointer',
                  boxShadow: isSelected ? '0 0 0 3px rgba(7,59,53,0.1)' : 'none',
                }}
              >
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{
                    backgroundColor: isSelected
                      ? 'var(--color-primary)'
                      : 'var(--color-secondary)',
                  }}
                >
                  {auth.avatar}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-semibold truncate"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {auth.name}
                  </p>
                  <p
                    className="text-xs truncate"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {auth.designation}
                  </p>
                  <div className="mt-1 flex items-center gap-1">
                    {auth.available ? (
                      <>
                        <CheckCircle2 size={10} style={{ color: '#16a34a' }} />
                        <span style={{ fontSize: '0.62rem', color: '#16a34a', fontWeight: 600 }}>
                          Available
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={10} style={{ color: '#dc2626' }} />
                        <span style={{ fontSize: '0.62rem', color: '#dc2626', fontWeight: 600 }}>
                          Unavailable
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Selected checkmark */}
                {isSelected && (
                  <CheckCircle2
                    size={18}
                    style={{ color: 'var(--color-primary)', flexShrink: 0 }}
                  />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
