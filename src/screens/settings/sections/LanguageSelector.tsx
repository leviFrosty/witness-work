import { View } from 'react-native'
import InputRowContainer from '../../../components/inputs/InputRowContainer'
import i18n, {
  TranslatedLocale,
  translations,
  translationsLabels,
} from '../../../lib/locales'
import Select from '../../../components/Select'
import { usePreferences } from '../../../stores/preferences'
import useUserLocalePrefs from '../../../hooks/useLocale'
import Text from '../../../components/MyText'
import { getLocales } from 'expo-localization'
import useTheme from '../../../contexts/theme'
import * as Updates from 'expo-updates'
import { faLanguage } from '@fortawesome/free-solid-svg-icons'

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
    Updates.reloadAsync()
  }

  return (
    <InputRowContainer
      leftIcon={faLanguage}
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
