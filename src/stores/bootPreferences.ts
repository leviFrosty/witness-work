import type {
  PersistStorage as ZustandPersistStorage,
  StorageValue,
} from 'zustand/middleware'
import { isStorageLocked, mmkvStorage, PersistStorage } from '@/stores/mmkv'

const KEY = 'preferences'

let boot: { raw: string; value: unknown } | null | undefined

export function readBootPreferences(): unknown {
  if (boot === undefined) {
    const raw = isStorageLocked() ? undefined : mmkvStorage.getString(KEY)
    try {
      boot = raw ? { raw, value: JSON.parse(raw) } : null
    } catch {
      boot = null
    }
  }
  return boot?.value ?? null
}

function takeBootPreferences(raw: string): unknown {
  const cached = boot

  boot = undefined
  return cached && cached.raw === raw ? cached.value : undefined
}

export function createPreferencesStorage<S>(): ZustandPersistStorage<S> {
  const parse = (raw: string | null): StorageValue<S> | null =>
    raw === null
      ? null
      : ((takeBootPreferences(raw) ?? JSON.parse(raw)) as StorageValue<S>)
  return {
    getItem: (name) => {
      const raw = PersistStorage.getItem(name)
      return raw instanceof Promise ? raw.then(parse) : parse(raw)
    },
    setItem: (name, value) =>
      PersistStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => PersistStorage.removeItem(name),
  }
}
