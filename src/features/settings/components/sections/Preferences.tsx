import { View } from 'react-native'
import Section from '../../../../components/inputs/Section'
import InputRowButton from '../../../../components/inputs/InputRowButton'
import {
  faChevronRight,
  faCircleHalfStroke,
  faCog,
  faPalette,
  faUser,
} from '@fortawesome/free-solid-svg-icons'
import i18n from '../../../../lib/locales'
import IconButton from '../../../../components/IconButton'
import { SettingsSectionProps } from '../../screens/settingScreen'
import LanguageSelector from './LanguageSelector'

const PreferencesSection = ({ handleNavigate }: SettingsSectionProps) => {
  return (
    <View style={{ gap: 3 }}>
      <Section>
        <LanguageSelector />
      </Section>
      <View style={{ height: 12 }} />
      <Section>
        <InputRowButton
          leftIcon={faCircleHalfStroke}
          label={i18n.t('appearance')}
          onPress={() => handleNavigate('PreferencesAppearance')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faPalette}
          label={i18n.t('personalization')}
          onPress={() => handleNavigate('PreferencesPersonalization')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faUser}
          label={i18n.t('publisher')}
          onPress={() => handleNavigate('PreferencesPublisher')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
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
