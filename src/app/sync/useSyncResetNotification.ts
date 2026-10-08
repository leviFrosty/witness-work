import { Cloud as CloudIcon } from 'lucide-react-native'
import { usePreferences } from '@/stores/preferences'
import i18n from '@/lib/locales'
import { hasSyncTransport } from '@/lib/syncTransport/platform'
import { syncKey } from '@/lib/syncCopy'

import type { NotificationItem } from '@/types/notifications'

/** Tells the user this device switched to another device's rebuilt data. */
export function useSyncResetNotification(): NotificationItem | null {
  const notice = usePreferences((state) => state.iCloudResetAdoptedNotice)
  if (!hasSyncTransport() || !notice) return null
  return {
    id: `icloud:reset-adopted:${notice.epochId}`,
    kind: 'icloud_sync',
    at: notice.at,
    icon: CloudIcon,
    tone: 'accent',
    title: i18n.t(syncKey('iCloudResetAdopted')),
    description: notice.deviceName
      ? i18n.t('iCloudResetAdopted_description', { device: notice.deviceName })
      : i18n.t('iCloudResetAdopted_descriptionUnknown'),
    onDismiss: () => {
      usePreferences.setState({ iCloudResetAdoptedNotice: null })
    },
  }
}
