import * as Notifications from 'expo-notifications'
import { isBuddiesNewsKind } from '@/features/buddies/lib/pushAlerts'
import { buddiesPushData } from '@/lib/notificationData'

export function isBuddiesNews(notification: Notifications.Notification) {
  const push = buddiesPushData(notification)
  return push !== null && isBuddiesNewsKind(push.kind)
}

export function foregroundPresentation(
  notification: Notifications.Notification,
  { audioEnabled }: { audioEnabled: boolean }
): Notifications.NotificationBehavior {
  if (isBuddiesNews(notification))
    return {
      shouldShowAlert: false,
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      priority: Notifications.AndroidNotificationPriority.LOW,
    }
  return {
    shouldShowAlert: true,

    shouldPlaySound: audioEnabled,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }
}
