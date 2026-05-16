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

import {
  extractProfileFromPreferences,
  PROFILE_FIELD_KEYS,
} from '@/lib/profileMigration'

describe('extractProfileFromPreferences (boot-runner one-shot)', () => {
  it('splits identity-shaped fields out of a preferences blob into a profile blob', () => {
    const prefs = {
      role: 'regularPioneer',
      name: 'Alice',
      avatar: { type: 'image', value: 'file:///avatar.jpg' },
      customAvatarBackground: '#FFAABB',
      hasCompletedProfileSetup: true,
      monthlyGoalOverride: 50,
      preferenceUpdatedAt: {
        role: 1700000001000,
        name: 1700000002000,
        avatar: 1700000003000,
        customAvatarBackground: 1700000004000,
        hasCompletedProfileSetup: 1700000005000,
        monthlyGoalOverride: 1700000006000,
      },
    }

    const result = extractProfileFromPreferences(prefs)

    // Profile fields land in the new slice with their timestamps.
    expect(result.profile.values).toEqual({
      name: 'Alice',
      avatar: { type: 'image', value: 'file:///avatar.jpg' },
      customAvatarBackground: '#FFAABB',
      hasCompletedProfileSetup: true,
    })
    expect(result.profile.updatedAt).toEqual({
      name: 1700000002000,
      avatar: 1700000003000,
      customAvatarBackground: 1700000004000,
      hasCompletedProfileSetup: 1700000005000,
    })

    // Preferences no longer carries them.
    expect(result.preferences).not.toHaveProperty('name')
    expect(result.preferences).not.toHaveProperty('avatar')
    expect(result.preferences).not.toHaveProperty('customAvatarBackground')
    expect(result.preferences).not.toHaveProperty('hasCompletedProfileSetup')
    expect(result.preferences.role).toBe('regularPioneer')
    expect(result.preferences.monthlyGoalOverride).toBe(50)

    // Settings-side updatedAt entries for the moved fields are dropped.
    expect(result.preferences.preferenceUpdatedAt).toEqual({
      role: 1700000001000,
      monthlyGoalOverride: 1700000006000,
    })
  })

  it('is idempotent — re-running on an already-extracted preferences blob is a no-op', () => {
    const prefs = {
      role: 'regularPioneer',
      monthlyGoalOverride: 50,
      preferenceUpdatedAt: { role: 1700000001000 },
    }

    const result = extractProfileFromPreferences(prefs)

    expect(result.profile.values).toEqual({})
    expect(result.profile.updatedAt).toEqual({})
    expect(result.preferences).toEqual(prefs)
  })

  it('returns an empty profile slice when no profile fields are present', () => {
    const prefs = { role: 'publisher' }
    const result = extractProfileFromPreferences(prefs)
    expect(result.profile.values).toEqual({})
    expect(result.profile.updatedAt).toEqual({})
  })

  it('preserves profile-field values even when their updatedAt entry is missing', () => {
    // A pre-sync install may have profile data but no timestamp map.
    const prefs = {
      name: 'Bob',
      avatar: { type: 'emoji', value: '🌱' },
    }
    const result = extractProfileFromPreferences(prefs)
    expect(result.profile.values.name).toBe('Bob')
    expect(result.profile.values.avatar).toEqual({
      type: 'emoji',
      value: '🌱',
    })
    expect(result.profile.updatedAt).toEqual({})
  })

  it('exports the canonical list of profile field keys', () => {
    // Public contract — the sync layer and the boot runner both rely on this
    // list. Asserting it explicitly catches accidental drift.
    expect(new Set(PROFILE_FIELD_KEYS)).toEqual(
      new Set([
        'name',
        'avatar',
        'customAvatarBackground',
        'hasCompletedProfileSetup',
      ])
    )
  })

  it('handles the example case from the spec', () => {
    const v2 = {
      role: 'regularPioneer',
      name: 'Alice',
      avatar: { type: 'image', value: 'avatar://x' },
      monthlyGoalOverride: 50,
    }
    const result = extractProfileFromPreferences(v2)
    expect(result.preferences).toEqual({
      role: 'regularPioneer',
      monthlyGoalOverride: 50,
    })
    expect(result.profile.values).toEqual({
      name: 'Alice',
      avatar: { type: 'image', value: 'avatar://x' },
    })
  })
})
