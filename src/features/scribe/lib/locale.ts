import { getLocales } from 'expo-localization'
import { appLanguage } from '@/lib/numbers'

/**
 * An i18n locale (`en-us`, `zh-hant-tw`) as BCP-47 (`en-US`, `zh-Hant-TW`),
 * which the native recognizers and the model match against.
 */
export const toBcp47 = (locale: string): string =>
  locale
    .split(/[-_]/)
    .filter(Boolean)
    .map((part, index) => {
      if (index === 0) return part.toLowerCase()
      if (part.length === 4)
        return part[0].toUpperCase() + part.slice(1).toLowerCase()
      return part.toUpperCase()
    })
    .join('-')

/** The app Language as BCP-47: the model replies in it. */
export const appLocale = (): string => toBcp47(appLanguage())

/** The device's languages, BCP-47, in the User's order. */
export const deviceLocales = (): string[] => {
  try {
    return getLocales().map((locale) => locale.languageTag)
  } catch {
    return []
  }
}

/** The app Language, then the device's languages, without repeats. */
export const speechLocaleCandidates = (): string[] => [
  ...new Set([appLocale(), ...deviceLocales()]),
]

export const deviceTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
