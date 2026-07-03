import { View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight'
import { faCircleHalfStroke } from '@fortawesome/free-solid-svg-icons/faCircleHalfStroke'
import { faCog } from '@fortawesome/free-solid-svg-icons/faCog'
import { faPalette } from '@fortawesome/free-solid-svg-icons/faPalette'
import { faUser } from '@fortawesome/free-solid-svg-icons/faUser'
import i18n from '@/lib/locales'
import IconButton from '@/components/ui/IconButton'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'
import LanguageSelector from '@/features/settings/components/sections/LanguageSelector'

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
