import { View } from 'react-native'
import i18n from '../../../lib/locales'
import Section from '../../../components/inputs/Section'
import InputRowButton from '../../../components/inputs/InputRowButton'
import {
  faChevronRight,
  faDownload,
  faHourglassHalf,
  faTools,
  faUndo,
} from '@fortawesome/free-solid-svg-icons'
import IconButton from '../../../components/IconButton'
import { fetchUpdate } from '../../../lib/updates'
import { usePreferences } from '../../../stores/preferences'
import { SettingsSectionProps } from '../SettingsScreen'
import SectionTitle from '../shared/SectionTitle'

const AppSection = ({ handleNavigate }: SettingsSectionProps) => {
  const { set } = usePreferences()

  const resetToOnboarding = () => {
    set({ onboardingComplete: false })
  }

  return (
    <View style={{ gap: 3 }}>
      <SectionTitle text={i18n.t('app')} />
      <Section>
        <InputRowButton
          leftIcon={faHourglassHalf}
          label={i18n.t('viewHours')}
          onPress={() => handleNavigate('Time Reports')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faUndo}
          label={i18n.t('recoverContacts')}
          onPress={() => handleNavigate('Recover Contacts')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faTools}
          label={i18n.t('restartOnboarding')}
          onPress={resetToOnboarding}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faDownload}
          label={i18n.t('checkForUpdate')}
          onPress={() => fetchUpdate(handleNavigate)}
          lastInSection
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
      </Section>
    </View>
  )
}

export default AppSection
