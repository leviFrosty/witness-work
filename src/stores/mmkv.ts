import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Sentry from '@sentry/react-native'
import { MMKV } from 'react-native-mmkv'
import { StateStorage } from 'zustand/middleware'

export const mmkvStorage = new MMKV()

export const hasMigratedFromAsyncStorage = () =>
  mmkvStorage.getBoolean('hasMigratedFromAsyncStorage')

export async function migrateFromAsyncStorage(): Promise<void> {
  const asyncStorageKeys = await AsyncStorage.getAllKeys()

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
 * Reads/removes are passed through unchanged (the read path is handled
 * separately). See Sentry JW-TIME-C8 (and the C5/C9 AsyncStorage cluster).
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
  getItem: (name) => AsyncStorage.getItem(name),
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
