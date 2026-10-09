import { getLocales } from 'expo-localization'
import { useEffect, useState } from 'react'
import {
  DEFAULT_LOCALE,
  formatLocaleForMoment,
  handleLangFallback,
  setI18nLocale,
  TranslatedLocale,
} from '@/lib/locales'
import { applyFormatRegion } from '@/lib/dates'
import { usePreferences } from '@/stores/preferences'
import { LocaleConfig } from 'react-native-calendars'
import moment from 'moment'
import { useShallow } from 'zustand/react/shallow'

export default function useUserLocalePrefs() {
  const { locale, formatRegion, startOfWeek, timeFormat, dateOrder } =
    usePreferences(
      useShallow((s) => ({
        locale: s.locale,
        formatRegion: s.formatRegion,
        startOfWeek: s.startOfWeek,
        timeFormat: s.timeFormat,
        dateOrder: s.dateOrder,
      }))
    )
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

    setI18nLocale(localeOrFallback)
    // Re-apply Language + Format Region to moment on every change so date
    // conventions track the preferences live (ADR 0006).
    applyFormatRegion({
      language: formatLocaleForMoment(localeOrFallback),
      region: formatRegion,
      startOfWeekOverride: startOfWeek,
      timeFormatOverride: timeFormat,
      dateOrderOverride: dateOrder,
    })
    LocaleConfig.locales[localeOrFallback] = {
      monthNames: moment.months(),
      monthNamesShort: moment.monthsShort(),
      dayNames: moment.weekdays(),
      dayNamesShort: moment.weekdaysShort(),
    }
    LocaleConfig.defaultLocale = localeOrFallback
  }, [locale, formatRegion, startOfWeek, timeFormat, dateOrder])

  return { loadedLocale, languageFound, isFallback }
}
