import { Platform, View } from 'react-native'
import useTheme from '../../../contexts/theme'
import Text from '../../../components/MyText'
import i18n from '../../../lib/locales'
import Section from '../../../components/inputs/Section'
import DefaultNavigationSelector from '../../../components/DefaultNavigationSelector'

const NavigationPreferencesSection = () => {
  const theme = useTheme()

  return (
    Platform.OS !== 'android' && (
      <View style={{ gap: 3 }}>
        <Text
          style={{
            marginLeft: 20,
            fontFamily: theme.fonts.semiBold,
            fontSize: 12,
            color: theme.colors.textAlt,
            textTransform: 'uppercase',
          }}
        >
          {i18n.t('navigation')}
        </Text>
        <Section>
          <DefaultNavigationSelector />
        </Section>
      </View>
    )
  )
}

export default NavigationPreferencesSection
