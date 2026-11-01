import { useEffect } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { toast } from '@/stores/toasts'
import { isBuddiesNews } from '@/app/notifications/foregroundPresentation'
import { isAudioEnabled } from '@/lib/audio'

export default function SilentForegroundAlerts() {
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const subscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        if (isAudioEnabled()) return

        if (isBuddiesNews(notification)) return
        const { title, body } = notification.request.content
        if (!title && !body) return
        toast.news(title ?? body ?? '', {
          message: title ? (body ?? undefined) : undefined,
        })
      }
    )
    return () => subscription.remove()
  }, [])

  return null
}
