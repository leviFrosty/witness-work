import { RefreshCw as RefreshCwIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { applyPendingUpdate } from '@/features/updates/lib/updates'
import { usePendingUpdate } from '@/features/updates/stores/pendingUpdate'
import type { NotificationItem } from '@/types/notifications'

export default function usePendingUpdateNotification(): NotificationItem | null {
  const bundleId = usePendingUpdate((s) => s.bundleId)
  if (!bundleId) return null

  return {
    id: `pending_update:${bundleId}`,
    kind: 'pending_update',
    icon: RefreshCwIcon,
    title: i18n.t('pendingUpdateCard_title'),
    description: i18n.t('pendingUpdateCard_body'),
    actions: [
      {
        id: 'update_now',
        label: i18n.t('pendingUpdateCard_cta'),
        onPress: () => void applyPendingUpdate(),
      },
    ],
  }
}
