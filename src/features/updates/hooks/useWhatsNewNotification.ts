import Constants from 'expo-constants'
import { Tag as TagIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'
import { useShallow } from 'zustand/react/shallow'

/**
 * Announces a passively announced release in the tray until What's New is
 * opened (which clears the unread state) or the item is dismissed.
 */
export default function useWhatsNewNotification(): NotificationItem | null {
  const navigation = useNavigation<RootStackNavigation>()
  const { unreadReleaseNotes, set } = usePreferences(
    useShallow((s) => ({
      unreadReleaseNotes: s.unreadReleaseNotes,
      set: s.set,
    }))
  )
  if (!unreadReleaseNotes || unreadReleaseNotes.cardDismissed) return null

  const version = Constants.expoConfig?.version ?? ''
  return {
    id: `whats_new:${version}`,
    kind: 'whats_new',
    at: unreadReleaseNotes.at,
    icon: TagIcon,
    title: i18n.t('whatsNewCard_title', { version }),
    actions: [
      {
        id: 'see_whats_new',
        label: i18n.t('whatsNewCard_cta'),
        onPress: () => navigation.navigate('Whats New'),
      },
    ],
    onDismiss: () =>
      set({
        unreadReleaseNotes: { ...unreadReleaseNotes, cardDismissed: true },
      }),
  }
}
