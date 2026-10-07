import * as Notifications from 'expo-notifications'
import {
  BADGE_PUSH_KIND,
  BADGE_REACTION_PUSH_KIND,
} from '@/features/buddies/lib/engine'
import { buddiesPushData } from '@/lib/notificationData'

/**
 * Whether a notification is buddies' news (a buddy's new badge, a reaction to
 * the User's badge), by its `ww.kind`, rather than logistics.
 */
export function isBuddiesNews(notification: Notifications.Notification) {
  const kind = buddiesPushData(notification)?.kind
  return kind === BADGE_PUSH_KIND || kind === BADGE_REACTION_PUSH_KIND
}

/**
 * How a notification shows while the app is open. Reminders and Buddies
 * logistics show a banner; their sound follows the in-app Audio setting
 * (delivered in the background, the system's settings decide). Buddies' news is
 * quiet (ADR 0021): no banner, no sound, just the list, and the bell has it
 * too. While the app is open, the bell's unread count sets the app icon badge.
 */
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
    // Android drops the banner of a silent alert, so `SilentForegroundAlerts`
    // shows one in the app.
    shouldPlaySound: audioEnabled,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }
}
