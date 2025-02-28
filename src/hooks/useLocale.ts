import { getLocales } from 'expo-localization'
import { useEffect, useState } from 'react'
import {
  _i18n,
  DEFAULT_LOCALE,
  handleLangFallback,
  TranslatedLocale,
} from '../lib/locales'
import { usePreferences } from '../stores/preferences'
import { LocaleConfig } from 'react-native-calendars'
import moment from 'moment'

export default function useUserLocalePrefs() {
  const { locale } = usePreferences()
  const [loadedLocale, setLoadedLocale] =
    useState<TranslatedLocale>(DEFAULT_LOCALE)
  const [languageFound, setLanguageFound] = useState(false)
  const [isFallback, setIsFallback] = useState(false)

  // Loads in the user's locale preference or falls back to device's default locale
  useEffect(() => {
    const rawLocale = locale ?? getLocales()[0].languageTag.toLowerCase() // Guaranteed to return at least one element
    const {
      locale: localeOrFallback,
      fallback,
      languageFound,
    } = handleLangFallback(rawLocale)

    setLanguageFound(languageFound)
    setIsFallback(fallback)
    setLoadedLocale(localeOrFallback)

    _i18n.locale = localeOrFallback
    LocaleConfig.locales[localeOrFallback] = {
      monthNames: moment.months(),
      monthNamesShort: moment.monthsShort(),
      dayNames: moment.weekdays(),
      dayNamesShort: moment.weekdaysShort(),
    }
    LocaleConfig.defaultLocale = localeOrFallback
  }, [locale])

  return { loadedLocale, languageFound, isFallback }
}
