import { useEffect, useState } from 'react'
import * as Notifications from 'expo-notifications'
import { registerForPushNotificationsAsync } from '@/lib/notifications'
import { AppState } from 'react-native'

const useNotifications = () => {
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    let active = true
    const fetchNotificationsSetting = async () => {
      const { granted } = await Notifications.getPermissionsAsync()
      if (active) setAllowed(granted)
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
    return permissions
  }
  return { allowed, register }
}

export default useNotifications
