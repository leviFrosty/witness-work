import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { logger } from '@/lib/logger'

export const supportsAppIconBadge = () => Platform.OS === 'ios'

export function setAppIconBadge(count: number) {
  if (!supportsAppIconBadge()) return

  Notifications.setBadgeCountAsync(count).catch((error) =>
    logger.error('[appIconBadge] failed to set the badge', error)
  )
}
