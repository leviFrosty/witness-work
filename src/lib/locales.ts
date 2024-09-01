import { getLocales } from 'expo-localization'
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

import moment from 'moment'
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
import { usePreferences } from '../stores/preferences'
import { MinuteDisplayFormat } from '../types/serviceReport'
import _ from 'lodash'

const translations = {
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
}

const _i18n = new I18n(translations)

let locale = getLocales()[0] // Guaranteed to return at least one element
  .languageTag!.toLowerCase()

const userLanguage = locale.slice(0, locale.lastIndexOf('-')) // Guaranteed
const validTranslationLocales = Object.keys(translations)

if (validTranslationLocales.includes(locale)) {
  // Locale is valid.
} else if (validTranslationLocales.some((t) => t.includes(userLanguage))) {
  const languageWithMismatchRegion = validTranslationLocales.find((t) =>
    t.includes(userLanguage)
  )
  // Locale is invalid -- but we found a translation with the same language. The region is incorrect.
  if (languageWithMismatchRegion) {
    locale = languageWithMismatchRegion
  }
} else {
  // No locale translation, or fallback language was found. Falling back to en-us.
  // locale = 'en-us'
}
// If doesn't exist, see if user's language exists

_i18n.locale = locale
_i18n.enableFallback = true
_i18n.defaultLocale = 'en-us'
const momentLocale = locale
  .replace('zh-hans', 'zh') // moment isn't expecting -han[s/t]
  .replace('zh-hant', 'zh') // moment isn't expecting -han[s/t]

moment.locale(momentLocale)

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

/**
 * Formats minutes for display based on user preference.
 *
 * @example
 *   const formattedTime = formatMinute(minutes, preference)
 *
 *   return (<View>
 *   <Text>{formattedTime.long}</Text>
 *   <Text>{formattedTime.short}</Text>
 *   </View>)
 */
export const useFormattedMinutes = (minutes: number) => {
  const { timeDisplayFormat } = usePreferences()
  return formatMinutes(minutes, timeDisplayFormat)
}

export const formatMinutes = (
  totalMinutes: number,
  format: MinuteDisplayFormat
) => {
  let formatted: string
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  switch (format) {
    case 'decimal':
      formatted = _.round(totalMinutes / 60, 1).toString()
      break
    // case 'long':
    //   // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
    //   formatted = `${i18n.t('hoursLong', { count: hours })} ${i18n.t('minutesLong', { count: minutes })}`
    //   break
    case 'short':
      // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
      formatted = `${i18n.t('hoursShort', { count: hours })} ${i18n.t('minutesShort', { count: minutes })}`
  }

  return {
    formatted,
    minutes,
    hours,
  }
}
