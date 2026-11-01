import AsyncStorage from '@react-native-async-storage/async-storage'
import { errorTracking } from '@/lib/errorTracking'
import { captureExceptionThrottled } from '@/lib/throttledErrorReport'
import { MMKV } from 'react-native-mmkv'
import { StateStorage } from 'zustand/middleware'

export const mmkvStorage = new MMKV()

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

const devLockedLaunch =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  mmkvStorage.getBoolean(DEV_LOCKED_LAUNCH_KEY) === true

let storageLocked = devLockedLaunch || storageRefusesWrites()

export const isStorageLocked = () => storageLocked

export function reopenLockedStorage(): boolean {
  if (devLockedLaunch) {
    mmkvStorage.delete(DEV_LOCKED_LAUNCH_KEY)
    return true
  }
  try {
    mmkvStorage.trim()
  } catch {}
  return !storageRefusesWrites()
}

export function releaseStorageLock() {
  storageLocked = false
}

export function simulateLockedLaunch() {
  mmkvStorage.set(DEV_LOCKED_LAUNCH_KEY, true)
}

export const isLockedLaunchSimulated = () => devLockedLaunch

const MIGRATED_FROM_ASYNC_STORAGE_KEY = 'hasMigratedFromAsyncStorage'

export const hasMigratedFromAsyncStorage = () =>
  mmkvStorage.getBoolean(MIGRATED_FROM_ASYNC_STORAGE_KEY)

export function clearMmkvStorage() {
  mmkvStorage.clearAll()
  mmkvStorage.set(MIGRATED_FROM_ASYNC_STORAGE_KEY, true)
}

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
      }
    } catch (error) {
      return false
    }
  }
  return true
}

export async function migrateFromAsyncStorage(): Promise<boolean> {
  let asyncStorageKeys: readonly string[]
  try {
    asyncStorageKeys = await AsyncStorage.getAllKeys()
  } catch (error) {
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

  mmkvStorage.set(MIGRATED_FROM_ASYNC_STORAGE_KEY, true)
  try {
    await copyAsyncStorageKeysToMmkv(await AsyncStorage.getAllKeys(), {
      overwrite: false,
    })
  } catch {}
  return false
}

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

const activeStorage = () =>
  hasMigratedFromAsyncStorage() ? MmkvStorage : GuardedAsyncStorage

export const PersistStorage: StateStorage = {
  setItem: (name, value) =>
    storageLocked ? undefined : activeStorage().setItem(name, value),
  getItem: (name) => (storageLocked ? null : activeStorage().getItem(name)),
  removeItem: (name) =>
    storageLocked ? undefined : activeStorage().removeItem(name),
}
