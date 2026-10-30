/** The app's locale codes, used verbatim in URLs and bundles. */
export const HELP_LOCALES = [
  'en-US',
  'ar',
  'bem-ZM',
  'de-DE',
  'es-ES',
  'fr-FR',
  'it-IT',
  'ja-JP',
  'ko-KR',
  'nl-NL',
  'pt-BR',
  'pt-PT',
  'ru-RU',
  'rw-RW',
  'sw-KE',
  'uk-UA',
  'vi-VN',
  'zh-CN',
  'zh-TW',
] as const

export type HelpLocale = (typeof HELP_LOCALES)[number]

export const DEFAULT_LOCALE: HelpLocale = 'en-US'

/** Each locale's name in its own language, for the language switcher. */
export const LOCALE_NAMES: Record<HelpLocale, string> = {
  'en-US': 'English',
  ar: 'العربية',
  'bem-ZM': 'Ichibemba',
  'de-DE': 'Deutsch',
  'es-ES': 'Español',
  'fr-FR': 'Français',
  'it-IT': 'Italiano',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'nl-NL': 'Nederlands',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  'ru-RU': 'Русский',
  'rw-RW': 'Kinyarwanda',
  'sw-KE': 'Kiswahili',
  'uk-UA': 'Українська',
  'vi-VN': 'Tiếng Việt',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
}

const RTL_LOCALES = new Set<string>(['ar'])

export const isHelpLocale = (value: string): value is HelpLocale =>
  (HELP_LOCALES as readonly string[]).includes(value)

export const localeDirection = (locale: HelpLocale): 'rtl' | 'ltr' =>
  RTL_LOCALES.has(locale) ? 'rtl' : 'ltr'
