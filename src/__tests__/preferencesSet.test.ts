import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('@/lib/locales', () => ({
  default: { t: (k: string) => k },
}))

import { PREFERENCE_DEFAULTS, usePreferences } from '@/stores/preferences'
import { counters } from '@/lib/perf'
import { entryTimestampKey } from '@/lib/syncPreferencePolicy'

const STAMP = 1_000
const NOVEMBER = entryTimestampKey('monthlyGoalOverrides', '2026-11')

describe('preferences set', () => {
  beforeEach(() => {
    usePreferences.setState({
      ...PREFERENCE_DEFAULTS,
      fontSizeOffset: 2,
      monthlyGoalOverrides: { '2026-11': 60 },
      preferenceUpdatedAt: {
        fontSizeOffset: STAMP,
        monthlyGoalOverrides: STAMP,
        [NOVEMBER]: STAMP,
      },
    })
  })

  it('skips notifying and persisting when nothing changes', () => {
    const listener = vi.fn()
    const unsubscribe = usePreferences.subscribe(listener)
    const noops = counters['prefs:set:noop'] ?? 0

    usePreferences.getState().set({
      fontSizeOffset: 2,
      iCloudSyncPausedForLapse: PREFERENCE_DEFAULTS.iCloudSyncPausedForLapse,
    })
    usePreferences.getState().set(() => ({}))

    unsubscribe()
    expect(listener).not.toHaveBeenCalled()
    expect(counters['prefs:set:noop']).toBe(noops + 2)
  })

  it('writes a bookkeeping key without stamping anything', () => {
    usePreferences.getState().set({ lastiCloudSyncAt: 42 })

    const state = usePreferences.getState()
    expect(state.lastiCloudSyncAt).toBe(42)
    expect(state.preferenceUpdatedAt).toEqual({
      fontSizeOffset: STAMP,
      monthlyGoalOverrides: STAMP,
      [NOVEMBER]: STAMP,
    })
  })

  it('stamps only the synced keys whose value changed', () => {
    usePreferences.getState().set({ fontSizeOffset: 2, colorScheme: 'dark' })

    const stamps = usePreferences.getState().preferenceUpdatedAt
    expect(stamps.fontSizeOffset).toBe(STAMP)
    expect(stamps.colorScheme).toBeGreaterThan(STAMP)
  })

  it('treats an equal copy of an object as unchanged', () => {
    usePreferences.getState().set({
      fontSizeOffset: 3,
      monthlyGoalOverrides: { '2026-11': 60 },
    })

    const stamps = usePreferences.getState().preferenceUpdatedAt
    expect(stamps.fontSizeOffset).toBeGreaterThan(STAMP)
    expect(stamps.monthlyGoalOverrides).toBe(STAMP)
    expect(stamps[NOVEMBER]).toBe(STAMP)
  })

  it('still stamps a changed map key and its changed entry', () => {
    usePreferences.getState().set({
      monthlyGoalOverrides: { '2026-11': 60, '2026-12': 50 },
    })

    const stamps = usePreferences.getState().preferenceUpdatedAt
    expect(stamps.monthlyGoalOverrides).toBeGreaterThan(STAMP)
    expect(stamps[NOVEMBER]).toBe(STAMP)
    expect(
      stamps[entryTimestampKey('monthlyGoalOverrides', '2026-12')]
    ).toBeGreaterThan(STAMP)
  })
})
