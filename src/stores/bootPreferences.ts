import type {
  PersistStorage as ZustandPersistStorage,
  StorageValue,
} from 'zustand/middleware'
import { mmkvStorage, PersistStorage } from '@/stores/mmkv'

const KEY = 'preferences'

let boot: { raw: string; value: unknown } | null | undefined

/**
 * The persisted preferences blob as launch found it. Language and date
 * conventions are set up from it before the preferences store exists, and the
 * store's hydration then reuses the same parse instead of parsing it again.
 */
export function readBootPreferences(): unknown {
  if (boot === undefined) {
    const raw = mmkvStorage.getString(KEY)
    try {
      boot = raw ? { raw, value: JSON.parse(raw) } : null
    } catch {
      boot = null
    }
  }
  return boot?.value ?? null
}

/** The launch parse, once, and only if storage still holds that exact blob. */
function takeBootPreferences(raw: string): unknown {
  const cached = boot
  // Dropped once used, so later reads (rehydrate) parse what's current.
  boot = undefined
  return cached && cached.raw === raw ? cached.value : undefined
}

/**
 * `createJSONStorage(() => PersistStorage)` for the preferences store, except
 * that hydration takes the launch parse when it's still current.
 */
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
