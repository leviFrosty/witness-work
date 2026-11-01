import { I18n, TranslateOptions } from 'i18n-js'
import enUS from '@/locales/en-US.json'
import { getLocales } from 'expo-localization'
import { applyFormatRegion, type DateOrder, type TimeFormat } from '@/lib/dates'
import { readBootPreferences } from '@/stores/bootPreferences'
import * as cardinals from 'make-plural/cardinals'
import { createPluralizer, type CardinalRule } from '@/lib/plurals'
import { digitSystemFor, localizeNumeral } from '@/lib/digits'

type Translations = typeof enUS

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
  'zh-hant-tw': () => require('../locales/zh-TW.json'),
  'zh-hans-cn': () => require('../locales/zh-CN.json'),
  'sw-ke': () => require('../locales/sw-KE.json'),
  'uk-ua': () => require('../locales/uk-UA.json'),
  'bem-zm': () => require('../locales/bem-ZM.json'),
  'rw-rw': () => require('../locales/rw-RW.json'),
  ar: () => require('../locales/ar.json'),
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
  ar: 'العربية',
} as const

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

  'rw-rw': cardinals.en,
  ar: cardinals.ar,
}

export const DEFAULT_LOCALE = 'en-us'
export const _i18n = new I18n({ [DEFAULT_LOCALE]: enUS })
_i18n.enableFallback = true
_i18n.defaultLocale = DEFAULT_LOCALE
for (const locale of translatedLocales)
  _i18n.pluralization.register(locale, createPluralizer(pluralRules[locale]))

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

export function setI18nLocale(locale: TranslatedLocale): void {
  if (!loadedLocales.has(locale)) {
    _i18n.store({ [locale]: translationLoaders[locale]() })
    loadedLocales.add(locale)
  }
  _i18n.locale = locale
}

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

  const [language, ...rest] = tag.split('-')
  const sameLanguage = translatedLocales.filter(
    (t) => t.split('-')[0] === language
  )
  if (sameLanguage.length) {
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

    return { locale: match, languageFound: true, fallback: match !== language }
  }

  return { locale: DEFAULT_LOCALE, languageFound: false, fallback: true }
}

export function resolveAppLocale(preferred?: string): TranslatedLocale {
  return handleLangFallback(
    preferred ?? getLocales()[0].languageTag.toLowerCase()
  ).locale
}

export function formatLocaleForMoment(locale: string) {
  return locale.replace('zh-hans', 'zh').replace('zh-hant', 'zh')
}

type DeepKeyOf<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ?
            | `${K}.${DeepKeyOf<T[K]>}`
            | (T[K] extends { one: string; other: string } ? K : never)
        : K
    }[keyof T & string]
  : ''

export type TranslationKey = DeepKeyOf<typeof enUS>

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
    if (
      options?.count !== undefined &&
      !('locale' in options) &&
      _i18n.locale !== DEFAULT_LOCALE &&
      !hasOwnTranslation(_i18n.locale, key)
    )
      return _i18n.t(key, {
        ...options,
        locale: DEFAULT_LOCALE,

        digitsLocale: _i18n.locale,
      })
    return _i18n.t(key, options)
  },
}

export default i18n
