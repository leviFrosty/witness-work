import * as Notifications from 'expo-notifications'
import { logger } from '@/lib/logger'
import { buddiesPushData } from '@/lib/notificationData'

export async function dismissBuddyAlerts(seqs: number[]) {
  try {
    const wanted = new Set(seqs)
    const presented = await Notifications.getPresentedNotificationsAsync()
    for (const notification of presented) {
      const seq = buddiesPushData(notification)?.seq
      if (seq !== undefined && wanted.has(seq))
        await Notifications.dismissNotificationAsync(
          notification.request.identifier
        )
    }
  } catch (error) {
    logger.warn('[buddies] dismiss alerts', error)
  }
}
