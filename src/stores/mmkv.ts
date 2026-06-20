import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Sentry from '@sentry/react-native'
import { MMKV } from 'react-native-mmkv'
import { StateStorage } from 'zustand/middleware'

export const mmkvStorage = new MMKV()

export const hasMigratedFromAsyncStorage = () =>
  mmkvStorage.getBoolean('hasMigratedFromAsyncStorage')

/**
 * Returns true for transient native AsyncStorage read failures we can't act on
 * — chiefly iOS file-protection errors (NSCocoaErrorDomain 257/513, POSIX
 * EPERM "Operation not permitted") raised when the device is locked, plus
 * generic "Failed to read storage file" IO errors. These are expected, recover
 * on the next read, and should degrade to a cache-miss rather than crash
 * hydration or spam Sentry. See JW-TIME-C5.
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

export async function migrateFromAsyncStorage(): Promise<void> {
  let asyncStorageKeys: readonly string[]
  try {
    asyncStorageKeys = await AsyncStorage.getAllKeys()
  } catch (error) {
    // Transient locked-device / IO read failure: leave the migration flag
    // unset so it retries on a later launch instead of crashing hydration.
    // See JW-TIME-C5.
    if (isTransientStorageReadError(error)) {
      return
    }
    throw error
  }

  for (const key of asyncStorageKeys) {
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
      return
      /** Can't handle error, allow to fail. */
    }
  }

  mmkvStorage.set('hasMigratedFromAsyncStorage', true)
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
 * surfacing to the user and Sentry. We drop a breadcrumb for visibility but do
 * not re-throw. The dropped write is recovered by the next persist cycle.
 *
 * Reads are guarded the same way: a transient locked-device read
 * (NSCocoaErrorDomain Code=257, JW-TIME-C5) degrades to a cache-miss (`null`)
 * so hydration doesn't crash; non-transient read errors still throw. Removes
 * pass through unchanged. See Sentry JW-TIME-C8 / JW-TIME-C5.
 */
export const GuardedAsyncStorage: StateStorage = {
  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, value)
    } catch (error) {
      Sentry.addBreadcrumb({
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
        Sentry.addBreadcrumb({
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
