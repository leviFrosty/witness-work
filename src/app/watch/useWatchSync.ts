import { useEffect } from 'react'
import { installWatchSync } from '@/app/watch/watchSync'

export function useWatchSync(storageReady: boolean | undefined) {
  useEffect(() => {
    if (!storageReady) return
    return installWatchSync()
  }, [storageReady])
}
