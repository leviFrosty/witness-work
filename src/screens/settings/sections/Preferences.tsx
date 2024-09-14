import { View } from 'react-native'
import Section from '../../../components/inputs/Section'
import InputRowButton from '../../../components/inputs/InputRowButton'
import { faChevronRight, faCog } from '@fortawesome/free-solid-svg-icons'
import i18n from '../../../lib/locales'
import IconButton from '../../../components/IconButton'
import { SettingsSectionProps } from '../settingScreen'

const PreferencesSection = ({ handleNavigate }: SettingsSectionProps) => {
  return (
    <View style={{ gap: 3 }}>
      <Section>
        <InputRowButton
          leftIcon={faCog}
          label={i18n.t('preferences')}
          onPress={() => handleNavigate('Preferences')}
          lastInSection
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
      </Section>
    </View>
  )
}
export default PreferencesSection
