import { describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => ({
  mmkvStorage: { getString: () => undefined },
  PersistStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'ar-EG' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))

import { handleLangFallback, resolveAppLocale } from '@/lib/locales'

describe('handleLangFallback', () => {
  it('keeps a locale we translate', () => {
    expect(handleLangFallback('pt-br')).toEqual({
      locale: 'pt-br',
      languageFound: true,
      fallback: false,
    })
    expect(handleLangFallback('zh-hant-tw').locale).toBe('zh-hant-tw')
  })

  it('matches a tag without a region on its whole language subtag', () => {
    expect(handleLangFallback('ar')).toEqual({
      locale: 'ar',
      languageFound: true,
      fallback: false,
    })
    expect(handleLangFallback('en')).toEqual({
      locale: 'en-us',
      languageFound: true,
      fallback: true,
    })
    expect(handleLangFallback('sw').locale).toBe('sw-ke')
    expect(handleLangFallback('uk').locale).toBe('uk-ua')
  })

  it('gives every Arabic-speaking country the one Arabic', () => {
    for (const tag of ['ar-sa', 'ar-EG', 'ar_MA', 'ar-Arab-AE'])
      expect(handleLangFallback(tag)).toEqual({
        locale: 'ar',
        languageFound: true,
        fallback: false,
      })
  })

  it('falls back to English for a language we don’t translate', () => {
    expect(handleLangFallback('fa-ir')).toEqual({
      locale: 'en-us',
      languageFound: false,
      fallback: true,
    })
    expect(handleLangFallback('xx').locale).toBe('en-us')
    expect(handleLangFallback('he-il').locale).toBe('en-us')
  })

  it('swaps the region within a language', () => {
    expect(handleLangFallback('en-gb')).toEqual({
      locale: 'en-us',
      languageFound: true,
      fallback: true,
    })
    expect(handleLangFallback('pt-ao').locale).toBe('pt-br')
    expect(handleLangFallback('es-mx').locale).toBe('es-es')
    expect(handleLangFallback('DE_AT').locale).toBe('de-de')
  })

  it('keeps Chinese in its script', () => {
    expect(handleLangFallback('zh-hant-hk').locale).toBe('zh-hant-tw')
    expect(handleLangFallback('zh-hans-sg').locale).toBe('zh-hans-cn')
    expect(handleLangFallback('zh-tw').locale).toBe('zh-hant-tw')
    expect(handleLangFallback('zh-hk').locale).toBe('zh-hant-tw')
    expect(handleLangFallback('zh-cn').locale).toBe('zh-hans-cn')
    expect(handleLangFallback('zh').locale).toBe('zh-hans-cn')
  })
})

describe('resolveAppLocale', () => {
  it('prefers the Language picked in Settings', () => {
    expect(resolveAppLocale('ru-ru')).toBe('ru-ru')
  })

  it('follows the device language otherwise', () => {
    expect(resolveAppLocale(undefined)).toBe('ar')
  })
})
