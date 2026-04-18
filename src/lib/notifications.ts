import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'

export async function registerForPushNotificationsAsync() {
  let token

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }
    if (finalStatus !== 'granted') {
      return
    }
  } else {
    alert('Must use physical device for Push Notifications')
  }

  return token
}
