import { create } from 'zustand'
import type { SyncPhotoUsage } from '@/lib/syncTransport/server/syncClient'
import type { PhotoUsageSource } from '@/lib/syncTransport/server/serverTransport'

type PhotoUsageState = {
  usage: SyncPhotoUsage | null

  fullAt: SyncPhotoUsage | null
}

export const useCloudSyncPhotoUsage = create<PhotoUsageState>(() => ({
  usage: null,
  fullAt: null,
}))

const roomListeners = new Set<() => void>()

export function recordPhotoUsage(
  usage: SyncPhotoUsage,
  source: PhotoUsageSource
): void {
  const { fullAt } = useCloudSyncPhotoUsage.getState()
  if (source === 'full') {
    useCloudSyncPhotoUsage.setState({ usage, fullAt: usage })
    return
  }
  const freed = fullAt !== null && usage.bytes < fullAt.bytes

  const stored = fullAt !== null && source === 'put'
  useCloudSyncPhotoUsage.setState({
    usage,
    ...((freed || stored) && { fullAt: null }),
  })
  if (freed) for (const listener of [...roomListeners]) listener()
}

export function onPhotoRoom(listener: () => void): () => void {
  roomListeners.add(listener)
  return () => roomListeners.delete(listener)
}

export function resetPhotoUsage(): void {
  useCloudSyncPhotoUsage.setState({ usage: null, fullAt: null })
}
