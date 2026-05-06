import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Alert } from 'react-native'
import i18n from './locales'

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
    Alert.alert(i18n.t('pushNotificationsRequirePhysicalDevice'))
  }

  return token
}
