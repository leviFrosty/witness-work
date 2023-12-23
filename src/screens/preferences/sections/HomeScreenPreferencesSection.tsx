import { Switch, View } from 'react-native'
import i18n from '../../../lib/locales'
import SettingsSectionTitle from '../../settings/shared/SettingsSectionTitle'
import Section from '../../../components/inputs/Section'
import InputRowContainer from '../../../components/inputs/InputRowContainer'
import { usePreferences } from '../../../stores/preferences'

const HomeScreenPreferencesSection = () => {
  const { displayDetailsOnProgressBarHomeScreen, set } = usePreferences()

  return (
    <View style={{ gap: 3 }}>
      <SettingsSectionTitle text={i18n.t('homeScreen')} />
      <Section>
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
      </Section>
    </View>
  )
}

export default HomeScreenPreferencesSection
