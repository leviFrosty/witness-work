import { useNavigation } from '@react-navigation/native'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddiesNotificationRows from '@/features/buddies/components/BuddiesNotificationRows'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { BuddySettingsScope } from '@/features/buddies/hooks/useBuddySettingsScope'
import SettingsSearchTarget from '@/features/settings/components/search/SettingsSearchTarget'
import SettingsGroup from '@/features/settings/components/shared/SettingsGroup'

export default function BuddiesNotificationSettingsSection() {
  const navigation = useNavigation<RootStackNavigation>()
  const buddiesEnabled = useBuddiesEnabled()
  if (!buddiesEnabled) return null

  return (
    <SettingsGroup title={i18n.t('buddies_title')}>
      <SettingsSearchTarget id='buddiesNotifications'>
        <BuddySettingsScope
          buddy={null}
          record={() => {}}
          select={(inboxId) => {
            if (inboxId) navigation.navigate('Buddies Settings', { inboxId })
          }}
        >
          <BuddiesNotificationRows />
        </BuddySettingsScope>
      </SettingsSearchTarget>
    </SettingsGroup>
  )
}
