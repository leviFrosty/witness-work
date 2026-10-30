import { create } from 'zustand'
import type { SyncPhotoUsage } from '@/lib/syncTransport/server/syncClient'
import type { PhotoUsageSource } from '@/lib/syncTransport/server/serverTransport'

/**
 * The account's Cloud Sync photo storage as ww-api last said it (a put, a list,
 * a delete, `photos/usage`, or a put refused as `storage_full`), for Settings →
 * Account and for retrying a full account once there's room. In memory only:
 * Settings reads it again when it opens.
 */
type PhotoUsageState = {
  usage: SyncPhotoUsage | null
  /** The usage when a put was last refused as full, until room frees. */
  fullAt: SyncPhotoUsage | null
}

export const useCloudSyncPhotoUsage = create<PhotoUsageState>(() => ({
  usage: null,
  fullAt: null,
}))

const roomListeners = new Set<() => void>()

/**
 * Records what the server said. Usage that dropped below what it was when a put
 * was refused (a photo deleted here or on another device) means there may be
 * room: listeners retry then, once. A put that stored ends the full state.
 */
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
  // A photo that stored means the account isn't full any more.
  const stored = fullAt !== null && source === 'put'
  useCloudSyncPhotoUsage.setState({
    usage,
    ...((freed || stored) && { fullAt: null }),
  })
  if (freed) for (const listener of [...roomListeners]) listener()
}

/** Fires when a full account's usage drops. */
export function onPhotoRoom(listener: () => void): () => void {
  roomListeners.add(listener)
  return () => roomListeners.delete(listener)
}

/** Forgets the account's usage, after an account change. */
export function resetPhotoUsage(): void {
  useCloudSyncPhotoUsage.setState({ usage: null, fullAt: null })
}
