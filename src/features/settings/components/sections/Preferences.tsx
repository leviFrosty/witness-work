import {
  Lock as LockIcon,
  Palette as PaletteIcon,
  Settings as SettingsIcon,
  User as UserIcon,
} from 'lucide-react-native'
import { GroupedListRow, GroupedListSection } from '@/components/ui/GroupedList'
import i18n from '@/lib/locales'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'
import LanguageSelector from '@/features/settings/components/sections/LanguageSelector'

const PreferencesSection = ({
  handleNavigate,
  selectedDestination,
}: SettingsSectionProps) => {
  return (
    <>
      <GroupedListSection>
        <LanguageSelector />
      </GroupedListSection>
      <GroupedListSection>
        <GroupedListRow
          icon={UserIcon}
          label={i18n.t('profile')}
          onPress={() => handleNavigate('PreferencesPublisher')}
          selected={selectedDestination === 'PreferencesPublisher'}
        />
        <GroupedListRow
          icon={PaletteIcon}
          label={i18n.t('personalization')}
          onPress={() => handleNavigate('PreferencesPersonalization')}
          selected={selectedDestination === 'PreferencesPersonalization'}
        />
        <GroupedListRow
          icon={SettingsIcon}
          label={i18n.t('preferences')}
          onPress={() => handleNavigate('Preferences')}
          selected={selectedDestination === 'Preferences'}
        />
        <GroupedListRow
          icon={LockIcon}
          label={i18n.t('security')}
          onPress={() => handleNavigate('Security')}
          selected={selectedDestination === 'Security'}
        />
      </GroupedListSection>
    </>
  )
}
export default PreferencesSection
