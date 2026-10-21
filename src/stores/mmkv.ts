import AsyncStorage from '@react-native-async-storage/async-storage'
import { errorTracking } from '@/lib/errorTracking'
import { captureExceptionThrottled } from '@/lib/throttledErrorReport'
import { MMKV } from 'react-native-mmkv'
import { StateStorage } from 'zustand/middleware'

export const mmkvStorage = new MMKV()

/**
 * MMKV's file is `NSFileProtectionCompleteUntilFirstUserAuthentication`: iOS
 * keeps it closed until the device is first unlocked after a restart, and it
 * can launch the app in the background before then (a background task, a push,
 * prewarming). MMKV then reads as empty and refuses every write, and it doesn't
 * try the file again for the rest of the process. Every store would hydrate its
 * defaults, so the app would show Onboarding, and the reminder pass would
 * cancel the User's reminders. Android apps don't start before the first unlock
 * (none of ours is direct boot aware), so this only happens on iOS.
 *
 * Checked once, before any store hydrates. A file with data in it is open even
 * when a full disk turns a write down; a fresh install takes the write.
 */
const STORAGE_PROBE_KEY = 'storageProbe'
const DEV_LOCKED_LAUNCH_KEY = 'devSimulateLockedLaunch'

function storageRefusesWrites(): boolean {
  if (mmkvStorage.size > 0) return false
  try {
    mmkvStorage.set(STORAGE_PROBE_KEY, true)
    return false
  } catch {
    return true
  }
}

/** Dev builds: `__WW_DEV__.simulateLockedLaunch()` sets it before a reload. */
const devLockedLaunch =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  mmkvStorage.getBoolean(DEV_LOCKED_LAUNCH_KEY) === true

let storageLocked = devLockedLaunch || storageRefusesWrites()

/**
 * True while this launch can't reach its saved data. Persisted stores then read
 * nothing and write nothing, so their defaults never overwrite the User's
 * data.
 */
export const isStorageLocked = () => storageLocked

/**
 * Opens MMKV's file again once the device is unlocked: `trim` drops MMKV's
 * cache, which makes it reload the file. True when the data can be read and
 * written again. The caller must then reload the app, because every store
 * already hydrated its defaults; writes stay blocked until that reload.
 */
export function reopenLockedStorage(): boolean {
  if (devLockedLaunch) {
    mmkvStorage.delete(DEV_LOCKED_LAUNCH_KEY)
    return true
  }
  try {
    mmkvStorage.trim()
  } catch {
    // Still closed; the check below says so.
  }
  return !storageRefusesWrites()
}

/**
 * Carries on with storage as it is. For a launch whose storage still fails
 * while the app is in use, which a locked device can't explain.
 */
export function releaseStorageLock() {
  storageLocked = false
}

/**
 * Dev builds: the next launch behaves as one before the first unlock, until the
 * app comes back from the background (a simulator launches it in front).
 */
export function simulateLockedLaunch() {
  mmkvStorage.set(DEV_LOCKED_LAUNCH_KEY, true)
}

export const isLockedLaunchSimulated = () => devLockedLaunch

const MIGRATED_FROM_ASYNC_STORAGE_KEY = 'hasMigratedFromAsyncStorage'

export const hasMigratedFromAsyncStorage = () =>
  mmkvStorage.getBoolean(MIGRATED_FROM_ASYNC_STORAGE_KEY)

/**
 * Empties the default MMKV instance (a reset). Stores go on saving to MMKV:
 * without the migration flag they'd save to AsyncStorage until the next launch
 * copied it back.
 */
export function clearMmkvStorage() {
  mmkvStorage.clearAll()
  mmkvStorage.set(MIGRATED_FROM_ASYNC_STORAGE_KEY, true)
}

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
 * copy, so they skip the reload — `reloadApp()` during first launch strands dev
 * clients on the splash screen ("app context has been lost").
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
    mmkvStorage.set(MIGRATED_FROM_ASYNC_STORAGE_KEY, true)
    return true
  }

  // Fresh install: switch stores to MMKV now, then sweep up any persist writes
  // that landed in AsyncStorage before the flag flipped. MMKV wins on conflict
  // because it already holds the newer post-flip write.
  mmkvStorage.set(MIGRATED_FROM_ASYNC_STORAGE_KEY, true)
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

/**
 * MMKV storage interface for Zustand middleware.
 *
 * MMKV throws `Failed to set <key>!` when a write fails, e.g. on a launch while
 * the device is locked. Like `GuardedAsyncStorage`, writes don't throw: zustand
 * calls `setItem` synchronously inside `set`, so a throw would break the action
 * that changed the store even though its state is already updated in memory.
 * The next write tries again.
 */
export const MmkvStorage: StateStorage = {
  setItem: (name, value) => {
    if (storageLocked) return
    try {
      mmkvStorage.set(name, value)
    } catch (error) {
      captureExceptionThrottled(`mmkv:${name}`, error, { storageKey: name })
    }
  },
  getItem: (name) => {
    if (storageLocked) return null
    const value = mmkvStorage.getString(name)
    return value ?? null
  },
  removeItem: (name) => {
    if (storageLocked) return
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
  setItem: (name, value) =>
    storageLocked ? undefined : activeStorage().setItem(name, value),
  getItem: (name) => (storageLocked ? null : activeStorage().getItem(name)),
  removeItem: (name) =>
    storageLocked ? undefined : activeStorage().removeItem(name),
}
