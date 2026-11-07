import { useEffect } from 'react'
import { refreshCloudSyncPhotoUsage } from '@/app/sync/cloudSync'
import { currentPhotoReferences } from '@/app/sync/publishedPhotos'
import {
  cloudSyncHoldsPhotos,
  photosStuckOnFullStorage,
} from '@/lib/syncTransport/photoSyncStatus'
import { useCloudSyncPhotoUsage } from '@/lib/syncTransport/server/photoUsage'
import type { SyncPhotoUsage } from '@/lib/syncTransport/server/syncClient'
import { usePreferences } from '@/stores/preferences'

export default function useCloudSyncPhotoStorage(): {
  shown: boolean
  usage: SyncPhotoUsage | null
  full: boolean
} {
  const shown = usePreferences(cloudSyncHoldsPhotos)
  const stuck = usePreferences(
    (state) =>
      Object.values(state.iCloudImageSync ?? {}).some(
        (entry) => entry.errorCode === 'storage-full'
      ) &&
      photosStuckOnFullStorage(currentPhotoReferences().all, state).length > 0
  )
  const usage = useCloudSyncPhotoUsage((state) => state.usage)

  useEffect(() => {
    if (shown) void refreshCloudSyncPhotoUsage()
  }, [shown])

  return {
    shown,
    usage,
    full: shown && ((usage !== null && usage.bytes >= usage.limit) || stuck),
  }
}
