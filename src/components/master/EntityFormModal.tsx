import { useState } from 'react'
import { Loader2 } from 'lucide-react'

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'toggle'

export interface FieldDef {
  key:       string
  label:     string
  type:      FieldType
  required?: boolean
  options?:  { value: string; label: string }[]   // for select / multiselect
  min?:      number                                 // for number
}

// Values keyed by field key. Strings for text/select, number for number,
// string[] for multiselect, boolean for toggle.
export type FormValues = Record<string, string | number | boolean | string[]>

interface EntityFormModalProps {
  title:      string
  fields:     FieldDef[]
  initial:    FormValues
  submitting: boolean
  errorBanner?: string
  onSubmit:   (values: FormValues) => void
  onClose:    () => void
}

// ─── EntityFormModal ──────────────────────────────────────────────────────────
export default function EntityFormModal({
  title, fields, initial, submitting, errorBanner, onSubmit, onClose,
}: EntityFormModalProps) {
  const [values, setValues] = useState<FormValues>(initial)
  const [touched, setTouched] = useState(false)

  function set(key: string, value: FormValues[string]) {
    setValues(v => ({ ...v, [key]: value }))
  }

  function missingRequired(): boolean {
    return fields.some(f => {
      if (!f.required) return false
      const v = values[f.key]
      if (f.type === 'multiselect') return !Array.isArray(v) || v.length === 0
      if (f.type === 'number') return v === '' || v === null || v === undefined
      return typeof v === 'string' ? v.trim() === '' : v === undefined || v === null
    })
  }

  function handleSubmit() {
    setTouched(true)
    if (missingRequired()) return
    onSubmit(values)
  }

  const invalid = touched && missingRequired()

  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="entity-modal-title"
      style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '1rem',
        backgroundColor: 'rgba(23,37,34,0.45)' }}
      onClick={() => !submitting && onClose()}
    >
      <div className="card" style={{ maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <h3 id="entity-modal-title" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600,
          fontSize: '18px', color: 'var(--color-charcoal)', margin: '0 0 1rem 0' }}>
          {title}
        </h3>

        {errorBanner && (
          <div role="alert" style={{ padding: '10px 14px', backgroundColor: '#fce8e6',
            border: '1px solid #f5c6c4', borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#7d1c18', marginBottom: '1rem' }}>
            {errorBanner}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {fields.map(f => {
            const id = `fld-${f.key}`
            const v = values[f.key]
            const showError = touched && f.required && (
              f.type === 'multiselect'
                ? !Array.isArray(v) || v.length === 0
                : f.type === 'number'
                  ? v === '' || v === undefined || v === null
                  : typeof v === 'string' ? v.trim() === '' : !v
            )
            return (
              <div key={f.key}>
                {f.type !== 'toggle' && (
                  <label htmlFor={id} style={label}>
                    {f.label}{f.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
                  </label>
                )}

                {f.type === 'text' && (
                  <input id={id} type="text" className="input" value={String(v ?? '')}
                    onChange={e => set(f.key, e.target.value)}
                    style={{ borderColor: showError ? 'var(--color-danger)' : undefined }} />
                )}
                {f.type === 'number' && (
                  <input id={id} type="number" className="input" value={v === undefined ? '' : Number(v)}
                    min={f.min}
                    onChange={e => set(f.key, e.target.value === '' ? '' : Number(e.target.value))}
                    style={{ borderColor: showError ? 'var(--color-danger)' : undefined }} />
                )}
                {f.type === 'textarea' && (
                  <textarea id={id} className="input" rows={3} value={String(v ?? '')}
                    onChange={e => set(f.key, e.target.value)} style={{ resize: 'vertical', lineHeight: 1.5 }} />
                )}
                {f.type === 'select' && (
                  <select id={id} className="input" value={String(v ?? '')}
                    onChange={e => set(f.key, e.target.value)}
                    style={{ borderColor: showError ? 'var(--color-danger)' : undefined }}>
                    <option value="">Select...</option>
                    {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
                {f.type === 'multiselect' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '4px 0' }}>
                    {f.options?.map(o => {
                      const arr = Array.isArray(v) ? v : []
                      const checked = arr.includes(o.value)
                      return (
                        <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: '6px',
                          fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-charcoal)',
                          border: '1px solid var(--color-sage)', borderRadius: 'var(--radius-md)', padding: '4px 8px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={checked}
                            style={{ accentColor: 'var(--color-forest)' }}
                            onChange={e => {
                              const next = e.target.checked ? [...arr, o.value] : arr.filter(x => x !== o.value)
                              set(f.key, next)
                            }} />
                          {o.label}
                        </label>
                      )
                    })}
                  </div>
                )}
                {f.type === 'toggle' && (
                  <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input id={id} type="checkbox" checked={!!v}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--color-forest)' }}
                      onChange={e => set(f.key, e.target.checked)} />
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-charcoal)' }}>
                      {f.label}
                    </span>
                  </label>
                )}

                {showError && (
                  <p role="alert" style={{ fontFamily: 'var(--font-sans)', fontSize: '13px',
                    color: 'var(--color-danger)', margin: '0.3rem 0 0 0' }}>
                    {f.label} is required.
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {invalid && (
          <p role="alert" style={{ fontFamily: 'var(--font-sans)', fontSize: '13px',
            color: 'var(--color-danger)', margin: '0.75rem 0 0 0' }}>
            Fill in the required fields.
          </p>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting} style={{ fontSize: '14px' }}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSubmit} disabled={submitting}
            style={{ fontSize: '14px', minWidth: '110px', justifyContent: 'center', opacity: submitting ? 0.7 : 1 }}>
            {submitting && <Loader2 size={15} className="spin" aria-hidden="true" />}
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>

        <style>{`
          .spin { animation: em-spin 0.8s linear infinite; }
          @keyframes em-spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  )
}

const label: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: '14px',
  color: 'var(--color-charcoal)', marginBottom: '0.3rem',
}
