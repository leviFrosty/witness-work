import { Languages as LanguagesIcon } from 'lucide-react-native'
import { GroupedListPickerRow } from '@/components/ui/GroupedList'
import i18n, {
  resolveAppLocale,
  TranslatedLocale,
  translatedLocales,
  translationsLabels,
} from '@/lib/locales'
import { logger } from '@/lib/logger'
import { reloadApp } from '@/lib/hotUpdater'
import { syncLayoutDirection } from '@/lib/rtl'
import { usePreferences } from '@/stores/preferences'
import useUserLocalePrefs from '@/features/settings/hooks/useLocale'
import { getLocales } from 'expo-localization'

const DEVICE_DEFAULT = 'device'

export default function LanguageSelector() {
  const { set, locale } = usePreferences()
  const languageOptions = [
    { label: i18n.t('deviceDefault'), value: DEVICE_DEFAULT },
    ...translatedLocales.map((locale) => ({
      label: translationsLabels[locale],
      value: locale,
    })),
  ]

  const { loadedLocale, languageFound, isFallback } = useUserLocalePrefs()

  function handleChange(value: string) {
    const locale =
      value === DEVICE_DEFAULT ? undefined : (value as TranslatedLocale)
    set({ locale })

    syncLayoutDirection(resolveAppLocale(locale))
    reloadApp().catch((err: unknown) =>
      logger.error('[LanguageSelector] reload failed', err)
    )
  }

  return (
    <GroupedListPickerRow
      icon={LanguagesIcon}
      label={i18n.t('language')}
      options={languageOptions}
      value={locale ?? DEVICE_DEFAULT}
      onChange={handleChange}
      sublabel={
        isFallback
          ? i18n.t(
              languageFound
                ? 'languageFoundButIsFallbackLocale'
                : 'languageWasNotFound',
              {
                original: getLocales()[0].languageTag.toLocaleLowerCase(),
                fallback: loadedLocale,
              }
            )
          : undefined
      }
    />
  )
}
