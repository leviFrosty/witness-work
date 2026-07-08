import { Languages as LanguagesIcon } from 'lucide-react-native'
import { View } from 'react-native'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import i18n, {
  TranslatedLocale,
  translations,
  translationsLabels,
} from '@/lib/locales'
import Select from '@/components/ui/Select'
import { usePreferences } from '@/stores/preferences'
import useUserLocalePrefs from '@/features/settings/hooks/useLocale'
import Text from '@/components/ui/MyText'
import { getLocales } from 'expo-localization'
import useTheme from '@/contexts/theme'
import * as Updates from 'expo-updates'
import { DevSettings } from 'react-native'

export default function LanguageSelector() {
  const { set, locale } = usePreferences()
  const theme = useTheme()
  const languageOptions: {
    label: string
    value: TranslatedLocale | null
  }[] = [
    { label: i18n.t('deviceDefault'), value: null },
    ...Object.keys(translations).map((locale) => ({
      label: translationsLabels[locale as TranslatedLocale],
      value: locale as TranslatedLocale,
    })),
  ]

  const { loadedLocale, languageFound, isFallback } = useUserLocalePrefs()

  function handleChange(value: TranslatedLocale | null) {
    set({ locale: value || undefined })
    if (__DEV__) {
      DevSettings.reload()
    } else {
      Updates.reloadAsync()
    }
  }

  return (
    <InputRowContainer
      leftIcon={LanguagesIcon}
      label={i18n.t('language')}
      style={{ justifyContent: 'space-between' }}
      lastInSection
    >
      <View style={{ flex: 1 }}>
        <Select
          data={languageOptions}
          value={locale}
          onChange={({ value }) => handleChange(value)}
          placeholder={translationsLabels[loadedLocale as TranslatedLocale]}
        />
        {isFallback && (
          <Text style={{ paddingTop: 5, fontSize: theme.fontSize('sm') }}>
            {i18n.t(
              languageFound
                ? 'languageFoundButIsFallbackLocale'
                : 'languageWasNotFound',
              {
                original: getLocales()[0].languageTag.toLocaleLowerCase(),
                fallback: loadedLocale,
              }
            )}
          </Text>
        )}
      </View>
    </InputRowContainer>
  )
}
