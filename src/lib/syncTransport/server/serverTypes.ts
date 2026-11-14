import type { BearerAccountOptions } from '@/lib/serverAccount/client'
import type { PhotoKeys } from '@/lib/syncTransport/server/photoCrypto'

export type ServerSyncAccess = {
  accountId: string
  syncKey: Uint8Array

  photoKeys: PhotoKeys

  olderSyncKeys?: readonly Uint8Array[]

  olderPhotoKeys?: readonly PhotoKeys[]
  options: BearerAccountOptions
}

export type SlotStore = {
  read: (
    accountId: string,
    slotId: string
  ) => { etag: string; blob: Uint8Array } | null
  write: (
    accountId: string,
    slotId: string,
    etag: string,
    blob: Uint8Array
  ) => void
  remove: (slotId: string) => void

  prune: (accountId: string, keep: ReadonlySet<string>) => void
  clear: () => void
}
