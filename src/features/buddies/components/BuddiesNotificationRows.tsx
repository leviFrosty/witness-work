import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import type { AppIcon } from '@/components/ui/LucideIcon'
import useNotifications from '@/hooks/notifications'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import BuddiesAlertRows from '@/features/buddies/components/BuddiesAlertRows'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function BuddiesNotificationRows({
  leftIcon,
  label = i18n.t('notificationSettings_buddiesAll'),
}: {
  leftIcon?: AppIcon
  label?: string
}) {
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
    <>
      <InputRowSwitch
        label={label}
        leftIcon={leftIcon}
        info={i18n.t('buddies_notificationsInfo')}
        value={enabled}
        onValueChange={(on) => void toggle(on)}
        lastInSection={!enabled}
      />
      {enabled ? <BuddiesAlertRows indented /> : null}
    </>
  )
}
