import { beforeEach, describe, expect, it, vi } from 'vitest'
import moment from 'moment'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const stored = vi.hoisted(() => ({
  preferences: undefined as string | undefined,
}))
vi.mock('@/stores/mmkv', () => ({
  isStorageLocked: () => false,
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

type Strings = { [key: string]: string | Strings }
const localeDir = path.join(__dirname, '../locales')
const localeFiles = readdirSync(localeDir).map(
  (file) =>
    [
      file,
      JSON.parse(readFileSync(path.join(localeDir, file), 'utf8')) as Strings,
    ] as const
)
const english = localeFiles.find(([file]) => file === 'en-US.json')![1]
const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other']
const isPluralNode = (node: Strings) =>
  Object.keys(node).every((key) => PLURAL_FORMS.includes(key))

/** Keys English doesn't have, apart from extra plural forms (Russian `few`). */
function deadKeys(en: Strings, strings: Strings, prefix = ''): string[] {
  return Object.entries(strings).flatMap(([key, value]) => {
    const enValue = en[key]
    if (enValue === undefined)
      return isPluralNode(en) && PLURAL_FORMS.includes(key)
        ? []
        : [prefix + key]
    return typeof value === 'object' && typeof enValue === 'object'
      ? deadKeys(enValue, value, `${prefix}${key}.`)
      : []
  })
}

// Every locale ships in every app binary and OTA bundle, so keys English
// dropped are dead weight. `locales.mjs prune` (translate-locales) deletes them.
describe('locale files', () => {
  it.each(localeFiles.filter(([file]) => file !== 'en-US.json'))(
    '%s has no keys English lacks',
    (_file, strings) => {
      expect(deadKeys(english, strings)).toEqual([])
    }
  )

  it('keeps plural forms English lacks', () => {
    expect(
      deadKeys(
        { count: { one: '1 item', other: '{{count}} items' } },
        { count: { one: '1', few: '2', other: '5' }, gone: 'x' }
      )
    ).toEqual(['gone'])
  })
})

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

  it('loads every shipped locale file under its language', async () => {
    const { _i18n, setI18nLocale, translatedLocales } = await load()
    for (const locale of translatedLocales) setI18nLocale(locale)
    const loaded = translatedLocales.map((locale) => _i18n.translations[locale])
    for (const [file, strings] of localeFiles)
      expect(loaded, file).toContainEqual(strings)
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
