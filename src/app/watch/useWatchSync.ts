import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { installWatchSync } from '@/app/watch/watchSync'

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
