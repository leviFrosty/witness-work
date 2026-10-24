import { describe, expect, it, vi } from 'vitest'
import { ar, en, ja, ru, uk } from 'make-plural/cardinals'

vi.mock('@/stores/mmkv', () => ({
  mmkvStorage: { getString: () => undefined },
  PersistStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))

import { createPluralizer } from '@/lib/plurals'
import i18n, {
  _i18n,
  DEFAULT_LOCALE,
  setI18nLocale,
  translatedLocales,
  type TranslationKey,
} from '@/lib/locales'

const keys = (rule: Parameters<typeof createPluralizer>[0], count: number) =>
  createPluralizer(rule)(_i18n, count)

describe('createPluralizer', () => {
  it('tries the CLDR category, then other', () => {
    expect(keys(ru, 1)).toEqual(['one', 'other'])
    expect(keys(ru, 3)).toEqual(['few', 'other'])
    expect(keys(ru, 5)).toEqual(['many', 'other'])
    expect(keys(ru, 11)).toEqual(['many', 'other'])
    expect(keys(ru, 21)).toEqual(['one', 'other'])
    expect(keys(ru, 22)).toEqual(['few', 'other'])
    expect(keys(ru, 1.5)).toEqual(['other'])
    expect(keys(uk, 2)).toEqual(['few', 'other'])
    expect(keys(uk, 25)).toEqual(['many', 'other'])
  })

  it('tries zero first for 0, as English strings expect', () => {
    expect(keys(en, 0)).toEqual(['zero', 'other'])
    expect(keys(ru, 0)).toEqual(['zero', 'many', 'other'])
    expect(keys(ar, 0)).toEqual(['zero', 'other'])
  })

  it('covers all six Arabic categories', () => {
    expect(keys(ar, 1)).toEqual(['one', 'other'])
    expect(keys(ar, 2)).toEqual(['two', 'other'])
    expect(keys(ar, 3)).toEqual(['few', 'other'])
    expect(keys(ar, 11)).toEqual(['many', 'other'])
    expect(keys(ar, 100)).toEqual(['other'])
  })

  it('keeps English and Japanese rules', () => {
    expect(keys(en, 1)).toEqual(['one', 'other'])
    expect(keys(en, 2)).toEqual(['other'])
    expect(keys(ja, 1)).toEqual(['other'])
  })
})

describe('registered plural rules', () => {
  it('uses each Language’s own rule', () => {
    const forLocale = (locale: (typeof translatedLocales)[number], n: number) =>
      _i18n.pluralization.get(locale)(_i18n, n)
    expect(forLocale('en-us', 1)).toEqual(['one', 'other'])
    expect(forLocale('ja-jp', 1)).toEqual(['other'])
    expect(forLocale('uk-ua', 3)).toEqual(['few', 'other'])
    expect(forLocale('fr-fr', 0)).toEqual(['zero', 'one', 'other'])
    expect(forLocale('pt-pt', 0)).toEqual(['zero', 'other'])
    expect(forLocale('rw-rw', 1)).toEqual(['one', 'other'])
    expect(forLocale('ar', 0)).toEqual(['zero', 'other'])
    expect(forLocale('ar', 2)).toEqual(['two', 'other'])
    expect(forLocale('ar', 11)).toEqual(['many', 'other'])
  })

  it('renders Russian one, few and many', () => {
    setI18nLocale('ru-ru')
    const t = (count: number) => _i18n.t('contactDetails.studyCount', { count })
    expect(t(1)).toBe('1 изучение')
    expect(t(3)).toBe('3 изучения')
    expect(t(5)).toBe('5 изучений')
    expect(t(21)).toBe('21 изучение')
  })

  it('falls back to other when a translation lacks the category', () => {
    _i18n.store({ 'ru-ru': { onlyOther: { other: '%{count} шт.' } } })
    setI18nLocale('ru-ru')
    expect(_i18n.t('onlyOther', { count: 3 })).toBe('3 шт.')
  })

  it('still renders English zero', () => {
    setI18nLocale('en-us')
    expect(_i18n.t('contacts_sortAndFilter_resultCount', { count: 0 })).toBe(
      'No matches'
    )
    expect(_i18n.t('contacts_sortAndFilter_resultCount', { count: 1 })).toBe(
      '1 match'
    )
  })

  it('picks an untranslated plural by English rules', () => {
    // TranslationKey doesn't list keys that hold plural objects.
    const t = (key: string, count: number) =>
      i18n.t(key as TranslationKey, { count })
    // An English-only key, so the test keeps working once every real key is
    // translated at a release cut.
    _i18n.store({
      [DEFAULT_LOCALE]: {
        __untranslatedPhotoCount: {
          one: '{{count}} photo',
          other: '{{count}} photos',
        },
      },
    })
    // Not translated yet: the English strings render, chosen by English rules.
    setI18nLocale('ru-ru')
    expect(t('__untranslatedPhotoCount', 21)).toBe('21 photos')
    expect(t('__untranslatedPhotoCount', 1)).toBe('1 photo')
    setI18nLocale('fr-fr')
    expect(t('__untranslatedPhotoCount', 0)).toBe('0 photos')
    expect(t('__untranslatedPhotoCount', 1.5)).toBe('1.5 photos')
    // A translated plural still uses the Language's own rules.
    setI18nLocale('ru-ru')
    expect(t('contactDetails.studyCount', 21)).toBe('21 изучение')
    setI18nLocale('en-us')
  })
})
