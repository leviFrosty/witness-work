import { _i18n } from '@/lib/locales'

// Languages written in a script whose letters join into words (Arabic and its
// relatives, Syriac), by language subtag; script subtags catch the rest
// (`pa-Arab`, `mn-Mong`). Spacing letters apart breaks the joins.
const JOINED_SCRIPT_LANGUAGES = new Set([
  'ar', // Arabic
  'ckb', // Central Kurdish (Sorani)
  'fa', // Persian
  'ks', // Kashmiri
  'ps', // Pashto
  'sd', // Sindhi
  'syr', // Syriac
  'ug', // Uyghur
  'ur', // Urdu
])
const JOINED_SCRIPTS = new Set(['arab', 'syrc', 'nkoo', 'mong', 'adlm'])

/** Whether `locale` is written in a script whose letters join (Arabic). */
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

/**
 * `letterSpacing` for the active app Language: `value` as given, or undefined
 * in a joined script, where spacing letters apart breaks words (Arabic). Use it
 * for every non-zero `letterSpacing`; `MyText` already applies it.
 */
export function tracking<T>(value: T): T | undefined {
  // Runs for every spaced `MyText`, so the check is kept per Language.
  if (_i18n.locale !== cached.locale) {
    cached.locale = _i18n.locale
    cached.joined = isJoinedScriptLocale(_i18n.locale)
  }
  return cached.joined ? undefined : value
}
