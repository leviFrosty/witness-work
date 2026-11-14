import { MMKV } from 'react-native-mmkv'
import type { ChangeStore } from '@/lib/syncTransport/server/recordChanges'

let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'cloud-sync-changes' }))

export const changeStore: ChangeStore = {
  get: (key) => store().getString(key) ?? null,
  set: (key, value) => store().set(key, value),
  delete: (key) => store().delete(key),
  clear: () => store().clearAll(),
}

export function forgetStoredChanges(): void {
  try {
    changeStore.clear()
  } catch {}
}
