import { useEffect } from 'react'
import { installiCloudSync } from '@/app/sync/iCloudSync'

export function useICloudSync(storageReady: boolean | undefined) {
  useEffect(() => {
    if (!storageReady) return
    return installiCloudSync()
  }, [storageReady])
}
