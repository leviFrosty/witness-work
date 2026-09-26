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

describe('Role History preference actions', () => {
  beforeEach(() => {
    usePreferences.setState({
      ...PREFERENCE_DEFAULTS,
      role: 'publisher',
      roleHistory: null,
      monthlyGoalOverrides: {},
      tenureStartDate: null,
      preferenceUpdatedAt: {},
    })
  })

  it('setRole without a start month applies to every month', () => {
    usePreferences
      .getState()
      .setRole('regularPioneer', { from: { year: 2025, month: 8 } })
    usePreferences.getState().setRole('circuitOverseer')

    expect(usePreferences.getState().role).toBe('circuitOverseer')
    expect(usePreferences.getState().roleHistory).toBeNull()
  })

  it('setRole from a month keeps earlier months in the prior role', () => {
    usePreferences
      .getState()
      .setRole('regularPioneer', { from: { year: 2025, month: 8 } })

    const state = usePreferences.getState()
    expect(state.role).toBe('regularPioneer')
    expect(state.roleHistory).toEqual({
      initial: 'publisher',
      changes: { '2025-09': 'regularPioneer' },
    })
    expect(state.preferenceUpdatedAt.roleHistory).toBeTypeOf('number')
  })

  it('a one-off month leaves the standing role and tenure alone', () => {
    usePreferences.setState({
      role: 'regularPioneer',
      tenureStartDate: new Date(2020, 8, 1),
    })
    usePreferences
      .getState()
      .setRoleForMonths(
        { year: 2026, month: 2 },
        { year: 2026, month: 2 },
        'regularAuxiliary'
      )

    const state = usePreferences.getState()
    expect(state.role).toBe('regularPioneer')
    expect(state.tenureStartDate).toEqual(new Date(2020, 8, 1))
  })

  it('bases a month goal override on that month’s role', () => {
    usePreferences
      .getState()
      .setRole('regularPioneer', { from: { year: 2025, month: 8 } })
    // August 2025 was a Regular Publisher month (0h base), so 50h is an
    // override there rather than the base goal.
    usePreferences
      .getState()
      .setMonthlyGoalOverride({ year: 2025, month: 7 }, 50)

    expect(usePreferences.getState().monthlyGoalOverrides).toEqual({
      '2025-08': 50,
    })
  })
})

describe('Month status preference action', () => {
  const march = { year: 2026, month: 2 }

  beforeEach(() => {
    usePreferences.setState({
      ...PREFERENCE_DEFAULTS,
      role: 'publisher',
      roleHistory: null,
      monthlyGoalOverrides: {},
      preferenceUpdatedAt: {},
    })
  })

  it('sets one month to reduced-goal auxiliary with its 15h goal', () => {
    usePreferences
      .getState()
      .setMonthStatus(march, 'regularAuxiliaryReduced', 'month')

    const state = usePreferences.getState()
    expect(state.role).toBe('publisher')
    expect(state.roleHistory).toEqual({
      initial: 'publisher',
      changes: { '2026-03': 'regularAuxiliary', '2026-04': 'publisher' },
    })
    expect(state.monthlyGoalOverrides).toEqual({ '2026-03': 15 })
  })

  it('clears the 15h goal when the month leaves reduced-goal auxiliary', () => {
    const { setMonthStatus } = usePreferences.getState()
    setMonthStatus(march, 'regularAuxiliaryReduced', 'month')
    setMonthStatus(march, 'publisher', 'month')

    const state = usePreferences.getState()
    expect(state.roleHistory).toBeNull()
    expect(state.monthlyGoalOverrides).toEqual({})
  })

  it('makes an onward status the standing role', () => {
    usePreferences.getState().setMonthStatus(march, 'regularPioneer', 'onward')

    const state = usePreferences.getState()
    expect(state.role).toBe('regularPioneer')
    expect(state.roleHistory).toEqual({
      initial: 'publisher',
      changes: { '2026-03': 'regularPioneer' },
    })
  })
})
