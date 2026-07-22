import { describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({ DeviceType: { TABLET: 2 }, deviceType: 1 }))
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
    expect(result.slice(0, 2)).toEqual(['serviceReport', 'thisWeek'])
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
