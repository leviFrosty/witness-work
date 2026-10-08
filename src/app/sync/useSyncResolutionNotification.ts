import { Cloud as CloudIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { usePreferences } from '@/stores/preferences'
import i18n from '@/lib/locales'
import { hasSyncTransport } from '@/lib/syncTransport/platform'
import { syncKey } from '@/lib/syncCopy'

import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'

export function useSyncResolutionNotification(): NotificationItem | null {
  const needsResolution = usePreferences(
    (state) => state.iCloudSyncNeedsResolution
  )
  const navigation = useNavigation<RootStackNavigation>()
  if (!hasSyncTransport() || !needsResolution) return null
  return {
    id: 'icloud:resolve',
    kind: 'icloud_sync',
    icon: CloudIcon,
    tone: 'warn',
    sticky: true,
    title: i18n.t(syncKey('iCloudResolutionNeeded')),
    description: i18n.t(syncKey('iCloudResolutionNeeded_description')),
    actions: [
      {
        id: 'resolve_sync',
        label: i18n.t('iCloudResolutionAction'),
        onPress: () => {
          navigation.navigate('PreferencesiCloud')
        },
      },
    ],
  }
}
