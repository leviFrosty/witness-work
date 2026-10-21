import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { installWatchSync } from '@/app/watch/watchSync'

/**
 * Installs the watch sync once `afterLaunch` lets launch work start. A launch
 * in the background (a watch request or a background refresh woke the app) has
 * no first screen to keep clear and may be suspended within seconds, so it
 * installs at once: the watch's entries get saved and the watch gets the
 * snapshot before then.
 */
export function useWatchSync(afterLaunch: boolean | undefined) {
  const [launchedInBackground] = useState(
    () => AppState.currentState === 'background'
  )
  const ready = afterLaunch || launchedInBackground
  useEffect(() => {
    if (!ready) return
    return installWatchSync()
  }, [ready])
}
