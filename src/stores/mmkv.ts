import AsyncStorage from '@react-native-async-storage/async-storage'
import { errorTracking } from '@/lib/errorTracking'
import { MMKV } from 'react-native-mmkv'
import { StateStorage } from 'zustand/middleware'

export const mmkvStorage = new MMKV()

export const hasMigratedFromAsyncStorage = () =>
  mmkvStorage.getBoolean('hasMigratedFromAsyncStorage')

/**
 * Returns true for transient native AsyncStorage read failures we can't act on
 * — chiefly iOS file-protection errors (NSCocoaErrorDomain 257/513, POSIX EPERM
 * "Operation not permitted") raised when the device is locked, plus generic
 * "Failed to read storage file" IO errors. These are expected, recover on the
 * next read, and should degrade to a cache-miss rather than crash hydration or
 * flood error tracking. See JW-TIME-C5.
 */
export function isTransientStorageReadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return (
    /Failed to read storage file/i.test(message) ||
    /NSCocoaErrorDomain Code=(?:257|513)/.test(message) ||
    /don.?t have permission to view it/i.test(message) ||
    /Operation not permitted/i.test(message)
  )
}

async function copyAsyncStorageKeysToMmkv(
  keys: readonly string[],
  { overwrite }: { overwrite: boolean }
): Promise<boolean> {
  for (const key of keys) {
    if (!overwrite && mmkvStorage.contains(key)) continue
    try {
      const value = await AsyncStorage.getItem(key)

      if (value != null) {
        if (['true', 'false'].includes(value)) {
          mmkvStorage.set(key, value === 'true')
        } else {
          mmkvStorage.set(key, value)
        }

        // AsyncStorage.removeItem(key)
      }
    } catch (error) {
      return false
      /** Can't handle error, allow to fail. */
    }
  }
  return true
}

/**
 * Copies legacy AsyncStorage data into MMKV and flips the migration flag.
 *
 * Resolves `true` when legacy data was copied and the JS bundle must reload so
 * already-hydrated stores re-read from MMKV. Fresh installs have nothing to
 * copy, so they skip the reload — `Updates.reloadAsync()` during first launch
 * strands dev clients on the splash screen ("app context has been lost").
 */
export async function migrateFromAsyncStorage(): Promise<boolean> {
  let asyncStorageKeys: readonly string[]
  try {
    asyncStorageKeys = await AsyncStorage.getAllKeys()
  } catch (error) {
    // Transient locked-device / IO read failure: leave the migration flag
    // unset so it retries on a later launch instead of crashing hydration.
    // See JW-TIME-C5.
    if (isTransientStorageReadError(error)) {
      return false
    }
    throw error
  }

  if (asyncStorageKeys.length > 0) {
    const copied = await copyAsyncStorageKeysToMmkv(asyncStorageKeys, {
      overwrite: true,
    })
    if (!copied) return false
    mmkvStorage.set('hasMigratedFromAsyncStorage', true)
    return true
  }

  // Fresh install: switch stores to MMKV now, then sweep up any persist writes
  // that landed in AsyncStorage before the flag flipped. MMKV wins on conflict
  // because it already holds the newer post-flip write.
  mmkvStorage.set('hasMigratedFromAsyncStorage', true)
  try {
    await copyAsyncStorageKeysToMmkv(await AsyncStorage.getAllKeys(), {
      overwrite: false,
    })
  } catch {
    // Best effort; the next persist write of each store lands in MMKV anyway.
  }
  return false
}

/**
 * Wraps the native AsyncStorage adapter used by zustand persist for users who
 * have not yet migrated to MMKV.
 *
 * On iOS, AsyncStorage's native module writes its `manifest.json` (and value
 * files) under `Library/Application Support/.../RCTAsyncLocalStorage_V1`. When
 * the app persists state while the device is locked, those files can be
 * unwritable due to data protection (NSCocoaErrorDomain Code=513 /
 * NSPOSIXErrorDomain Code=1 "Operation not permitted"), and `setItem` rejects.
 *
 * These failures are transient — the next write once the device is unlocked
 * succeeds — so swallowing them here keeps an unhandled rejection from
 * surfacing to the user and error tracking. We drop a breadcrumb for visibility
 * but do not re-throw. The dropped write is recovered by the next persist
 * cycle.
 *
 * Reads are guarded the same way: a transient locked-device read
 * (NSCocoaErrorDomain Code=257, JW-TIME-C5) degrades to a cache-miss (`null`)
 * so hydration doesn't crash; non-transient read errors still throw. Removes
 * pass through unchanged. See issues JW-TIME-C8 / JW-TIME-C5.
 */
export const GuardedAsyncStorage: StateStorage = {
  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, value)
    } catch (error) {
      errorTracking.addBreadcrumb({
        category: 'storage',
        level: 'warning',
        message: 'AsyncStorage.setItem failed; skipping persist',
        data: { key: name, error: String(error) },
      })
      // Transient write failure (e.g. device locked). Skip rather than throw.
    }
  },
  getItem: async (name) => {
    try {
      return await AsyncStorage.getItem(name)
    } catch (error) {
      if (isTransientStorageReadError(error)) {
        errorTracking.addBreadcrumb({
          category: 'storage',
          level: 'warning',
          message: 'AsyncStorage.getItem failed; treating as cache-miss',
          data: { key: name, error: String(error) },
        })
        return null
      }
      throw error
    }
  },
  removeItem: (name) => AsyncStorage.removeItem(name),
}

/** MMKV storage interface for Zustand middleware */
export const MmkvStorage: StateStorage = {
  setItem: (name, value) => {
    return mmkvStorage.set(name, value)
  },
  getItem: (name) => {
    const value = mmkvStorage.getString(name)
    return value ?? null
  },
  removeItem: (name) => {
    return mmkvStorage.delete(name)
  },
}

/**
 * Zustand persist storage that follows the migration flag on every call, so
 * stores created before the first-launch migration switch to MMKV without a JS
 * reload.
 */
const activeStorage = () =>
  hasMigratedFromAsyncStorage() ? MmkvStorage : GuardedAsyncStorage

export const PersistStorage: StateStorage = {
  setItem: (name, value) => activeStorage().setItem(name, value),
  getItem: (name) => activeStorage().getItem(name),
  removeItem: (name) => activeStorage().removeItem(name),
}
