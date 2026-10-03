import { useEffect } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { useToastController } from '@tamagui/toast'
import { isAudioEnabled } from '@/lib/audio'

/**
 * With app sounds off, Android posts an alert that arrives while the app is
 * open silently — and a silent Android notification gets no drop-down banner.
 * iOS still shows its banner without sound, so Android shows a toast instead.
 * The alert stays in the notification shade either way.
 */
export default function SilentForegroundAlerts() {
  const toast = useToastController()

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const subscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        if (isAudioEnabled()) return
        const { title, body } = notification.request.content
        if (!title && !body) return
        toast.show(title ?? body ?? '', {
          message: title ? (body ?? undefined) : undefined,
          native: true,
        })
      }
    )
    return () => subscription.remove()
  }, [toast])

  return null
}
