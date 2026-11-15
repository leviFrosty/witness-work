import { useEffect } from 'react'
import { refreshCloudSyncPhotoUsage } from '@/app/sync/cloudSync'
import { currentPhotoReferences } from '@/app/sync/publishedPhotos'
import useIsSupporter from '@/hooks/useIsSupporter'
import {
  cloudSyncHoldsPhotos,
  photosStuckOnFullStorage,
} from '@/lib/syncTransport/photoSyncStatus'
import { useCloudSyncPhotoUsage } from '@/lib/syncTransport/server/photoUsage'
import type { SyncPhotoUsage } from '@/lib/syncTransport/server/syncClient'
import { usePreferences } from '@/stores/preferences'

export const PHOTO_STORAGE_ALMOST_FULL = 0.9

export type CloudSyncPhotoStorage = {
  shown: boolean
  usage: SyncPhotoUsage | null
  full: boolean
  almostFull: boolean
  fraction: number
}

export const photoStorageFraction = (usage: SyncPhotoUsage | null) =>
  usage && usage.limit > 0 ? Math.min(1, usage.bytes / usage.limit) : 0

export default function useCloudSyncPhotoStorage({
  refresh = true,
}: { refresh?: boolean } = {}): CloudSyncPhotoStorage {
  const shown = usePreferences(cloudSyncHoldsPhotos)
  const stuck = usePreferences(
    (state) =>
      Object.values(state.iCloudImageSync ?? {}).some(
        (entry) => entry.errorCode === 'storage-full'
      ) &&
      photosStuckOnFullStorage(currentPhotoReferences().all, state).length > 0
  )
  const usage = useCloudSyncPhotoUsage((state) => state.usage)
  const { isSupporter } = useIsSupporter()

  useEffect(() => {
    if (shown && refresh) void refreshCloudSyncPhotoUsage()
  }, [shown, refresh, isSupporter])

  const fraction = photoStorageFraction(usage)
  const full =
    shown && ((usage !== null && usage.bytes >= usage.limit) || stuck)
  return {
    shown,
    usage,
    full,
    almostFull: shown && (full || fraction >= PHOTO_STORAGE_ALMOST_FULL),
    fraction,
  }
}
