import type { TranslatedLocale } from '@/lib/locales'
import type { HelpLocale } from '@/features/updates/types/helpCenter'

export const DEFAULT_HELP_LOCALE: HelpLocale = 'en-US'

/** The Help Center locale for each app language (its locale file's name). */
export const helpLocales = {
  'en-us': 'en-US',
  'de-de': 'de-DE',
  'es-es': 'es-ES',
  'fr-fr': 'fr-FR',
  'it-it': 'it-IT',
  'ja-jp': 'ja-JP',
  'ko-kr': 'ko-KR',
  'nl-nl': 'nl-NL',
  'pt-br': 'pt-BR',
  'pt-pt': 'pt-PT',
  'ru-ru': 'ru-RU',
  'vi-vn': 'vi-VN',
  'zh-hant-tw': 'zh-TW',
  'zh-hans-cn': 'zh-CN',
  'sw-ke': 'sw-KE',
  'uk-ua': 'uk-UA',
  'bem-zm': 'bem-ZM',
  'rw-rw': 'rw-RW',
  ar: 'ar',
} as const satisfies Record<TranslatedLocale, HelpLocale>

/** The Help Center locale for the app's `locale`; English when unknown. */
export const helpLocaleFor = (locale: string): HelpLocale =>
  (helpLocales as Record<string, HelpLocale>)[locale.toLowerCase()] ??
  DEFAULT_HELP_LOCALE
