import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
  getCalendars: () => [{ timeZone: 'UTC' }],
}))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))

import i18n, { _i18n, type TranslationKey } from '@/lib/locales'
import { applyFormatRegion } from '@/lib/dates'
import { coinsText } from '@/features/pet/lib/roomLabels'

const coins = 'pet.currency.coin' as TranslationKey
const yearLine = 'verifyYearLine' as TranslationKey

beforeAll(() => {
  _i18n.store({
    'en-us': {
      verifyYearLine: '{{count}} hours in {{year}}, {{total}} in all',
    },
  })
})

afterEach(() => {
  applyFormatRegion({ language: 'en-us' })
})

describe('counts in sentences', () => {
  it('groups a count from a thousand the way the Format Region writes it', () => {
    applyFormatRegion({ language: 'en-us', region: 'en' })
    expect(i18n.t(coins, { count: 97800 })).toBe('97,800 coins')
    expect(coinsText(100000)).toBe('100,000 coins')
    applyFormatRegion({ language: 'en-us', region: 'de' })
    expect(i18n.t(coins, { count: 97800 })).toBe('97.800 coins')
    applyFormatRegion({ language: 'en-us', region: 'fr' })
    expect(i18n.t(coins, { count: 97800 })).toMatch(/^97\s800 coins$/)
  })

  it('leaves smaller counts, fractions and the singular as they were', () => {
    applyFormatRegion({ language: 'en-us', region: 'de' })
    expect(i18n.t(coins, { count: 999 })).toBe('999 coins')
    expect(i18n.t(coins, { count: 1 })).toBe('1 coin')
    expect(i18n.t(coins, { count: 1500.5 })).toBe('1500.5 coins')
  })

  it('groups only the count, never a year or another number', () => {
    applyFormatRegion({ language: 'en-us', region: 'en' })
    expect(i18n.t(yearLine, { count: 1200, year: 2026, total: 4800 })).toBe(
      '1,200 hours in 2026, 4800 in all'
    )
  })
})
