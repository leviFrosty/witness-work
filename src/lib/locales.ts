import { getLocales } from 'expo-localization'
import { I18n, TranslateOptions } from 'i18n-js'
import de from '../locales/de.json'
import es from '../locales/es.json'
import en from '../locales/en.json'
import fr from '../locales/fr.json'
import it from '../locales/it.json'
import ja from '../locales/ja.json'
import ko from '../locales/ko.json'
import nl from '../locales/nl.json'
import ru from '../locales/ru.json'
import pt from '../locales/pt.json'
import vi from '../locales/vi.json'
import zhTW from '../locales/zh-tw.json'
import zhCN from '../locales/zh-cn.json'
import sw from '../locales/sw.json'
import uk from '../locales/uk.json'
import bemZM from '../locales/bem-zm.json'

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

const _i18n = new I18n({
  de,
  en,
  es,
  fr,
  it,
  ja,
  ko,
  nl,
  pt,
  ru,
  vi,
  'zh-tw': zhTW, // Traditional
  'zh-cn': zhCN, // Simplified
  sw,
  uk,
  'bem-zm': bemZM, // Bemba
})

let locale = getLocales()[0] // Guaranteed to return at least one element
  .languageTag!.toLowerCase()
  .replace('zh-hans', 'zh') // i18n or moment aren't expecting -han[s/t]
  .replace('zh-hant', 'zh') // i18n or moment aren't expecting -han[s/t]

if (locale.startsWith('zh')) {
  if (locale.endsWith('tw') || locale.endsWith('cn')) {
    // User's region correctly matches one of Chinese speaking lands
  } else {
    // User's region is something like zh-us, so we convert it to 'zh-cn' which defaults back to Simplified Chinese.
    locale = 'zh-cn'
  }
}
_i18n.locale = locale
_i18n.enableFallback = true
moment.locale(locale)

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
export type TranslationKey = DeepKeyOf<typeof en>

const i18n = {
  t: (key: TranslationKey, options?: TranslateOptions | undefined) => {
    return _i18n.t(key, options)
  },
}

export default i18n
