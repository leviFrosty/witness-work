import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { openAppSettings } from '@/lib/openAppSettings'
import i18n from '@/lib/locales'

export const REMINDER_CHANNEL_ID =
  'expo_notifications_fallback_notification_channel'

export const reminderChannelName = () => i18n.t('remindersChannelName')

export async function ensureReminderChannel() {
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: reminderChannelName(),
    importance: Notifications.AndroidImportance.HIGH,
  })
}

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'android') await ensureReminderChannel()
  const permissions = await Notifications.getPermissionsAsync()
  return permissions.granted
    ? permissions
    : Notifications.requestPermissionsAsync()
}

export async function requestOrOpenNotificationSettings(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true

  if (current.canAskAgain)
    return (await registerForPushNotificationsAsync()).granted
  await openAppSettings()
  return false
}
