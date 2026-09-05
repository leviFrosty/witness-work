import { useEffect } from 'react'
import { AppState } from 'react-native'
import { deferUntilNotBlocking } from '@/lib/deferUntilNotBlocking'
import { announcementClient } from '@/features/announcements/lib/announcementRuntime'

/** Mounted only after navigation is ready; never delays the app's own UI. */
export default function AnnouncementStartup() {
  useEffect(() => {
    const controller = new AbortController()
    let started = false
    const cancel = deferUntilNotBlocking(
      () => {
        started = true
        void announcementClient.checkForUpdates(controller.signal)
      },
      { signal: controller.signal }
    )
    const subscription = AppState.addEventListener('change', (state) => {
      if (started && state !== 'active') controller.abort()
    })
    return () => {
      controller.abort()
      cancel()
      subscription.remove()
    }
  }, [])
  return null
}
