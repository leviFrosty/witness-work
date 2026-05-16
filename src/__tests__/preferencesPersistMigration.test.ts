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

describe('preferences persist migrate v1 → v2 (publisher → role)', () => {
  it('renames publisher → role preserving the value', () => {
    const v1State = {
      publisher: 'regularPioneer',
      offDays: [0, 6],
    }

    const migrated = migratePreferencesPersistedState(v1State, 1)

    expect(migrated.role).toBe('regularPioneer')
    expect(migrated).not.toHaveProperty('publisher')
  })

  it('preserves the canonical leaf enum value `publisher` when stored under the publisher field', () => {
    // The field name renames, but the *value* `'publisher'` (= Regular
    // Publisher role) is canonical and unchanged.
    const v1State = {
      publisher: 'publisher',
    }

    const migrated = migratePreferencesPersistedState(v1State, 1)

    expect(migrated.role).toBe('publisher')
    expect(migrated).not.toHaveProperty('publisher')
  })

  it('also migrates the preferenceUpdatedAt timestamp map so iCloud LWW still works after rename', () => {
    const v1State = {
      publisher: 'circuitOverseer',
      preferenceUpdatedAt: {
        publisher: 1700000000000,
        otherKey: 1700000002000,
      },
    }

    const migrated = migratePreferencesPersistedState(v1State, 1)

    expect(migrated.preferenceUpdatedAt.role).toBe(1700000000000)
    expect(migrated.preferenceUpdatedAt.otherKey).toBe(1700000002000)
    expect(migrated.preferenceUpdatedAt).not.toHaveProperty('publisher')
  })

  it('is idempotent — re-running on an already-v2 state is a no-op', () => {
    const v1State = {
      publisher: 'specialPioneer',
      preferenceUpdatedAt: { publisher: 1700000000000 },
    }
    const v2State = migratePreferencesPersistedState(v1State, 1)
    const v2Again = migratePreferencesPersistedState(v2State, 2)

    expect(JSON.stringify(v2Again)).toEqual(JSON.stringify(v2State))
  })

  it('does not overwrite an existing role value if both publisher and role exist (new wins)', () => {
    // Defensive: if a downgrade-then-upgrade leaves both keys present, the
    // new field wins and the legacy key is dropped.
    const mixedState = {
      publisher: 'publisher',
      role: 'specialPioneer',
      preferenceUpdatedAt: {
        publisher: 1700000000000,
        role: 1700000001000,
      },
    }

    const migrated = migratePreferencesPersistedState(mixedState, 1)

    expect(migrated.role).toBe('specialPioneer')
    expect(migrated).not.toHaveProperty('publisher')
    expect(migrated.preferenceUpdatedAt.role).toBe(1700000001000)
    expect(migrated.preferenceUpdatedAt).not.toHaveProperty('publisher')
  })

  it('chains cleanly through v0 → v2 when called with version 0', () => {
    // A v0 blob being read on the v2 schema should get both renames applied.
    const v0State = {
      excludedWeekdays: [0, 6],
      meetingWeekdays: [3],
      publisher: 'regularPioneer',
    }

    const migrated = migratePreferencesPersistedState(v0State, 0)

    expect(migrated.offDays).toEqual([0, 6])
    expect(migrated.meetingDays).toEqual([3])
    expect(migrated.role).toBe('regularPioneer')
    expect(migrated).not.toHaveProperty('excludedWeekdays')
    expect(migrated).not.toHaveProperty('meetingWeekdays')
    expect(migrated).not.toHaveProperty('publisher')
  })

  it('fills sensible defaults when the publisher field was missing entirely', () => {
    const migrated = migratePreferencesPersistedState({}, 1)

    expect(migrated).not.toHaveProperty('publisher')
    // The `role` default is filled at hydration time by combine(), so absence
    // here is fine — the migration just shouldn't *introduce* the legacy field.
  })
})

