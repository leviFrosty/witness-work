import { useEffect, useState } from 'react'
import * as Notifications from 'expo-notifications'
import { registerForPushNotificationsAsync } from '../lib/notifications'

const useNotifications = () => {
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const fetchNotificationsSetting = async () => {
      const { granted } = await Notifications.getPermissionsAsync()
      setAllowed(granted)
    }
    fetchNotificationsSetting()
  }, [])

  return { allowed, register: registerForPushNotificationsAsync }
}

export default useNotifications
