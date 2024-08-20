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
