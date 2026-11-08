import { useNavigation } from '@react-navigation/native'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import useNotifications from '@/hooks/notifications'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddiesAlertRows from '@/features/buddies/components/BuddiesAlertRows'
import { BuddySettingsScope } from '@/features/buddies/hooks/useBuddySettingsScope'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function BuddiesNotificationRows() {
  const navigation = useNavigation<RootStackNavigation>()
  const enabled = useBuddies((state) => state.notificationsEnabled)
  const notifications = useNotifications()

  const toggle = async (on: boolean) => {
    if (on && !notifications.allowed) await notifications.turnOn()
    useBuddies.setState({ notificationsEnabled: on })
    void registerBuddiesPush().catch((error) =>
      logger.warn('[buddies] push registration', error)
    )
  }

  return (
    <BuddySettingsScope
      buddy={null}
      record={() => {}}
      select={(inboxId) => {
        if (inboxId) navigation.navigate('Buddies Settings', { inboxId })
      }}
    >
      <InputRowSwitch
        label={i18n.t('notificationSettings_buddiesAll')}
        info={i18n.t('buddies_notificationsInfo')}
        value={enabled}
        onValueChange={(on) => void toggle(on)}
        lastInSection={!enabled}
      />
      {enabled ? <BuddiesAlertRows /> : null}
    </BuddySettingsScope>
  )
}
