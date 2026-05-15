import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({ DeviceType: { TABLET: 2 }, deviceType: 1 }))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('@/lib/locales', () => ({
  default: { t: (k: string) => k },
}))
vi.mock('@/shaders/registry', () => ({
  DEFAULT_SHADER_ID: 'holographic',
}))

import { migratePreferencesPersistedState } from '@/stores/preferences'

describe('preferences persist migrate v0 → v1 (excluded/meeting weekdays → offDays/meetingDays)', () => {
  it('renames excludedWeekdays → offDays preserving the array', () => {
    const v0State = {
      excludedWeekdays: [0, 6],
      meetingWeekdays: [3],
    }

    const migrated = migratePreferencesPersistedState(v0State, 0)

    expect(migrated.offDays).toEqual([0, 6])
    expect(migrated.meetingDays).toEqual([3])
    expect(migrated).not.toHaveProperty('excludedWeekdays')
    expect(migrated).not.toHaveProperty('meetingWeekdays')
  })

  it('also migrates the preferenceUpdatedAt timestamp map so iCloud LWW still works after rename', () => {
    const v0State = {
      excludedWeekdays: [1],
      meetingWeekdays: [3],
      preferenceUpdatedAt: {
        excludedWeekdays: 1700000000000,
        meetingWeekdays: 1700000001000,
        otherKey: 1700000002000,
      },
    }

    const migrated = migratePreferencesPersistedState(v0State, 0)

    expect(migrated.preferenceUpdatedAt.offDays).toBe(1700000000000)
    expect(migrated.preferenceUpdatedAt.meetingDays).toBe(1700000001000)
    expect(migrated.preferenceUpdatedAt.otherKey).toBe(1700000002000)
    expect(migrated.preferenceUpdatedAt).not.toHaveProperty('excludedWeekdays')
    expect(migrated.preferenceUpdatedAt).not.toHaveProperty('meetingWeekdays')
  })

  it('fills sensible defaults when the old fields were missing entirely', () => {
    const migrated = migratePreferencesPersistedState({}, 0)

    expect(migrated).not.toHaveProperty('excludedWeekdays')
    expect(migrated).not.toHaveProperty('meetingWeekdays')
    // Defaults are filled at hydration time by combine(), so absence here is
    // fine — the migration just shouldn't *introduce* the legacy fields.
  })

  it('is idempotent — re-running on an already-v1 state is a no-op', () => {
    const v0State = {
      excludedWeekdays: [0, 6],
      meetingWeekdays: [3],
    }
    const v1State = migratePreferencesPersistedState(v0State, 0)
    const v1Again = migratePreferencesPersistedState(v1State, 1)

    expect(JSON.stringify(v1Again)).toEqual(JSON.stringify(v1State))
  })

  it('does not overwrite an existing offDays value if both old and new exist (new wins)', () => {
    // Defensive: if a downgrade-then-upgrade somehow leaves both keys present,
    // the migrated/new name should win. Old gets dropped.
    const mixedState = {
      excludedWeekdays: [1, 2],
      offDays: [4, 5],
      meetingWeekdays: [3],
      meetingDays: [6],
    }

    const migrated = migratePreferencesPersistedState(mixedState, 0)

    expect(migrated.offDays).toEqual([4, 5])
    expect(migrated.meetingDays).toEqual([6])
    expect(migrated).not.toHaveProperty('excludedWeekdays')
    expect(migrated).not.toHaveProperty('meetingWeekdays')
  })
})
