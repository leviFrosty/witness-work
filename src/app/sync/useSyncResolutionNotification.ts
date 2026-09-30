import { Cloud as CloudIcon } from 'lucide-react-native'
import { Platform } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { usePreferences } from '@/stores/preferences'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'

export function useSyncResolutionNotification(): NotificationItem | null {
  const needsResolution = usePreferences(
    (state) => state.iCloudSyncNeedsResolution
  )
  const navigation = useNavigation<RootStackNavigation>()
  if (Platform.OS !== 'ios' || !needsResolution) return null
  return {
    id: 'icloud:resolve',
    kind: 'icloud_sync',
    icon: CloudIcon,
    tone: 'warn',
    sticky: true,
    title: i18n.t('iCloudResolutionNeeded'),
    description: i18n.t('iCloudResolutionNeeded_description'),
    actions: [
      {
        id: 'resolve_sync',
        label: i18n.t('iCloudResolutionAction'),
        onPress: () => {
          analytics.capture('icloud_sync_resolution_opened', {
            source: 'notifications_tray',
          })
          navigation.navigate('PreferencesiCloud')
        },
      },
    ],
    onView: () =>
      analytics.capture('icloud_sync_resolution_viewed', {
        source: 'notifications_tray',
      }),
  }
}
