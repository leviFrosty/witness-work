import { useEffect, useState } from 'react'
import * as Notifications from 'expo-notifications'
import {
  registerForPushNotificationsAsync,
  requestOrOpenNotificationSettings,
} from '@/lib/notifications'
import { AppState } from 'react-native'

/**
 * The device's notification permission, re-read on return from Settings.
 * `turnOn` asks while the system still can, then falls back to Settings.
 */
const useNotifications = () => {
  const [allowed, setAllowed] = useState(false)
  const [canAskAgain, setCanAskAgain] = useState(true)

  useEffect(() => {
    let active = true
    const fetchNotificationsSetting = async () => {
      const permissions = await Notifications.getPermissionsAsync()
      if (!active) return
      setAllowed(permissions.granted)
      setCanAskAgain(permissions.canAskAgain)
    }
    void fetchNotificationsSetting()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void fetchNotificationsSetting()
    })
    return () => {
      active = false
      subscription.remove()
    }
  }, [])

  const register = async () => {
    const permissions = await registerForPushNotificationsAsync()
    setAllowed(permissions.granted)
    setCanAskAgain(permissions.canAskAgain)
    return permissions
  }

  const turnOn = async () => {
    const granted = await requestOrOpenNotificationSettings()
    setAllowed(granted)
    return granted
  }

  return { allowed, canAskAgain, register, turnOn }
}

export default useNotifications
