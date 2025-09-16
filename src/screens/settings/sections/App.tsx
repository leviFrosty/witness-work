import { View } from 'react-native'
import i18n from '../../../lib/locales'
import Section from '../../../components/inputs/Section'
import InputRowButton from '../../../components/inputs/InputRowButton'
import {
  faChevronRight,
  faClock,
  faDownload,
  faFileExport,
  faSeedling,
  faUndo,
} from '@fortawesome/free-solid-svg-icons'
import IconButton from '../../../components/IconButton'
import { fetchUpdate } from '../../../lib/updates'
import SectionTitle from '../shared/SectionTitle'
import { SettingsSectionProps } from '../settingScreen'
import { usePreferences } from '../../../stores/preferences'

const AppSection = ({ handleNavigate }: SettingsSectionProps) => {
  const { set } = usePreferences()
  return (
    <View style={{ gap: 3 }}>
      <SectionTitle text={i18n.t('app')} />
      <Section>
        <InputRowButton
          leftIcon={faUndo}
          label={i18n.t('recoverContacts')}
          onPress={() => handleNavigate('Recover Contacts')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faClock}
          label={i18n.t('dismissedContacts')}
          onPress={() => handleNavigate('Dismissed Contacts')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faFileExport}
          label={i18n.t('backupAndRestore')}
          onPress={() => handleNavigate('Import and Export')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faDownload}
          label={i18n.t('checkForUpdate')}
          onPress={() => fetchUpdate(handleNavigate)}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faSeedling}
          label={i18n.t('restartOnboarding')}
          onPress={() => set({ onboardingComplete: false })}
          lastInSection
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
      </Section>
    </View>
  )
}

export default AppSection
