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

/**
 * The account's Cloud Sync photo storage for Settings → Account: shown while
 * this device is on Cloud Sync, its usage read when the screen opens (a photo
 * deleted meanwhile updates it), and full when the usage is at the limit or a
 * photo this device's records refer to is stuck on it.
 */
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
