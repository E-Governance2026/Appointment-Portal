import { useState } from 'react'
import { UserCircle, SlidersHorizontal } from 'lucide-react'
import ProfileCard from '../components/settings/ProfileCard'
import PreferencesForm from '../components/settings/PreferencesForm'

type TabKey = 'profile' | 'preferences'

export default function Settings() {
  const [tab, setTab] = useState<TabKey>('profile')

  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'profile',     label: 'Profile',     icon: <UserCircle size={15} aria-hidden="true" /> },
    { key: 'preferences', label: 'Preferences', icon: <SlidersHorizontal size={15} aria-hidden="true" /> },
  ]

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Your profile and app preferences.</p>

      <div role="tablist" aria-label="Settings" style={{ display: 'flex', gap: '8px',
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
            </button>
          )
        })}
      </div>

      {tab === 'profile' ? <ProfileCard /> : <PreferencesForm />}
    </div>
  )
}
