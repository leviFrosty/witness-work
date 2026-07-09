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

import { PREFERENCE_DEFAULTS, usePreferences } from '@/stores/preferences'

describe('Monthly Goal preference actions', () => {
  beforeEach(() => {
    usePreferences.setState({
      ...PREFERENCE_DEFAULTS,
      role: 'regularPioneer',
      monthlyGoalOverrides: {},
      preferenceUpdatedAt: {},
    })
  })

  it('saves nonnegative decimal hours for one exact calendar month', () => {
    usePreferences
      .getState()
      .setMonthlyGoalOverride({ year: 2026, month: 10 }, 60.5)

    expect(usePreferences.getState().monthlyGoalOverrides).toEqual({
      '2026-11': 60.5,
    })
  })

  it('allows a zero-hour override', () => {
    usePreferences
      .getState()
      .setMonthlyGoalOverride({ year: 2026, month: 10 }, 0)

    expect(usePreferences.getState().monthlyGoalOverrides['2026-11']).toBe(0)
  })

  it('removes the override when saving the Publisher-derived base goal', () => {
    usePreferences.setState({ monthlyGoalOverrides: { '2026-11': 60 } })

    usePreferences
      .getState()
      .setMonthlyGoalOverride({ year: 2026, month: 10 }, 50)

    expect(usePreferences.getState().monthlyGoalOverrides).toEqual({})
  })

  it('uses the current custom Publisher goal as the removable base', () => {
    usePreferences.setState({
      role: 'custom',
      publisherHours: {
        ...PREFERENCE_DEFAULTS.publisherHours,
        custom: 72.5,
      },
      monthlyGoalOverrides: { '2026-11': 80 },
    })

    usePreferences
      .getState()
      .setMonthlyGoalOverride({ year: 2026, month: 10 }, 72.5)

    expect(usePreferences.getState().monthlyGoalOverrides).toEqual({})
  })

  it('clears only the selected calendar month', () => {
    usePreferences.setState({
      monthlyGoalOverrides: { '2026-11': 60, '2026-12': 70 },
    })

    usePreferences
      .getState()
      .clearMonthlyGoalOverride({ year: 2026, month: 10 })

    expect(usePreferences.getState().monthlyGoalOverrides).toEqual({
      '2026-12': 70,
    })
  })

  it('rejects negative and nonfinite goals', () => {
    expect(() =>
      usePreferences
        .getState()
        .setMonthlyGoalOverride({ year: 2026, month: 10 }, -0.5)
    ).toThrow(RangeError)
    expect(() =>
      usePreferences
        .getState()
        .setMonthlyGoalOverride({ year: 2026, month: 10 }, Number.NaN)
    ).toThrow(RangeError)

    expect(usePreferences.getState().monthlyGoalOverrides).toEqual({})
  })
})
