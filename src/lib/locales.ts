import { I18n, TranslateOptions } from 'i18n-js'
import deDE from '../locales/de-DE.json'
import esES from '../locales/es-ES.json'
import esMX from '../locales/es-MX.json'
import enUS from '../locales/en-US.json'
import frFR from '../locales/fr-FR.json'
import itIT from '../locales/it-IT.json'
import jaJP from '../locales/ja-JP.json'
import koKR from '../locales/ko-KR.json'
import nlNL from '../locales/nl-NL.json'
import ruRU from '../locales/ru-RU.json'
import ptBR from '../locales/pt-BR.json'
import ptPT from '../locales/pt-PT.json'
import viVN from '../locales/vi-VN.json'
import zhTW from '../locales/zh-TW.json'
import zhCN from '../locales/zh-CN.json'
import swKE from '../locales/sw-KE.json'
import ukUA from '../locales/uk-UA.json'
import rwRW from '../locales/rw-RW.json'
import bemZM from '../locales/bem-ZM.json'

import 'moment/locale/en-au'
import 'moment/locale/en-ca'
import 'moment/locale/en-gb'
import 'moment/locale/en-ie'
import 'moment/locale/en-il'
import 'moment/locale/en-nz'
import 'moment/locale/en-sg'
import 'moment/locale/de-at'
import 'moment/locale/de-ch'
import 'moment/locale/de'
import 'moment/locale/fr-ca'
import 'moment/locale/fr-ch'
import 'moment/locale/fr'
import 'moment/locale/it'
import 'moment/locale/it-ch'
import 'moment/locale/ja'
import 'moment/locale/ko'
import 'moment/locale/pt'
import 'moment/locale/pt-br'
import 'moment/locale/ru'
import 'moment/locale/vi'
import 'moment/locale/nl-be'
import 'moment/locale/nl'
import 'moment/locale/es'
import 'moment/locale/zh-cn'
import 'moment/locale/zh-tw'
import 'moment/locale/es-do'
import 'moment/locale/es-mx'
import 'moment/locale/es-us'
import 'moment/locale/es'
import 'moment/locale/sw'
import 'moment/locale/uk'

export const translations = {
  'en-us': enUS,
  'de-de': deDE,
  'es-mx': esMX,
  'es-es': esES,
  'fr-fr': frFR,
  'it-it': itIT,
  'ja-jp': jaJP,
  'ko-kr': koKR,
  'nl-nl': nlNL,
  'pt-br': ptBR,
  'pt-pt': ptPT,
  'ru-ru': ruRU,
  'vi-vn': viVN,
  'zh-hant-tw': zhTW, // Traditional
  'zh-hans-cn': zhCN, // Simplified
  'sw-ke': swKE,
  'uk-ua': ukUA,
  'bem-zm': bemZM, // Bemba
  'rw-rw': rwRW,
} as const
export type TranslatedLocale = keyof typeof translations

export const translationsLabels: { [K in TranslatedLocale]: string } = {
  'en-us': 'English',
  'de-de': 'Deutsch',
  'es-mx': 'Español (Mexico)',
  'es-es': 'Español (España)',
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

export const _i18n = new I18n(translations)
_i18n.enableFallback = true
export const DEFAULT_LOCALE = 'en-us'
_i18n.defaultLocale = DEFAULT_LOCALE

export function handleLangFallback(locale: string): {
  locale: TranslatedLocale
  languageFound: boolean
  fallback: boolean
} {
  const userLanguage = locale.slice(0, locale.lastIndexOf('-')) // Guaranteed
  const validTranslationLocales = Object.keys(translations)
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
