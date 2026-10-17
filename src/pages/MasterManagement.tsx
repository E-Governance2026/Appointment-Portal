import { useState } from 'react'
import { Building2, Tags, UserCog } from 'lucide-react'
import DepartmentsTab from '../components/master/DepartmentsTab'
import TypesTab from '../components/master/TypesTab'
import AuthoritiesTab from '../components/master/AuthoritiesTab'
import { useMasterData } from '../hooks/useMasterData'

type TabKey = 'departments' | 'types' | 'authorities'

export default function MasterManagement() {
  const { data, isLoading, isError } = useMasterData()
  const [tab, setTab] = useState<TabKey>('departments')

  const counts = {
    departments: data?.departments.length ?? 0,
    types:       data?.types.length ?? 0,
    authorities: data?.authorities.length ?? 0,
  }

  const TABS: { key: TabKey; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'departments', label: 'Departments',      icon: <Building2 size={15} aria-hidden="true" />, count: counts.departments },
    { key: 'types',       label: 'Appointment types', icon: <Tags size={15} aria-hidden="true" />,      count: counts.types },
    { key: 'authorities', label: 'Authorities',       icon: <UserCog size={15} aria-hidden="true" />,   count: counts.authorities },
  ]

  return (
    <div>
      <h1 className="page-title">Master management</h1>
      <p className="page-subtitle">Manage departments, appointment types and authorities.</p>

      {/* Tabs */}
      <div role="tablist" aria-label="Master data" style={{ display: 'flex', gap: '8px',
        margin: '1.25rem 0', borderBottom: '1px solid var(--color-sage)', flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const active = tab === t.key
          return (
            <button key={t.key} role="tab" aria-selected={active} onClick={() => setTab(t.key)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                fontSize: '14px', fontWeight: active ? 600 : 500,
                color: active ? 'var(--color-forest)' : 'var(--color-text-secondary)',
                borderBottom: active ? '2px solid var(--color-forest)' : '2px solid transparent',
                marginBottom: '-1px' }}
              onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
              onBlur={e  => (e.currentTarget.style.outline = 'none')}>
              {t.icon} {t.label}
              <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', minWidth: '22px', height: '20px', padding: '0 6px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: active ? 'var(--color-forest)' : 'var(--color-sage)',
                color: active ? 'var(--color-ivory)' : 'var(--color-text-secondary)',
                fontSize: '12px', fontWeight: 700 }}>
                {t.count}
              </span>
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center',
          fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          Loading master data...
        </div>
      ) : isError || !data ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center',
          fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          Could not load master data.
        </div>
      ) : tab === 'departments' ? (
        <DepartmentsTab departments={data.departments} />
      ) : tab === 'types' ? (
        <TypesTab types={data.types} />
      ) : (
        <AuthoritiesTab authorities={data.authorities} departments={data.departments} types={data.types} />
      )}
    </div>
  )
}
