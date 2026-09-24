import { useEffect, useState } from 'react'
import { AppState, Linking } from 'react-native'
import * as Notifications from 'expo-notifications'
import { logger } from '@/lib/logger'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'

const register = () =>
  registerBuddiesPush().catch((error) =>
    logger.warn('[buddies] push registration', error)
  )

/**
 * The iOS notification permission, re-read on return from Settings. `granted`
 * is null until known. `turnOn` asks, or opens Settings once iOS won't ask.
 */
export default function useNotificationPermission() {
  const [status, setStatus] =
    useState<Notifications.NotificationPermissionsStatus | null>(null)

  useEffect(() => {
    const refresh = () =>
      void Notifications.getPermissionsAsync().then((next) => {
        setStatus(next)
        // Allowed in Settings: register now rather than on the next sync.
        if (next.granted) void register()
      })
    refresh()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => subscription.remove()
  }, [])

  const turnOn = async () => {
    if (status && !status.canAskAgain) {
      await Linking.openSettings()
      return
    }
    const next = await Notifications.requestPermissionsAsync()
    setStatus(next)
    if (next.granted) await register()
  }

  return {
    granted: status?.granted ?? null,
    /** Denied for good: `turnOn` opens iOS Settings instead. */
    needsSettings: status ? !status.granted && !status.canAskAgain : false,
    turnOn,
  }
}
