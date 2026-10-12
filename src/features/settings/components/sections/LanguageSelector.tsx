import { Languages as LanguagesIcon } from 'lucide-react-native'
import { GroupedListPickerRow } from '@/components/ui/GroupedList'
import i18n, {
  TranslatedLocale,
  translatedLocales,
  translationsLabels,
} from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import useUserLocalePrefs from '@/features/settings/hooks/useLocale'
import { getLocales } from 'expo-localization'
import * as Updates from 'expo-updates'
import { DevSettings } from 'react-native'

/** The picker's value for following the device's language. */
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
    set({
      locale:
        value === DEVICE_DEFAULT ? undefined : (value as TranslatedLocale),
    })
    if (__DEV__) {
      DevSettings.reload()
    } else {
      Updates.reloadAsync()
    }
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
