import { Platform, View } from 'react-native'
import Section from '../../../../components/inputs/Section'
import DefaultNavigationSelector from '../../../../components/DefaultNavigationSelector'

const NavigationPreferencesSection = () => {
  return (
    Platform.OS !== 'android' && (
      <View style={{ gap: 3 }}>
        <Section>
          <DefaultNavigationSelector />
        </Section>
      </View>
    )
  )
}

export default NavigationPreferencesSection
