import * as Notifications from 'expo-notifications'
import { Linking, Platform } from 'react-native'
import i18n from '@/lib/locales'

/**
 * Expo's default Android channel. Local reminders keep using it so the sound
 * and importance people already chose for it in Android settings still apply.
 */
export const REMINDER_CHANNEL_ID =
  'expo_notifications_fallback_notification_channel'

export async function ensureReminderChannel() {
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: i18n.t('notifications'),
    importance: Notifications.AndroidImportance.HIGH,
  })
}

export async function registerForPushNotificationsAsync() {
  // Create the channel before requesting Android 13+ notification permission.
  if (Platform.OS === 'android') await ensureReminderChannel()
  const permissions = await Notifications.getPermissionsAsync()
  return permissions.granted
    ? permissions
    : Notifications.requestPermissionsAsync()
}

/**
 * Asks for notification permission when the system still can, and otherwise
 * opens this app's page in device settings. One recovery path for every
 * notification switch. Resolves whether notifications are now allowed.
 */
export async function requestOrOpenNotificationSettings(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  // Someone who just answered the system prompt isn't sent to settings too.
  if (current.canAskAgain)
    return (await registerForPushNotificationsAsync()).granted
  await Linking.openSettings()
  return false
}
