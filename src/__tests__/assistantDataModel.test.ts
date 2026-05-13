import moment from 'moment'
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

import useServiceReport from '@/stores/serviceReport'
import {
  NON_SYNCABLE_PREFERENCE_KEYS,
  usePreferences,
} from '@/stores/preferences'

describe('DayPlan.source field', () => {
  beforeEach(() => {
    useServiceReport.setState({ dayPlans: [] })
  })

  it('addDayPlan persists source="recommendation" so the engine-inserted plans are distinguishable from manual ones', () => {
    const { addDayPlan } = useServiceReport.getState()
    addDayPlan({
      id: 'rec-1',
      date: moment('2026-05-15').toDate(),
      minutes: 120,
      source: 'recommendation',
    })
    const stored = useServiceReport
      .getState()
      .dayPlans.find((p) => p.id === 'rec-1')
    expect(stored?.source).toBe('recommendation')
  })

  it("updateDayPlan can flip an existing plan's source — e.g. user edits a recommended plan and it becomes manual", () => {
    const { addDayPlan, updateDayPlan } = useServiceReport.getState()
    addDayPlan({
      id: 'rec-2',
      date: moment('2026-05-16').toDate(),
      minutes: 60,
      source: 'recommendation',
    })
    updateDayPlan({ id: 'rec-2', source: 'manual' })
    const stored = useServiceReport
      .getState()
      .dayPlans.find((p) => p.id === 'rec-2')
    expect(stored?.source).toBe('manual')
  })
})

describe('Assistant preference defaults', () => {
  it('exposes the new assistant-related defaults so consumer code reads safe starting values without optional-chaining', () => {
    const state = usePreferences.getState()
    expect(state.excludedWeekdays).toEqual([])
    expect(state.hasSeenAvailabilityOnboarding).toBe(false)
    expect(state.assistantHistory).toEqual([])
    expect(state.hasDismissedRecommendationHash).toBeUndefined()
  })

  it('keeps the new assistant preferences syncable — they describe user intent and should follow the user across devices', () => {
    expect(NON_SYNCABLE_PREFERENCE_KEYS.has('excludedWeekdays')).toBe(false)
    expect(
      NON_SYNCABLE_PREFERENCE_KEYS.has('hasSeenAvailabilityOnboarding')
    ).toBe(false)
    expect(NON_SYNCABLE_PREFERENCE_KEYS.has('assistantHistory')).toBe(false)
    expect(
      NON_SYNCABLE_PREFERENCE_KEYS.has('hasDismissedRecommendationHash')
    ).toBe(false)
  })
})
