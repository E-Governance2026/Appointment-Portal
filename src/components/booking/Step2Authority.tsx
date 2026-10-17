import { useState, useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, CheckCircle2, Info } from 'lucide-react'
import { fetchAuthoritiesByType, fetchPurposes, getNextAvailable } from '../../data/bookingApi'
import { APPOINTMENT_TYPES } from '../../data/bookingSeeds'
import { useBookingStore } from '../../store/bookingStore'
import type { Authority } from '../../data/bookingApi'

// ─── Unique departments from a list of authorities ────────────────────────────
function uniqueDepts(authorities: Authority[]): string[] {
  return [...new Set(authorities.map(a => a.department))].sort()
}

// ─── Authority card ───────────────────────────────────────────────────────────
function AuthorityCard({
  authority,
  selected,
  nextAvailable,
  onSelect,
}: {
  authority:     Authority
  selected:      boolean
  nextAvailable: string
  onSelect:      () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        display:         'flex',
        alignItems:      'flex-start',
        gap:             '14px',
        padding:         '14px 16px',
        border:          `2px solid ${selected ? 'var(--color-forest)' : 'var(--color-sage)'}`,
        borderRadius:    '8px',
        backgroundColor: selected ? 'rgba(7,59,53,0.06)' : 'var(--color-ivory)',
        cursor:          'pointer',
        textAlign:       'left',
        width:           '100%',
        transition:      'border-color 0.12s ease',
      }}
      onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
      onBlur={e  => (e.currentTarget.style.outline = 'none')}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--color-emerald)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--color-sage)'    }}
    >
      {/* Initials avatar */}
      <div
        aria-hidden="true"
        style={{
          width:           '40px',
          height:          '40px',
          borderRadius:    '50%',
          backgroundColor: 'var(--color-sage)',
          color:           'var(--color-charcoal)',
          fontFamily:      'var(--font-sans)',
          fontWeight:      700,
          fontSize:        '14px',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          flexShrink:      0,
        }}
      >
        {authority.initials}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '15px', color: 'var(--color-charcoal)', margin: '0 0 2px 0' }}>
          {authority.name}
        </p>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 2px 0' }}>
          {authority.designation}
        </p>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 6px 0' }}>
          {authority.department}
        </p>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-forest)', fontWeight: 600, margin: 0 }}>
          Next available: {nextAvailable || '…'}
        </p>
      </div>

      {/* Check mark */}
      {selected && (
        <CheckCircle2
          size={20}
          style={{ color: 'var(--color-emerald)', flexShrink: 0, marginTop: '2px' }}
          aria-hidden="true"
        />
      )}
    </button>
  )
}

// ─── Skeleton card ────────────────────────────────────────────────────────────
function AuthSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {[0,1,2].map(i => (
        <div key={i} style={{ height: '88px', borderRadius: '8px', backgroundColor: 'var(--color-sage)', opacity: 0.5 }} aria-hidden="true" />
      ))}
    </div>
  )
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────
export default function Step2Authority() {
  const searchId = useId()
  const deptId   = useId()
  const [search, setSearch]   = useState('')
  const [deptFilter, setDept] = useState('')
  const [nextAvailMap, setNextAvailMap] = useState<Record<string, string>>({})

  const typeId      = useBookingStore(s => s.typeId)
  const authorityId = useBookingStore(s => s.authorityId)
  const errors      = useBookingStore(s => s.stepErrors[1])
  const setAuthority    = useBookingStore(s => s.setAuthority)
  const setAutoAssigned = useBookingStore(s => s.setAutoAssigned)

  // Resolve type config
  const typeConfig = APPOINTMENT_TYPES.find(t => t.id === typeId)
  const autoAssign = typeConfig?.autoAssign ?? false

  const { data: authorities = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['booking-authorities', typeId, deptFilter],
    queryFn:  async () => {
      const list = await fetchAuthoritiesByType(typeId, deptFilter || undefined)
      // Auto-select first when autoAssign
      if (autoAssign && list.length > 0) {
        setAuthority(list[0].id)
        setAutoAssigned(true)
      }
      // Fetch next-available for each
      const map: Record<string, string> = {}
      await Promise.all(list.map(async a => {
        map[a.id] = await getNextAvailable(a.id)
      }))
      setNextAvailMap(map)
      return list
    },
    enabled: !!typeId,
  })

  const departments = uniqueDepts(authorities)

  const filtered = authorities.filter(a => {
    const matchSearch = !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.designation.toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Auto-assign notice */}
      {autoAssign && (
        <div
          role="note"
          style={{
            display:         'flex',
            alignItems:      'flex-start',
            gap:             '10px',
            padding:         '12px 14px',
            backgroundColor: 'rgba(31,95,166,0.07)',
            border:          '1px solid rgba(31,95,166,0.2)',
            borderRadius:    '8px',
          }}
        >
          <Info size={16} style={{ color: 'var(--color-info)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-charcoal)', margin: 0, lineHeight: 1.5 }}>
            The department assigns the authority for this appointment type. No selection is needed.
          </p>
        </div>
      )}

      {/* Filters — hidden when auto-assign */}
      {!autoAssign && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          {/* Search */}
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <label htmlFor={searchId} className="input-label">Search authorities</label>
            <div style={{ position: 'relative' }}>
              <Search size={14} aria-hidden="true"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
              <input
                id={searchId}
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Name or designation..."
                className="input"
                style={{ paddingLeft: '36px' }}
              />
            </div>
          </div>

          {/* Department filter */}
          {departments.length > 1 && (
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <label htmlFor={deptId} className="input-label">Department</label>
              <select
                id={deptId}
                value={deptFilter}
                onChange={e => setDept(e.target.value)}
                className="input"
              >
                <option value="">All departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {errors.authorityId && !autoAssign && (
        <p role="alert" style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-danger)', margin: 0 }}>
          {errors.authorityId}
        </p>
      )}

      {/* Network error */}
      {isError && (
        <div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-danger)', marginBottom: '8px' }}>
            Could not load authorities.
          </p>
          <button type="button" className="btn-secondary" onClick={() => refetch()} style={{ fontSize: '13px' }}>
            Retry
          </button>
        </div>
      )}

      {/* List */}
      {!autoAssign && (
        <>
          {isLoading
            ? <AuthSkeleton />
            : filtered.length === 0
            ? (
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                No authorities found for this type.
              </p>
            )
            : (
              <div
                role="radiogroup"
                aria-label="Authority"
                aria-required="true"
                style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                {filtered.map(a => (
                  <AuthorityCard
                    key={a.id}
                    authority={a}
                    selected={authorityId === a.id}
                    nextAvailable={nextAvailMap[a.id] ?? ''}
                    onSelect={() => { setAuthority(a.id); setAutoAssigned(false) }}
                  />
                ))}
              </div>
            )
          }
        </>
      )}
    </div>
  )
}
