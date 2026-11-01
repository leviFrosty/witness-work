import { _i18n } from '@/lib/locales'

const JOINED_SCRIPT_LANGUAGES = new Set([
  'ar',
  'ckb',
  'fa',
  'ks',
  'ps',
  'sd',
  'syr',
  'ug',
  'ur',
])
const JOINED_SCRIPTS = new Set(['arab', 'syrc', 'nkoo', 'mong', 'adlm'])

export function isJoinedScriptLocale(locale: string): boolean {
  const [language, ...rest] = locale.toLowerCase().split(/[-_]/)
  if (rest.some((subtag) => subtag === 'latn' || subtag === 'cyrl'))
    return false
  return (
    JOINED_SCRIPT_LANGUAGES.has(language) ||
    rest.some((subtag) => JOINED_SCRIPTS.has(subtag))
  )
}

const cached = { locale: '', joined: false }

export function tracking<T>(value: T): T | undefined {
  if (_i18n.locale !== cached.locale) {
    cached.locale = _i18n.locale
    cached.joined = isJoinedScriptLocale(_i18n.locale)
  }
  return cached.joined ? undefined : value
}
