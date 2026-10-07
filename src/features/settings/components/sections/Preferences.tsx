import {
  ChevronRight as ChevronRightIcon,
  Palette as PaletteIcon,
  Settings as SettingsIcon,
  User as UserIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import i18n from '@/lib/locales'
import IconButton from '@/components/ui/IconButton'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'
import LanguageSelector from '@/features/settings/components/sections/LanguageSelector'
import { useInputLayout } from '@/components/ui/inputs/InputLayout'

const PreferencesSection = ({
  handleNavigate,
  selectedDestination,
}: SettingsSectionProps) => {
  const layout = useInputLayout()
  return (
    <View style={{ gap: 3 }}>
      <Section>
        <LanguageSelector />
      </Section>
      <View style={{ height: layout === 'drawer' ? 4 : 12 }} />
      <Section>
        <InputRowButton
          leftIcon={UserIcon}
          label={i18n.t('profile')}
          onPress={() => handleNavigate('PreferencesPublisher')}
          selected={selectedDestination === 'PreferencesPublisher'}
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
        <InputRowButton
          leftIcon={PaletteIcon}
          label={i18n.t('personalization')}
          onPress={() => handleNavigate('PreferencesPersonalization')}
          selected={selectedDestination === 'PreferencesPersonalization'}
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
        <InputRowButton
          leftIcon={SettingsIcon}
          label={i18n.t('preferences')}
          onPress={() => handleNavigate('Preferences')}
          selected={selectedDestination === 'Preferences'}
          lastInSection
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
      </Section>
    </View>
  )
}
export default PreferencesSection
