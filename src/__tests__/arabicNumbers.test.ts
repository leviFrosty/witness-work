import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

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

import i18n, { _i18n, setI18nLocale, type TranslationKey } from '@/lib/locales'
import { applyFormatRegion } from '@/lib/dates'
import { formatMinutes, formatMinutesCompact } from '@/lib/minutes'

beforeAll(() => {
  setI18nLocale('ar')
  _i18n.store({
    ar: { goalLine: 'هدفك {{count}} ساعة لسنة {{year}}، اسمك {{name}}' },
  })
  applyFormatRegion({ language: 'ar' })
})

afterAll(() => {
  setI18nLocale('en-us')
  applyFormatRegion({ language: 'en-us' })
})

const t = (key: TranslationKey, count: number) => i18n.t(key, { count })
const goalLine = 'goalLine' as TranslationKey

describe('i18n numbers in Arabic', () => {
  it('prints interpolated numbers in Arabic-Indic digits', () => {
    expect(i18n.t(goalLine, { count: 600, year: 2026, name: 'Ada 2' })).toBe(
      'هدفك ٦٠٠ ساعة لسنة ٢٠٢٦، اسمك Ada 2'
    )
  })

  it('writes 1 and 2 with the singular and dual noun in sentences', () => {
    const remind = (count: number) => t('visitDetails_remindHours', count)
    expect(remind(0)).toBe('سنذكّرك قبل ٠ ساعة.')
    expect(remind(1)).toBe('سنذكّرك قبل ساعة واحدة.')
    expect(remind(2)).toBe('سنذكّرك قبل ساعتين.')
    expect(remind(3)).toBe('سنذكّرك قبل ٣ ساعات.')
    expect(remind(11)).toBe('سنذكّرك قبل ١١ ساعة.')
    expect(remind(100)).toBe('سنذكّرك قبل ١٠٠ ساعة.')
    expect(t('daysLeftCount', 1)).toBe('بقي يوم واحد')
    expect(t('daysLeftCount', 2)).toBe('بقي يومان')
    expect(t('daysLeftCount', 7)).toBe('بقي ٧ أيام')
  })

  it('keeps the number in compact unit labels', () => {
    const hours = (count: number) => t('hoursShort', count)
    expect(hours(0)).toBe('٠ ساعة')
    expect(hours(1)).toBe('١ ساعة')
    expect(hours(2)).toBe('٢ ساعة')
    expect(hours(3)).toBe('٣ ساعات')
    expect(hours(11)).toBe('١١ ساعة')
    expect(hours(100)).toBe('١٠٠ ساعة')
    expect(hours(1.5)).toBe('١٫٥ ساعة')
  })
})

describe('a translation into another Language', () => {
  it("uses that Language's digits, not the app's", () => {
    expect(
      i18n.t(goalLine, {
        count: 600,
        year: 2026,
        name: 'Ada',
        locale: 'en-us',
      })
    ).not.toMatch(/[٠-٩]/)
    _i18n.locale = 'en-us'
    try {
      expect(
        i18n.t(goalLine, {
          count: 600,
          year: 2026,
          name: 'Ada',
          locale: 'ar',
        })
      ).toBe('هدفك ٦٠٠ ساعة لسنة ٢٠٢٦، اسمك Ada')
    } finally {
      _i18n.locale = 'ar'
    }
  })
})

describe('untranslated strings in Arabic', () => {
  it('keep Arabic-Indic digits when they fall back to English', () => {
    const arabic = _i18n.translations.ar as Record<string, unknown>
    const translated = arabic.daysLeftCount
    delete arabic.daysLeftCount
    try {
      expect(t('daysLeftCount', 3)).toBe('٣ days left')
      expect(t('daysLeftCount', 1)).toBe('١ day left')
    } finally {
      arabic.daysLeftCount = translated
    }
  })
})

describe('Duration Format in Arabic', () => {
  it('writes decimal hours with Arabic digits and decimal separator', () => {
    expect(formatMinutes(90, 'decimal').formatted).toBe('١٫٥ ساعة')
    expect(formatMinutes(600, 'decimal').formatted).toBe('١٠ ساعات')
  })

  it('joins hours and minutes through one translatable string', () => {
    expect(formatMinutes(150, 'short').formatted).toBe('٢ ساعة و٣٠ دقيقة')
    expect(formatMinutes(61, 'short').formatted).toBe('١ ساعة و١ دقيقة')
  })

  it('localizes the compact forms', () => {
    expect(formatMinutesCompact(30)).toBe('٣٠د')
    expect(formatMinutesCompact(120)).toBe('٢س')
    expect(formatMinutesCompact(90)).toBe('١٫٥س')
    expect(formatMinutesCompact(12, { unit: 'hours' })).toBe('١٢س')
  })
})
