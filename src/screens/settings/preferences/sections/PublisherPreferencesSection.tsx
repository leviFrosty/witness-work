import { View } from 'react-native'
import i18n from '../../../../lib/locales'
import Section from '../../../../components/inputs/Section'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import PublisherTypeSelector from '../../../../components/PublisherTypeSelector'

const PublisherPreferencesSection = () => {
  return (
    <View style={{ gap: 3 }}>
      <Section>
        <InputRowContainer label={i18n.t('status')} lastInSection>
          <View style={{ flex: 1 }}>
            <PublisherTypeSelector />
          </View>
        </InputRowContainer>
      </Section>
    </View>
  )
}

export default PublisherPreferencesSection
