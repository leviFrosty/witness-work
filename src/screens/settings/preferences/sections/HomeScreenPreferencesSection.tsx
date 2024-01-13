import { Switch, View } from 'react-native'
import i18n from '../../../../lib/locales'
import SectionTitle from '../../shared/SectionTitle'
import Section from '../../../../components/inputs/Section'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import { usePreferences } from '../../../../stores/preferences'
import usePublisher from '../../../../hooks/usePublisher'

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

const HideDonateHeart = () => {
  const { hideDonateHeart, set } = usePreferences()
  const { status } = usePublisher()

  const lastInSection = status === 'publisher'

  return (
    <InputRowContainer
      lastInSection={lastInSection}
      label={i18n.t('hideDonateHeart')}
      style={{ justifyContent: 'space-between' }}
    >
      <Switch
        value={hideDonateHeart}
        onValueChange={(value) => set({ hideDonateHeart: value })}
      />
    </InputRowContainer>
  )
}

const HomeScreenPreferencesSection = () => {
  return (
    <View style={{ gap: 3 }}>
      <SectionTitle text={i18n.t('homeScreen')} />
      <Section>
        <HideDonateHeart />
        <DetailedProgressBar />
      </Section>
    </View>
  )
}

export default HomeScreenPreferencesSection
