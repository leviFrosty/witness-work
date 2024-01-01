import { Switch, View } from 'react-native'
import i18n from '../../../../lib/locales'
import SectionTitle from '../../shared/SectionTitle'
import Section from '../../../../components/inputs/Section'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import { usePreferences } from '../../../../stores/preferences'

const DetailedProgressBar = () => {
  const { displayDetailsOnProgressBarHomeScreen, publisher, set } =
    usePreferences()

  if (publisher === 'publisher') return null

  return (
    <InputRowContainer
      label={i18n.t('detailedProgressBar')}
      lastInSection
      style={{ justifyContent: 'space-between' }}
    >
      <Switch
        value={displayDetailsOnProgressBarHomeScreen}
        onValueChange={(value) =>
          set({ displayDetailsOnProgressBarHomeScreen: value })
        }
      />
    </InputRowContainer>
  )
}

const HomeScreenPreferencesSection = () => {
  const { publisher } = usePreferences()

  // remove this check if additional preferences are added that apply to all publisher types
  if (publisher === 'publisher') return null

  return (
    <View style={{ gap: 3 }}>
      <SectionTitle text={i18n.t('homeScreen')} />
      <Section>
        <DetailedProgressBar />
      </Section>
    </View>
  )
}

export default HomeScreenPreferencesSection
