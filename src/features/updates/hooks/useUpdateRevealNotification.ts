import { Gift as GiftIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { NotificationItem } from '@/types/notifications'
import {
  UPDATE_REVEAL_NAME,
  UPDATE_REVEAL_VERSION,
} from '@/features/updates/constants/updateReveal'
import { useUpdateRevealStore } from '@/features/updates/stores/updateReveal'

/**
 * Lets a User who closed the update reveal before the tour replay it. Gone once
 * the tour is opened or the item is dismissed.
 */
export default function useUpdateRevealNotification(): NotificationItem | null {
  const { updateReveal, set } = usePreferences()
  const requestReveal = useUpdateRevealStore((s) => s.request)
  if (
    updateReveal?.version !== UPDATE_REVEAL_VERSION ||
    updateReveal.status !== 'skipped'
  ) {
    return null
  }

  return {
    id: `update_reveal:${UPDATE_REVEAL_VERSION}`,
    kind: 'update_reveal',
    icon: GiftIcon,
    title: i18n.t(UPDATE_REVEAL_NAME),
    description: i18n.t('updateReveal_trayBody'),
    actions: [
      {
        id: 'replay',
        label: i18n.t('updateReveal_seeWhatsNew'),
        onPress: () => requestReveal('tray'),
      },
    ],
    onDismiss: () =>
      set({ updateReveal: { version: UPDATE_REVEAL_VERSION, status: 'seen' } }),
  }
}
