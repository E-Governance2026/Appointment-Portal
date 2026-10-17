import { RotateCcw } from 'lucide-react'
import { usePreferencesStore, type Preferences } from '../../store/preferencesStore'
import { formatDate, formatTime } from '../../utils/format'

const SELECT_WIDTH = '220px'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 500,
        fontSize: '14px', color: 'var(--color-charcoal)', marginBottom: '0.3rem' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0',
      borderBottom: '1px solid var(--color-sage)', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: '16px', height: '16px', marginTop: '2px', accentColor: 'var(--color-forest)', flexShrink: 0 }} />
      <span>
        <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '14px',
          fontWeight: 500, color: 'var(--color-charcoal)' }}>{label}</span>
        <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '13px',
          color: 'var(--color-text-secondary)', marginTop: '2px' }}>{description}</span>
      </span>
    </label>
  )
}

// ─── PreferencesForm ──────────────────────────────────────────────────────────
export default function PreferencesForm() {
  const prefs = usePreferencesStore(s => s.preferences)
  const setPreference = usePreferencesStore(s => s.setPreference)
  const resetPreferences = usePreferencesStore(s => s.resetPreferences)

  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPreference(key, value)

  // Live preview of a sample date + time under the current settings.
  const sampleDate = '2026-03-09'
  const sampleTime = '14:30'

  return (
    <div className="card" style={{ padding: '1.5rem', maxWidth: '640px' }}>
      {/* Display */}
      <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '16px',
        color: 'var(--color-charcoal)', margin: '0 0 1rem 0' }}>
        Display
      </h2>

      <Field label="Date format">
        <select className="input" style={{ width: SELECT_WIDTH, fontSize: '14px' }}
          value={prefs.dateFormat} onChange={e => set('dateFormat', e.target.value as Preferences['dateFormat'])}>
          <option value="dd-mm-yyyy">Day/Month/Year</option>
          <option value="mm-dd-yyyy">Month/Day/Year</option>
          <option value="iso">ISO (Year-Month-Day)</option>
        </select>
      </Field>

      <Field label="Time format">
        <select className="input" style={{ width: SELECT_WIDTH, fontSize: '14px' }}
          value={prefs.timeFormat} onChange={e => set('timeFormat', e.target.value as Preferences['timeFormat'])}>
          <option value="12h">12-hour</option>
          <option value="24h">24-hour</option>
        </select>
      </Field>

      <Field label="Week starts on">
        <select className="input" style={{ width: SELECT_WIDTH, fontSize: '14px' }}
          value={prefs.weekStart} onChange={e => set('weekStart', e.target.value as Preferences['weekStart'])}>
          <option value="monday">Monday</option>
          <option value="sunday">Sunday</option>
        </select>
      </Field>

      <Field label="Density">
        <select className="input" style={{ width: SELECT_WIDTH, fontSize: '14px' }}
          value={prefs.density} onChange={e => set('density', e.target.value as Preferences['density'])}>
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </Field>

      {/* Live preview */}
      <div style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-sage)',
        borderRadius: 'var(--radius-md)', padding: '10px 14px', margin: '0.5rem 0 1.5rem 0' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          Preview:{' '}
        </span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 600, color: 'var(--color-charcoal)' }}>
          {formatDate(sampleDate, prefs.dateFormat)} at {formatTime(sampleTime, prefs.timeFormat)}
        </span>
      </div>

      {/* Notifications */}
      <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '16px',
        color: 'var(--color-charcoal)', margin: '0 0 0.5rem 0' }}>
        Notifications
      </h2>
      <Toggle label="Email notifications" description="Receive updates about your appointments by email."
        checked={prefs.notifyEmail} onChange={v => set('notifyEmail', v)} />
      <Toggle label="In-app notifications" description="Show notifications inside the portal."
        checked={prefs.notifyInApp} onChange={v => set('notifyInApp', v)} />
      <Toggle label="Status change alerts" description="Notify me when an appointment status changes."
        checked={prefs.notifyStatusChange} onChange={v => set('notifyStatusChange', v)} />
      <Toggle label="Appointment reminders" description="Remind me before a confirmed appointment."
        checked={prefs.notifyReminders} onChange={v => set('notifyReminders', v)} />

      {/* Reset */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
        <button onClick={resetPreferences} className="btn-secondary" style={{ fontSize: '13px' }}>
          <RotateCcw size={14} aria-hidden="true" /> Reset to defaults
        </button>
      </div>
    </div>
  )
}
