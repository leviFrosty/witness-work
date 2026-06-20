import AsyncStorage from '@react-native-async-storage/async-storage'
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
 * IOS occasionally denies writes to the AsyncStorage container with
 * `NSCocoaErrorDomain Code=513` ("You don't have permission to save the file …
 * in the folder RCTAsyncLocalStorage_V1"), backed by a POSIX `Operation not
 * permitted`. This is transient — typically during backup/restore, while the
 * data-protection class has the container locked, or under low-disk pressure —
 * and not something the user can act on. Left unguarded, zustand-persist's
 * value write rejects and surfaces as an unhandled rejection in Sentry
 * (JW-TIME-C9). Swallow the expected permission/IO failure so persistence
 * degrades gracefully (the value simply isn't persisted this cycle) instead of
 * crashing the write. Only relevant for users still on AsyncStorage who haven't
 * migrated to MMKV yet.
 */
const isExpectedStorageWriteError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('Code=513') ||
    message.includes("don't have permission to save") ||
    message.includes('Operation not permitted') ||
    message.includes('Failed to write value')
  )
}

/**
 * AsyncStorage wrapped so value writes that hit the transient iOS permission/IO
 * failure above don't throw. Reads and removals pass through unchanged.
 */
export const SafeAsyncStorage: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, value)
    } catch (error) {
      if (isExpectedStorageWriteError(error)) {
        /** Expected transient failure — skip this write, don't report. */
        return
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
