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

  useEffect(() => {
    const rawLocale = locale ?? getLocales()[0].languageTag.toLowerCase()
    const {
      locale: localeOrFallback,
      fallback,
      languageFound,
    } = handleLangFallback(rawLocale)

    setLanguageFound(languageFound)
    setIsFallback(fallback)
    setLoadedLocale(localeOrFallback)

    setI18nLocale(localeOrFallback)

    applyFormatRegion({
      language: formatLocaleForMoment(localeOrFallback),
      region: formatRegion,
      startOfWeekOverride: startOfWeek,
      timeFormatOverride: timeFormat,
      dateOrderOverride: dateOrder,
    })
  }, [locale, formatRegion, startOfWeek, timeFormat, dateOrder])

  return { loadedLocale, languageFound, isFallback }
}
