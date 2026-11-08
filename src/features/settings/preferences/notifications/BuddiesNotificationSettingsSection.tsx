import i18n from '@/lib/locales'
import BuddiesNotificationRows from '@/features/buddies/components/BuddiesNotificationRows'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import SettingsSearchTarget from '@/features/settings/components/search/SettingsSearchTarget'
import SettingsGroup from '@/features/settings/components/shared/SettingsGroup'

export default function BuddiesNotificationSettingsSection() {
  const buddiesEnabled = useBuddiesEnabled()
  if (!buddiesEnabled) return null

  return (
    <SettingsGroup title={i18n.t('buddies_title')}>
      <SettingsSearchTarget id='buddiesNotifications'>
        <BuddiesNotificationRows />
      </SettingsSearchTarget>
    </SettingsGroup>
  )
}
