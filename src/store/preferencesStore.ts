import { create } from 'zustand'

// ─── Preferences ──────────────────────────────────────────────────────────────
// Per-user display + notification preferences. Persisted to localStorage so they
// survive reloads. In the real system these would also sync to a `user_prefs`
// row, but they are purely client-side presentation settings.

export type DateFormat = 'dd-mm-yyyy' | 'mm-dd-yyyy' | 'iso'
export type TimeFormat = '12h' | '24h'
export type WeekStart  = 'monday' | 'sunday'
export type Density    = 'comfortable' | 'compact'

export interface Preferences {
  dateFormat:         DateFormat
  timeFormat:         TimeFormat
  weekStart:          WeekStart
  density:            Density
  notifyEmail:        boolean
  notifyInApp:        boolean
  notifyStatusChange: boolean
  notifyReminders:    boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  dateFormat:         'dd-mm-yyyy',
  timeFormat:         '12h',
  weekStart:          'monday',
  density:            'comfortable',
  notifyEmail:        true,
  notifyInApp:        true,
  notifyStatusChange: true,
  notifyReminders:    true,
}

const STORAGE_KEY = 'at_preferences'

function loadPersisted(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFERENCES }
    const parsed = JSON.parse(raw) as Partial<Preferences>
    // Merge over defaults so new keys are always present.
    return { ...DEFAULT_PREFERENCES, ...parsed }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

function persist(prefs: Preferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore storage errors (private mode, etc.) */
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────
interface PreferencesState {
  preferences: Preferences
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
  resetPreferences: () => void
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: loadPersisted(),

  setPreference: (key, value) => {
    const next = { ...get().preferences, [key]: value }
    persist(next)
    set({ preferences: next })
  },

  resetPreferences: () => {
    persist(DEFAULT_PREFERENCES)
    set({ preferences: { ...DEFAULT_PREFERENCES } })
  },
}))

// Convenience selector hook.
export const useCurrentPreferences = () => usePreferencesStore(s => s.preferences)
