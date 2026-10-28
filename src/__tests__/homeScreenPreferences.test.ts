import { describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))

import {
  DEFAULT_HOME_SCREEN_ELEMENTS_ORDER,
  getEffectiveHomeScreenOrder,
} from '@/stores/preferences'

describe('Home screen preferences', () => {
  it('uses the default order for a new User', () => {
    expect(getEffectiveHomeScreenOrder(undefined)).toEqual(
      DEFAULT_HOME_SCREEN_ELEMENTS_ORDER
    )
  })

  it('drops retired, unknown, and duplicate sections from persisted state', () => {
    const result = getEffectiveHomeScreenOrder([
      'ministryDashboard',
      'serviceReport',
      'unknown',
      'serviceReport',
      'thisWeek',
    ])

    expect(result).not.toContain('ministryDashboard')
    expect(result).not.toContain('unknown')
    expect(new Set(result).size).toBe(result.length)
    expect(
      result.filter((k) => k === 'serviceReport' || k === 'thisWeek')
    ).toEqual(['serviceReport', 'thisWeek'])
    expect(result[0]).toBe('serviceReport')
  })

  it('places a new section after its default predecessor', () => {
    const stored = DEFAULT_HOME_SCREEN_ELEMENTS_ORDER.filter(
      (k) => k !== 'mileage'
    ).reverse()
    const result = getEffectiveHomeScreenOrder(stored)

    expect(result[result.indexOf('thisWeek') + 1]).toBe('mileage')
    expect(result.filter((k) => k !== 'mileage')).toEqual(stored)
  })

  it('places the Pet section right after Service Report for an existing order', () => {
    const stored = DEFAULT_HOME_SCREEN_ELEMENTS_ORDER.filter((k) => k !== 'pet')
    const result = getEffectiveHomeScreenOrder(stored)

    expect(result[result.indexOf('serviceReport') + 1]).toBe('pet')
    expect(result).toEqual(DEFAULT_HOME_SCREEN_ELEMENTS_ORDER)
  })

  it('places Quick Actions right after Pet for an existing order', () => {
    const stored = DEFAULT_HOME_SCREEN_ELEMENTS_ORDER.filter(
      (k) => k !== 'quickActions'
    )
    const result = getEffectiveHomeScreenOrder(stored)

    expect(result[result.indexOf('pet') + 1]).toBe('quickActions')
    expect(result).toEqual(DEFAULT_HOME_SCREEN_ELEMENTS_ORDER)
  })

  it('puts Quick Actions directly above This Week by default', () => {
    expect(DEFAULT_HOME_SCREEN_ELEMENTS_ORDER).toEqual([
      'approachingConversations',
      'together',
      'tabletServiceYearSummary',
      'serviceReport',
      'pet',
      'quickActions',
      'thisWeek',
      'mileage',
      'timer',
      'didYouKnow',
    ])
  })

  it('places Together right after the Follow-ups for an existing order', () => {
    const stored = DEFAULT_HOME_SCREEN_ELEMENTS_ORDER.filter(
      (k) => k !== 'together'
    )
    const result = getEffectiveHomeScreenOrder(stored)

    expect(result[result.indexOf('approachingConversations') + 1]).toBe(
      'together'
    )
    expect(result).toEqual(DEFAULT_HOME_SCREEN_ELEMENTS_ORDER)
  })

  it('appends missing sections in default order', () => {
    const result = getEffectiveHomeScreenOrder(['thisWeek'])

    expect(result[0]).toBe('thisWeek')
    expect(result).toHaveLength(DEFAULT_HOME_SCREEN_ELEMENTS_ORDER.length)
    expect(result).toEqual(
      expect.arrayContaining(DEFAULT_HOME_SCREEN_ELEMENTS_ORDER)
    )
  })
})
