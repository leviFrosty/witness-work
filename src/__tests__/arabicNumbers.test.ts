import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The Duration Format module pulls in @/lib/locales → @/stores/mmkv; stub the
// native modules the way minutes.test.ts does.
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

import * as cardinals from 'make-plural/cardinals'
import i18n, { _i18n } from '@/lib/locales'
import { applyFormatRegion } from '@/lib/dates'
import { createPluralizer } from '@/lib/plurals'
import { formatMinutes, formatMinutesCompact } from '@/lib/minutes'

// A stand-in for the Arabic translation, which ships separately: just the
// duration strings, in all six of Arabic's plural forms.
const ar = {
  hoursShort: {
    zero: '{{count}} ساعة',
    one: 'ساعة واحدة',
    two: 'ساعتان',
    few: '{{count}} ساعات',
    many: '{{count}} ساعة',
    other: '{{count}} ساعة',
  },
  minutesShort: {
    zero: '{{count}} دقيقة',
    one: 'دقيقة واحدة',
    two: 'دقيقتان',
    few: '{{count}} دقائق',
    many: '{{count}} دقيقة',
    other: '{{count}} دقيقة',
  },
  hoursAndMinutesShort: '{{hours}} و{{minutes}}',
  hoursCompact: 'س',
  minutesCompact: 'د',
  goalLine: 'هدفك {{count}} ساعة لسنة {{year}}، اسمك {{name}}',
}

beforeAll(() => {
  _i18n.store({ ar })
  _i18n.pluralization.register('ar', createPluralizer(cardinals.ar))
  _i18n.locale = 'ar'
  applyFormatRegion({ language: 'ar' })
})

afterAll(() => {
  _i18n.locale = 'en-us'
  applyFormatRegion({ language: 'en-us' })
})

describe('i18n numbers in Arabic', () => {
  it('prints interpolated numbers in Arabic-Indic digits', () => {
    expect(
      // @ts-expect-error The stand-in key isn't in en-US.json.
      i18n.t('goalLine', { count: 600, year: 2026, name: 'Ada 2' })
    ).toBe('هدفك ٦٠٠ ساعة لسنة ٢٠٢٦، اسمك Ada 2')
  })

  it('picks each of the six plural forms', () => {
    const hours = (count: number) =>
      // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
      i18n.t('hoursShort', { count })
    expect(hours(0)).toBe('٠ ساعة')
    expect(hours(1)).toBe('ساعة واحدة')
    expect(hours(2)).toBe('ساعتان')
    expect(hours(3)).toBe('٣ ساعات')
    expect(hours(11)).toBe('١١ ساعة')
    expect(hours(100)).toBe('١٠٠ ساعة')
    expect(hours(1.5)).toBe('١٫٥ ساعة')
  })
})

describe('a translation into another Language', () => {
  it("uses that Language's digits, not the app's", () => {
    expect(
      // @ts-expect-error The stand-in key isn't in en-US.json.
      i18n.t('goalLine', {
        count: 600,
        year: 2026,
        name: 'Ada',
        locale: 'en-us',
      })
    ).not.toMatch(/[٠-٩]/)
    _i18n.locale = 'en-us'
    try {
      expect(
        // @ts-expect-error The stand-in key isn't in en-US.json.
        i18n.t('goalLine', {
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
    // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
    expect(i18n.t('daysLeftCount', { count: 3 })).toBe('٣ days left')
    // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
    expect(i18n.t('daysLeftCount', { count: 1 })).toBe('١ day left')
  })
})

describe('Duration Format in Arabic', () => {
  it('writes decimal hours with Arabic digits and decimal separator', () => {
    expect(formatMinutes(90, 'decimal').formatted).toBe('١٫٥ ساعة')
    expect(formatMinutes(600, 'decimal').formatted).toBe('١٠ ساعات')
  })

  it('joins hours and minutes through one translatable string', () => {
    expect(formatMinutes(150, 'short').formatted).toBe('ساعتان و٣٠ دقيقة')
    expect(formatMinutes(61, 'short').formatted).toBe('ساعة واحدة ودقيقة واحدة')
  })

  it('localizes the compact forms', () => {
    expect(formatMinutesCompact(30)).toBe('٣٠د')
    expect(formatMinutesCompact(120)).toBe('٢س')
    expect(formatMinutesCompact(90)).toBe('١٫٥س')
    expect(formatMinutesCompact(12, { unit: 'hours' })).toBe('١٢س')
  })
})
