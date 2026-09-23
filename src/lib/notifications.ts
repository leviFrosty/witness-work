import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import i18n from '@/lib/locales'

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'android') {
    // Expo uses this channel for local reminders without an explicit channelId.
    // Create it before requesting Android 13+ notification permission.
    await Notifications.setNotificationChannelAsync(
      'expo_notifications_fallback_notification_channel',
      {
        name: i18n.t('notifications'),
        importance: Notifications.AndroidImportance.HIGH,
      }
    )
  }
  const permissions = await Notifications.getPermissionsAsync()
  return permissions.granted
    ? permissions
    : Notifications.requestPermissionsAsync()
}