describe('preferences persist migrate v2 → v3 (Profile extraction marker)', () => {
  // The v2 → v3 step is intentionally a no-op inside the persist `migrate`
  // callback — the actual split into the new Profile store runs in a boot
  // runner (`src/app/App.tsx`) so the legacy fields stay readable until that
  // runner has copied them. See the doc comment on
  // `migratePreferencesPersistedState`.
  it('passes the profile-shaped fields through unchanged so the boot runner can read them', () => {
    const v2State = {
      role: 'regularPioneer',
      name: 'Alice',
      avatar: { type: 'image', value: 'avatar://x' },
      customAvatarBackground: '#FFAABB',
      hasCompletedProfileSetup: true,
      monthlyGoalOverride: 50,
    }

    const migrated = migratePreferencesPersistedState(v2State, 2)

    expect(migrated.name).toBe('Alice')
    expect(migrated.avatar).toEqual({ type: 'image', value: 'avatar://x' })
    expect(migrated.customAvatarBackground).toBe('#FFAABB')
    expect(migrated.hasCompletedProfileSetup).toBe(true)
    expect(migrated.role).toBe('regularPioneer')
    expect(migrated.monthlyGoalOverride).toBe(50)
  })

  it('is idempotent — re-running on an already-v3 state is a no-op', () => {
    const v2State = {
      role: 'regularPioneer',
      name: 'Alice',
    }
    const v3State = migratePreferencesPersistedState(v2State, 2)
    const v3Again = migratePreferencesPersistedState(v3State, 3)

    expect(JSON.stringify(v3Again)).toEqual(JSON.stringify(v3State))
  })

  it('chains cleanly through v0 → v3 (renames still apply, profile fields pass through)', () => {
    const v0State = {
      excludedWeekdays: [0, 6],
      meetingWeekdays: [3],
      publisher: 'regularPioneer',
      name: 'Alice',
      avatar: { type: 'image', value: 'avatar://x' },
    }

    const migrated = migratePreferencesPersistedState(v0State, 0)

    expect(migrated.offDays).toEqual([0, 6])
    expect(migrated.meetingDays).toEqual([3])
    expect(migrated.role).toBe('regularPioneer')
    expect(migrated).not.toHaveProperty('publisher')
    // Profile fields survive — the boot runner is responsible for moving them.
    expect(migrated.name).toBe('Alice')
    expect(migrated.avatar).toEqual({ type: 'image', value: 'avatar://x' })
  })
})

