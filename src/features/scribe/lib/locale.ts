import { getLocales } from 'expo-localization'
import { appLanguage } from '@/lib/numbers'

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

export const appLocale = (): string => toBcp47(appLanguage())

export const deviceLocales = (): string[] => {
  try {
    return getLocales().map((locale) => locale.languageTag)
  } catch {
    return []
  }
}

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
