import { beforeEach, describe, expect, it, vi } from 'vitest'
import moment from 'moment'

const stored = vi.hoisted(() => ({
  preferences: undefined as string | undefined,
}))
vi.mock('@/stores/mmkv', () => ({
  mmkvStorage: { getString: () => stored.preferences },
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

const load = async () => {
  vi.resetModules()
  return import('@/lib/locales')
}

describe('translations load on demand', () => {
  beforeEach(() => {
    stored.preferences = undefined
  })

  it('starts in the stored language, before anything renders', async () => {
    stored.preferences = JSON.stringify({ state: { locale: 'es-es' } })
    const { default: i18n, _i18n } = await load()
    expect(_i18n.locale).toBe('es-es')
    expect(i18n.t('addTime')).toBe('Agregar tiempo')
  })

  it('starts in the device language without stored preferences', async () => {
    const { _i18n } = await load()
    expect(_i18n.locale).toBe('en-us')
  })

  it('loads a language only when it becomes active', async () => {
    const { default: i18n, _i18n, setI18nLocale } = await load()
    expect(Object.keys(_i18n.translations)).toEqual(['en-us'])
    setI18nLocale('de-de')
    expect(Object.keys(_i18n.translations)).toEqual(['en-us', 'de-de'])
    expect(i18n.t('addTime')).toBe('Zeit hinzufügen')
  })

  it('falls back to English for keys a language lacks', async () => {
    const { _i18n, setI18nLocale } = await load()
    _i18n.store({ 'en-us': { onlyInEnglish: 'Only in English' } })
    setI18nLocale('de-de')
    expect(_i18n.t('onlyInEnglish')).toBe('Only in English')
  })
})

describe('moment locales load on demand', () => {
  it('loads a locale and its base language, keeping the active one', async () => {
    const { loadMomentLocale } = await import('@/lib/momentLocales')
    moment.locale('en')
    loadMomentLocale('fr-ch')
    expect(moment.locales()).toEqual(expect.arrayContaining(['fr-ch', 'fr']))
    expect(moment.locale()).toBe('en')
  })

  it('ignores locales the app doesn’t ship', async () => {
    const { loadMomentLocale } = await import('@/lib/momentLocales')
    expect(() => loadMomentLocale('xx-yy')).not.toThrow()
    expect(moment.locales()).not.toContain('xx-yy')
  })
})
