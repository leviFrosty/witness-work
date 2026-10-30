import { I18n, TranslateOptions } from 'i18n-js'
import enUS from '@/locales/en-US.json'
import { translationLoaders } from '@/lib/translationLoaders'
import { getLocales } from 'expo-localization'
import { applyFormatRegion, type DateOrder, type TimeFormat } from '@/lib/dates'
import { readBootPreferences } from '@/stores/bootPreferences'
import * as cardinals from 'make-plural/cardinals'
import { createPluralizer, type CardinalRule } from '@/lib/plurals'
import { digitSystemFor, localizeNumeral } from '@/lib/digits'

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
  ar: 'العربية',
} as const

// CLDR cardinal plural rules: which of zero/one/two/few/many/other a count
// takes in each Language. The translate-locales lint checks every locale file
// against the same rules (`.agents/skills/translate-locales/locales.mjs`).
const pluralRules: { [K in TranslatedLocale]: CardinalRule } = {
  'en-us': cardinals.en,
  'de-de': cardinals.de,
  'es-es': cardinals.es,
  'fr-fr': cardinals.fr,
  'it-it': cardinals.it,
  'ja-jp': cardinals.ja,
  'ko-kr': cardinals.ko,
  'nl-nl': cardinals.nl,
  'pt-br': cardinals.pt,
  'pt-pt': cardinals.pt_PT,
  'ru-ru': cardinals.ru,
  'vi-vn': cardinals.vi,
  'zh-hant-tw': cardinals.zh,
  'zh-hans-cn': cardinals.zh,
  'sw-ke': cardinals.sw,
  'uk-ua': cardinals.uk,
  'bem-zm': cardinals.bem,
  // CLDR has no Kinyarwanda rules; it counts one/other like English.
  'rw-rw': cardinals.en,
  ar: cardinals.ar,
}

export const DEFAULT_LOCALE = 'en-us'
export const _i18n = new I18n({ [DEFAULT_LOCALE]: enUS })
_i18n.enableFallback = true
_i18n.defaultLocale = DEFAULT_LOCALE
for (const locale of translatedLocales)
  _i18n.pluralization.register(locale, createPluralizer(pluralRules[locale]))

// Numbers passed to `i18n.t` (`count`, `year`, …) print in the digits of the
// Language being translated into (`options.locale`, else the app's): `{{count}}
// ساعة` reads `٣ ساعة` in Arabic, and so does a string that falls back to
// English (`digitsLocale`, set by `i18n.t` below). Strings pass through as
// given, so names and pre-formatted values aren't touched. i18n-js
// interpolates array translations without this hook; none of ours are arrays.
const interpolate = _i18n.interpolate
_i18n.interpolate = (i18n, message, options) => {
  const requested = options.digitsLocale ?? options.locale
  const locale = typeof requested === 'string' ? requested : i18n.locale
  if (digitSystemFor(locale) === 'latn')
    return interpolate(i18n, message, options)
  const localized: typeof options = {}
  for (const [name, value] of Object.entries(options))
    localized[name] =
      typeof value === 'number' ? localizeNumeral(String(value), locale) : value
  return interpolate(i18n, message, localized)
}

const loadedLocales = new Set<TranslatedLocale>([DEFAULT_LOCALE])
const loading: Promise<void>[] = []

/**
 * Makes `locale` the language `i18n.t` answers in, loading it if needed. On the
 * web its translations arrive later; see `translationsLoaded`.
 */
export function setI18nLocale(locale: TranslatedLocale): void {
  if (!loadedLocales.has(locale)) {
    loadedLocales.add(locale)
    const translations = translationLoaders[locale]()
    if (translations instanceof Promise)
      loading.push(
        translations.then((loaded) => _i18n.store({ [locale]: loaded }))
      )
    else _i18n.store({ [locale]: translations })
  }
  _i18n.locale = locale
}

/** Settles once every language asked for so far has loaded (web only). */
export const translationsLoaded = () => Promise.all(loading)

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
  const localeOrFallback = resolveAppLocale(state.locale)
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
  const tag = locale.toLowerCase().replace(/_/g, '-')
  const exact = translatedLocales.find((t) => t === tag)
  if (exact) return { locale: exact, languageFound: true, fallback: false }

  // Match on whole subtags: `ar` must not match `ja-jp`, nor `sw` `es-es`.
  const [language, ...rest] = tag.split('-')
  const sameLanguage = translatedLocales.filter(
    (t) => t.split('-')[0] === language
  )
  if (sameLanguage.length) {
    // Chinese also has to match its script. Without one, Taiwan, Hong Kong
    // and Macau write Traditional and everywhere else Simplified.
    const script =
      rest.find((subtag) => subtag.length === 4) ??
      (language === 'zh'
        ? rest.some((r) => r === 'tw' || r === 'hk' || r === 'mo')
          ? 'hant'
          : 'hans'
        : undefined)
    const match =
      (script &&
        sameLanguage.find((t) => t.split('-').slice(1).includes(script))) ||
      sameLanguage[0]
    // A translation without a region (`ar`) is the one for every country, so
    // `ar-eg` isn't falling back to anything.
    return { locale: match, languageFound: true, fallback: match !== language }
  }

  // No translation in this language: fall back to English.
  return { locale: DEFAULT_LOCALE, languageFound: false, fallback: true }
}

/**
 * The Language the app runs in: the user's pick in Settings, else the device's
 * first language, resolved to a translation we ship.
 */
export function resolveAppLocale(preferred?: string): TranslatedLocale {
  return handleLangFallback(
    preferred ?? getLocales()[0].languageTag.toLowerCase() // Guaranteed to return at least one element
  ).locale
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

/** Whether `locale`'s own translations have `key`, without English fallback. */
function hasOwnTranslation(locale: string, key: string): boolean {
  let node: unknown = _i18n.translations[locale]
  for (const part of key.split(_i18n.defaultSeparator)) {
    if (node === null || typeof node !== 'object') return false
    node = (node as Record<string, unknown>)[part]
  }
  return node !== undefined && node !== null
}

const i18n = {
  t: (key: TranslationKey, options?: TranslateOptions | undefined) => {
    // An untranslated plural falls back to the English strings, so it has to
    // pick among them by English rules too. Russian's `one` for 21 or French's
    // `one` for 0 would otherwise render "21 photo" and "0 photo".
    if (
      options?.count !== undefined &&
      !('locale' in options) &&
      _i18n.locale !== DEFAULT_LOCALE &&
      !hasOwnTranslation(_i18n.locale, key)
    )
      return _i18n.t(key, {
        ...options,
        locale: DEFAULT_LOCALE,
        // English words, but the app Language's digits.
        digitsLocale: _i18n.locale,
      })
    return _i18n.t(key, options)
  },
}

export default i18n
