import * as Notifications from 'expo-notifications'

export async function registerForPushNotificationsAsync() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  if (existingStatus !== 'granted') {
    await Notifications.requestPermissionsAsync()
  }
}
