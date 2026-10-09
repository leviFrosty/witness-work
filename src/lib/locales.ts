import { I18n, TranslateOptions } from 'i18n-js'
import enUS from '@/locales/en-US.json'
import { getLocales } from 'expo-localization'
import { applyFormatRegion, type DateOrder, type TimeFormat } from '@/lib/dates'
import { readBootPreferences } from '@/stores/bootPreferences'

type Translations = typeof enUS

// English is the fallback for every missing key, so it always loads. The
// others (about 3 MB together) load when they become the active language.
const translationLoaders = {
  'en-us': () => enUS,
  'de-de': () => require('../locales/de-DE.json'),
  'es-es': () => require('../locales/es-ES.json'),
  'fr-fr': () => require('../locales/fr-FR.json'),
  'it-it': () => require('../locales/it-IT.json'),
  'ja-jp': () => require('../locales/ja-JP.json'),
  'ko-kr': () => require('../locales/ko-KR.json'),
  'nl-nl': () => require('../locales/nl-NL.json'),
  'pt-br': () => require('../locales/pt-BR.json'),
  'pt-pt': () => require('../locales/pt-PT.json'),
  'ru-ru': () => require('../locales/ru-RU.json'),
  'vi-vn': () => require('../locales/vi-VN.json'),
  'zh-hant-tw': () => require('../locales/zh-TW.json'), // Traditional
  'zh-hans-cn': () => require('../locales/zh-CN.json'), // Simplified
  'sw-ke': () => require('../locales/sw-KE.json'),
  'uk-ua': () => require('../locales/uk-UA.json'),
  'bem-zm': () => require('../locales/bem-ZM.json'), // Bemba
  'rw-rw': () => require('../locales/rw-RW.json'),
} as const satisfies Record<string, () => Partial<Translations>>
export type TranslatedLocale = keyof typeof translationLoaders

export const translatedLocales = Object.keys(
  translationLoaders
) as TranslatedLocale[]

export const translationsLabels: { [K in TranslatedLocale]: string } = {
  'en-us': 'English',
  'de-de': 'Deutsch',
  'es-es': 'Español',
  'fr-fr': 'Français',
  'it-it': 'Italiano',
  'ja-jp': '日本語',
  'ko-kr': '한국인',
  'nl-nl': 'Nederlands',
  'pt-br': 'Português (Brasil)',
  'pt-pt': 'Português (Portugal)',
  'ru-ru': 'Русский',
  'vi-vn': 'Tiếng Việt',
  'zh-hant-tw': '中文（繁體）',
  'zh-hans-cn': '简体中文',
  'sw-ke': 'kiswahili',
  'uk-ua': 'українська',
  'bem-zm': 'Ichibemba',
  'rw-rw': 'Kinyarwanda',
} as const

export const DEFAULT_LOCALE = 'en-us'
export const _i18n = new I18n({ [DEFAULT_LOCALE]: enUS })
_i18n.enableFallback = true
_i18n.defaultLocale = DEFAULT_LOCALE

const loadedLocales = new Set<TranslatedLocale>([DEFAULT_LOCALE])

/** Makes `locale` the language `i18n.t` answers in, loading it if needed. */
export function setI18nLocale(locale: TranslatedLocale): void {
  if (!loadedLocales.has(locale)) {
    _i18n.store({ [locale]: translationLoaders[locale]() })
    loadedLocales.add(locale)
  }
  _i18n.locale = locale
}

// Set up the language and date conventions before anything renders, and for
// runtimes that never mount the app (widget refresh, background tasks).
type BootLocalePreferences = {
  locale?: string
  formatRegion?: string
  startOfWeek?: number
  timeFormat?: TimeFormat
  dateOrder?: DateOrder
}

try {
  const state =
    (readBootPreferences() as { state?: BootLocalePreferences } | null)
      ?.state ?? {}
  const rawLocale = state.locale ?? getLocales()[0].languageTag.toLowerCase() // Guaranteed to return at least one element
  const { locale: localeOrFallback } = handleLangFallback(rawLocale)
  setI18nLocale(localeOrFallback)
  const locale = formatLocaleForMoment(localeOrFallback)
  // Sets moment.locale to the Language and overlays the Format Region's
  // conventions (ADR 0006). Reads the raw persisted blob pre-migration, so a
  // legacy `startOfWeek: 0` may briefly act as an explicit override until
  // `useUserLocalePrefs` re-applies post-hydration.
  applyFormatRegion({
    language: locale,
    region: state.formatRegion ?? undefined,
    startOfWeekOverride: state.startOfWeek ?? undefined,
    timeFormatOverride: state.timeFormat ?? undefined,
    dateOrderOverride: state.dateOrder ?? undefined,
  })
} catch (err) {
  applyFormatRegion({ language: DEFAULT_LOCALE })
}

export function handleLangFallback(locale: string): {
  locale: TranslatedLocale
  languageFound: boolean
  fallback: boolean
} {
  const userLanguage = locale.slice(0, locale.lastIndexOf('-')) // Guaranteed
  const validTranslationLocales: string[] = translatedLocales
  let languageFound = false
  let fallback = false

  if (validTranslationLocales.includes(locale)) {
    languageFound = true
  } else if (validTranslationLocales.some((t) => t.includes(userLanguage))) {
    const languageWithMismatchRegion = validTranslationLocales.find((t) =>
      t.includes(userLanguage)
    )
    // Locale is invalid -- but we found a translation with the same language. The region is incorrect.
    if (languageWithMismatchRegion) {
      languageFound = true
      fallback = true
      locale = languageWithMismatchRegion
    }
  } else {
    // No locale translation, or fallback language was found. Falling back to en-us.
    fallback = true
    locale = 'en-us'
  }

  const guaranteedLocale = locale as TranslatedLocale // Because we check all conditions or fallback to a valid locale, this is guaranteed to return a locale that is valid.
  return { locale: guaranteedLocale, languageFound, fallback }
}

export function formatLocaleForMoment(locale: string) {
  return locale
    .replace('zh-hans', 'zh') // moment isn't expecting -han[s/t]
    .replace('zh-hant', 'zh') // moment isn't expecting -han[s/t]
}

type IsObject<T> = T extends object ? true : false

type DeepKeyOf<T> = T extends object
  ? {
      [K in keyof T]: `${K & string}${IsObject<T[K]> extends true
        ? '.'
        : ''}${DeepKeyOf<T[K]>}`
    }[keyof T]
  : ''

/**
 * Key or deep key of translation object.
 *
 * `en.json`:
 *
 * ```json
 * {
 *   "key1": {
 *     "key2": {
 *       "key3": "Hello World"
 *     },
 *     "foo": "bar"
 *   }
 * }
 * ```
 *
 * @example
 *   i18n.t('key1.key2.key3') // returns "Hello World"
 *   i18n.t('key1.foo') // returns "bar"
 */
export type TranslationKey = DeepKeyOf<typeof enUS>

const i18n = {
  t: (key: TranslationKey, options?: TranslateOptions | undefined) => {
    return _i18n.t(key, options)
  },
}

export default i18n
