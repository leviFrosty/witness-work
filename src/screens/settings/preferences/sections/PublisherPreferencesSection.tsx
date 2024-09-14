import { View } from 'react-native'
import i18n from '../../../../lib/locales'
import Section from '../../../../components/inputs/Section'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import PublisherTypeSelector from '../../../../components/PublisherTypeSelector'
import AnnualGoalSelector from '../../../../components/AnnualGoalSelector'
import { usePreferences } from '../../../../stores/preferences'
import Text from '../../../../components/MyText'
import useTheme from '../../../../contexts/theme'
import Card from '../../../../components/Card'
import Divider from '../../../../components/Divider'

const PublisherPreferencesSection = () => {
  const { publisher } = usePreferences()
  const theme = useTheme()

  return (
    <View style={{ gap: 5 }}>
      {publisher === 'publisher' && (
        <>
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              <Text
                style={{
                  fontSize: theme.fontSize('lg'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('lookingForViewHours')}
              </Text>
              <Text style={{}}>
                {i18n.t('lookingForViewHours_description')}
              </Text>
            </Card>
          </View>
          <Divider marginVertical={10} />
        </>
      )}
      {publisher === 'custom' && (
        <>
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              <Text
                style={{
                  fontSize: theme.fontSize('lg'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('dontWantGoal')}
              </Text>
              <Text>{i18n.t('dontWantGoal_description')}</Text>
            </Card>
          </View>
          <Divider marginVertical={10} />
        </>
      )}
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
