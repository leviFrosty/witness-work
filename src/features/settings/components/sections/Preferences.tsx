import {
  ChevronRight as ChevronRightIcon,
  Contrast as ContrastIcon,
  Palette as PaletteIcon,
  Settings as SettingsIcon,
  User as UserIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
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
          leftIcon={ContrastIcon}
          label={i18n.t('appearance')}
          onPress={() => handleNavigate('PreferencesAppearance')}
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
        <InputRowButton
          leftIcon={PaletteIcon}
          label={i18n.t('personalization')}
          onPress={() => handleNavigate('PreferencesPersonalization')}
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
        <InputRowButton
          leftIcon={UserIcon}
          label={i18n.t('publisher')}
          onPress={() => handleNavigate('PreferencesPublisher')}
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
        <InputRowButton
          leftIcon={SettingsIcon}
          label={i18n.t('preferences')}
          onPress={() => handleNavigate('Preferences')}
          lastInSection
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
      </Section>
    </View>
  )
}
export default PreferencesSection
