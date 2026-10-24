import {
  Cloud as CloudIcon,
  KeyRound as KeyRoundIcon,
  Lock as LockIcon,
  Palette as PaletteIcon,
  Settings as SettingsIcon,
  User as UserIcon,
} from 'lucide-react-native'
import * as BuddiesKeychain from '../../../../../modules/buddies-keychain'
import { GroupedListRow, GroupedListSection } from '@/components/ui/GroupedList'
import i18n from '@/lib/locales'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'
import LanguageSelector from '@/features/settings/components/sections/LanguageSelector'
import useDeviceSyncAvailable from '@/features/settings/hooks/useDeviceSyncAvailable'

const PreferencesSection = ({
  handleNavigate,
  selectedDestination,
}: SettingsSectionProps) => {
  const deviceSyncAvailable = useDeviceSyncAvailable()
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
        {/* Binaries before the recovery key can't replace the account key. */}
        {BuddiesKeychain.isReplaceAvailable() && (
          <GroupedListRow
            icon={KeyRoundIcon}
            label={i18n.t('account_title')}
            onPress={() => handleNavigate('Account')}
            selected={selectedDestination === 'Account'}
            testID='settings-account'
          />
        )}
        {deviceSyncAvailable && (
          <GroupedListRow
            icon={CloudIcon}
            label={i18n.t('syncSettingsTitle')}
            onPress={() => handleNavigate('PreferencesiCloud')}
            selected={selectedDestination === 'PreferencesiCloud'}
          />
        )}
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
