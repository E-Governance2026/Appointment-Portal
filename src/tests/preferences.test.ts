import { describe, it, expect, beforeEach } from 'vitest'
import { formatDate, formatTime } from '../utils/format'
import { usePreferencesStore, DEFAULT_PREFERENCES } from '../store/preferencesStore'

// ─── Format util (pure) ─────────────────────────────────────────────────────────
describe('format — formatDate', () => {
  it('formats day/month/year', () => {
    expect(formatDate('2026-03-09', 'dd-mm-yyyy')).toBe('09/03/2026')
  })
  it('formats month/day/year', () => {
    expect(formatDate('2026-03-09', 'mm-dd-yyyy')).toBe('03/09/2026')
  })
  it('formats ISO', () => {
    expect(formatDate('2026-03-09', 'iso')).toBe('2026-03-09')
  })
  it('returns the input unchanged when not a valid ISO date', () => {
    expect(formatDate('not-a-date', 'dd-mm-yyyy')).toBe('not-a-date')
  })
})

describe('format — formatTime', () => {
  it('formats 24-hour', () => {
    expect(formatTime('14:30', '24h')).toBe('14:30')
    expect(formatTime('9:05', '24h')).toBe('09:05')
  })
  it('formats 12-hour with AM/PM', () => {
    expect(formatTime('14:30', '12h')).toBe('2:30 PM')
    expect(formatTime('00:15', '12h')).toBe('12:15 AM')
    expect(formatTime('12:00', '12h')).toBe('12:00 PM')
    expect(formatTime('09:05', '12h')).toBe('9:05 AM')
  })
  it('returns the input unchanged when not a valid time', () => {
    expect(formatTime('99:99', '24h')).toBe('99:99')
    expect(formatTime('abc', '12h')).toBe('abc')
  })
})

// ─── Preferences store ──────────────────────────────────────────────────────────
describe('preferences store', () => {
  beforeEach(() => {
    usePreferencesStore.getState().resetPreferences()
  })

  it('starts from the documented defaults after reset', () => {
    const { preferences } = usePreferencesStore.getState()
    expect(preferences).toEqual(DEFAULT_PREFERENCES)
  })

  it('setPreference updates a single key', () => {
    usePreferencesStore.getState().setPreference('timeFormat', '24h')
    expect(usePreferencesStore.getState().preferences.timeFormat).toBe('24h')
    // other keys unchanged
    expect(usePreferencesStore.getState().preferences.dateFormat).toBe(DEFAULT_PREFERENCES.dateFormat)
  })

  it('toggles a notification preference', () => {
    usePreferencesStore.getState().setPreference('notifyEmail', false)
    expect(usePreferencesStore.getState().preferences.notifyEmail).toBe(false)
  })

  it('persists to localStorage', () => {
    usePreferencesStore.getState().setPreference('density', 'compact')
    const raw = localStorage.getItem('at_preferences')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).density).toBe('compact')
  })

  it('resetPreferences restores every default', () => {
    usePreferencesStore.getState().setPreference('weekStart', 'sunday')
    usePreferencesStore.getState().setPreference('dateFormat', 'iso')
    usePreferencesStore.getState().resetPreferences()
    expect(usePreferencesStore.getState().preferences).toEqual(DEFAULT_PREFERENCES)
  })
})
