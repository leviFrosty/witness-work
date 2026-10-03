import { Cloud as CloudIcon } from 'lucide-react-native'
import { Platform } from 'react-native'
import { usePreferences } from '@/stores/preferences'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import type { NotificationItem } from '@/types/notifications'

/** Tells the user this device switched to another device's rebuilt data. */
export function useSyncResetNotification(): NotificationItem | null {
  const notice = usePreferences((state) => state.iCloudResetAdoptedNotice)
  if (Platform.OS !== 'ios' || !notice) return null
  return {
    id: `icloud:reset-adopted:${notice.epochId}`,
    kind: 'icloud_sync',
    at: notice.at,
    icon: CloudIcon,
    tone: 'accent',
    title: i18n.t('iCloudResetAdopted'),
    description: notice.deviceName
      ? i18n.t('iCloudResetAdopted_description', { device: notice.deviceName })
      : i18n.t('iCloudResetAdopted_descriptionUnknown'),
    onDismiss: () => {
      usePreferences.setState({ iCloudResetAdoptedNotice: null })
      analytics.capture('icloud_sync_reset_adopted_dismissed', {
        source: 'notifications_tray',
      })
    },
    onView: () =>
      analytics.capture('icloud_sync_reset_adopted_viewed', {
        source: 'notifications_tray',
      }),
  }
}
