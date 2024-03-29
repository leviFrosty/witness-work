import { View } from 'react-native'
import i18n from '../../../../lib/locales'
import Section from '../../../../components/inputs/Section'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import PublisherTypeSelector from '../../../../components/PublisherTypeSelector'
import AnnualGoalSelector from '../../../../components/AnnualGoalSelector'
import { usePreferences } from '../../../../stores/preferences'

const PublisherPreferencesSection = () => {
  const { publisher } = usePreferences()

  return (
    <View style={{ gap: 3 }}>
      <Section>
        <InputRowContainer
          label={i18n.t('status')}
          lastInSection={publisher === 'publisher'}
        >
          <View style={{ flex: 1 }}>
            <PublisherTypeSelector />
          </View>
        </InputRowContainer>
        {publisher !== 'publisher' && (
          <InputRowContainer label={i18n.t('annualGoal')} lastInSection>
            <View style={{ flex: 1 }}>
              <AnnualGoalSelector />
            </View>
          </InputRowContainer>
        )}
      </Section>
    </View>
  )
}

export default PublisherPreferencesSection
