import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { logger } from '@/lib/logger'

/**
 * The app icon shows the bell's unread count on iOS only. Android launchers
 * badge from the notifications in the shade, and Expo clears a badge there by
 * cancelling every delivered notification.
 */
export const supportsAppIconBadge = () => Platform.OS === 'ios'

export function setAppIconBadge(count: number) {
  if (!supportsAppIconBadge()) return
  // Resolves false, changing nothing, when badges aren't allowed.
  Notifications.setBadgeCountAsync(count).catch((error) =>
    logger.error('[appIconBadge] failed to set the badge', error)
  )
}