describe('preferences persist migrate v3 → v4 (pioneerStartDate → tenureStartDate)', () => {
  it('renames pioneerStartDate → tenureStartDate, preserving the value when the role tracks tenure', () => {
    const v3State = {
      role: 'regularPioneer',
      pioneerStartDate: '2020-01-01T00:00:00.000Z',
    }

    const migrated = migratePreferencesPersistedState(v3State, 3)

    expect(migrated.tenureStartDate).toBe('2020-01-01T00:00:00.000Z')
    expect(migrated).not.toHaveProperty('pioneerStartDate')
  })

  it('keeps the value across all Full-Time Service roles', () => {
    for (const role of [
      'regularPioneer',
      'specialPioneer',
      'circuitOverseer',
    ] as const) {
      const migrated = migratePreferencesPersistedState(
        { role, pioneerStartDate: '2021-06-15T00:00:00.000Z' },
        3
      )
      expect(migrated.tenureStartDate).toBe('2021-06-15T00:00:00.000Z')
    }
  })

  it('keeps the value for regularAuxiliary (Auxiliary Pioneer tenure)', () => {
    const migrated = migratePreferencesPersistedState(
      {
        role: 'regularAuxiliary',
        pioneerStartDate: '2024-03-01T00:00:00.000Z',
      },
      3
    )
    expect(migrated.tenureStartDate).toBe('2024-03-01T00:00:00.000Z')
  })

  it('drops a stale start date when the current role has no Tenure Type (publisher)', () => {
    // Data inconsistency case: user set a pioneer date then switched to
    // regular publisher without clearing it. The new shape forbids holding
    // a tenure date for a role that doesn't track one.
    const v3State = {
      role: 'publisher',
      pioneerStartDate: '2020-01-01T00:00:00.000Z',
    }

    const migrated = migratePreferencesPersistedState(v3State, 3)

    expect(migrated.tenureStartDate).toBeNull()
    expect(migrated).not.toHaveProperty('pioneerStartDate')
  })

  it('drops a stale start date when the current role is custom', () => {
    const v3State = {
      role: 'custom',
      pioneerStartDate: '2020-01-01T00:00:00.000Z',
    }

    const migrated = migratePreferencesPersistedState(v3State, 3)

    expect(migrated.tenureStartDate).toBeNull()
    expect(migrated).not.toHaveProperty('pioneerStartDate')
  })

  it('also renames the matching preferenceUpdatedAt entry (and drops it on stale-date case)', () => {
    const v3State = {
      role: 'regularPioneer',
      pioneerStartDate: '2020-01-01T00:00:00.000Z',
      preferenceUpdatedAt: {
        pioneerStartDate: 1700000000000,
        otherKey: 1700000001000,
      },
    }

    const migrated = migratePreferencesPersistedState(v3State, 3)

    expect(migrated.preferenceUpdatedAt.tenureStartDate).toBe(1700000000000)
    expect(migrated.preferenceUpdatedAt.otherKey).toBe(1700000001000)
    expect(migrated.preferenceUpdatedAt).not.toHaveProperty('pioneerStartDate')
  })

  it('drops the preferenceUpdatedAt entry when the value is dropped (role has no Tenure Type)', () => {
    const v3State = {
      role: 'publisher',
      pioneerStartDate: '2020-01-01T00:00:00.000Z',
      preferenceUpdatedAt: {
        pioneerStartDate: 1700000000000,
        otherKey: 1700000001000,
      },
    }

    const migrated = migratePreferencesPersistedState(v3State, 3)

    expect(migrated.preferenceUpdatedAt).not.toHaveProperty('pioneerStartDate')
    expect(migrated.preferenceUpdatedAt).not.toHaveProperty('tenureStartDate')
    expect(migrated.preferenceUpdatedAt.otherKey).toBe(1700000001000)
  })

  it('is idempotent — re-running on an already-v4 state is a no-op', () => {
    const v3State = {
      role: 'regularPioneer',
      pioneerStartDate: '2020-01-01T00:00:00.000Z',
    }
    const v4State = migratePreferencesPersistedState(v3State, 3)
    const v4Again = migratePreferencesPersistedState(v4State, 4)

    expect(JSON.stringify(v4Again)).toEqual(JSON.stringify(v4State))
  })

  it('prefers the new key when both pioneerStartDate and tenureStartDate exist (downgrade-then-upgrade defensive)', () => {
    const mixedState = {
      role: 'regularPioneer',
      pioneerStartDate: '2018-01-01T00:00:00.000Z',
      tenureStartDate: '2022-05-15T00:00:00.000Z',
    }

    const migrated = migratePreferencesPersistedState(mixedState, 3)

    expect(migrated.tenureStartDate).toBe('2022-05-15T00:00:00.000Z')
    expect(migrated).not.toHaveProperty('pioneerStartDate')
  })

  it('chains cleanly through v0 → v4 (rename + tenure rename apply, value preserved)', () => {
    const v0State = {
      excludedWeekdays: [0, 6],
      publisher: 'regularPioneer',
      pioneerStartDate: '2020-01-01T00:00:00.000Z',
    }

    const migrated = migratePreferencesPersistedState(v0State, 0)

    expect(migrated.role).toBe('regularPioneer')
    expect(migrated.tenureStartDate).toBe('2020-01-01T00:00:00.000Z')
    expect(migrated.offDays).toEqual([0, 6])
    expect(migrated).not.toHaveProperty('pioneerStartDate')
    expect(migrated).not.toHaveProperty('publisher')
    expect(migrated).not.toHaveProperty('excludedWeekdays')
  })

  it('treats a null pioneerStartDate as null tenureStartDate (no spurious drop)', () => {
    const v3State = {
      role: 'regularPioneer',
      pioneerStartDate: null,
    }
    const migrated = migratePreferencesPersistedState(v3State, 3)
    expect(migrated.tenureStartDate).toBeNull()
    expect(migrated).not.toHaveProperty('pioneerStartDate')
  })

  it('leaves a payload without pioneerStartDate untouched (no synthesized field)', () => {
    const v3State = { role: 'regularPioneer' }
    const migrated = migratePreferencesPersistedState(v3State, 3)
    expect(migrated).not.toHaveProperty('pioneerStartDate')
    // The field default is filled at hydration time by combine(); the
    // migration doesn't need to introduce the new key when no legacy value
    // exists.
    expect(migrated).not.toHaveProperty('tenureStartDate')
  })
})
