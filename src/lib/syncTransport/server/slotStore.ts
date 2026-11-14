import { MMKV } from 'react-native-mmkv'
import type { SlotStore } from '@/lib/syncTransport/server/serverTransport'

let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'cloud-sync-slots' }))

const META = 'm:'
const BLOB = 'b:'

type Meta = { accountId: string; etag: string }

function readMeta(slotId: string): Meta | null {
  const raw = store().getString(META + slotId)
  if (!raw) return null
  try {
    const meta = JSON.parse(raw) as Partial<Meta>
    return typeof meta.accountId === 'string' && typeof meta.etag === 'string'
      ? { accountId: meta.accountId, etag: meta.etag }
      : null
  } catch {
    return null
  }
}

function remove(slotId: string): void {
  store().delete(META + slotId)
  store().delete(BLOB + slotId)
}

export const slotStore: SlotStore = {
  read(accountId, slotId) {
    const meta = readMeta(slotId)
    if (meta?.accountId !== accountId) return null
    const blob = store().getBuffer(BLOB + slotId)
    return blob ? { etag: meta.etag, blob: new Uint8Array(blob) } : null
  },

  write(accountId, slotId, etag, blob) {
    store().delete(META + slotId)
    store().set(
      BLOB + slotId,
      blob.buffer.slice(
        blob.byteOffset,
        blob.byteOffset + blob.byteLength
      ) as ArrayBuffer
    )
    store().set(META + slotId, JSON.stringify({ accountId, etag }))
  },

  remove,

  prune(accountId, keep) {
    const slotIds = new Set(
      store()
        .getAllKeys()
        .map((key) => key.slice(2))
    )
    for (const slotId of slotIds)
      if (!keep.has(slotId) || readMeta(slotId)?.accountId !== accountId)
        remove(slotId)
  },

  clear() {
    store().clearAll()
  },
}

export function forgetStoredSlots(): void {
  try {
    slotStore.clear()
  } catch {}
}
