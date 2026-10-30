import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage'
import { webStores } from '@/lib/webStorage/webStores'

const ID = 'async-storage'

const getItem = (key: string) => {
  const value = webStores.get(ID, key)
  return typeof value === 'string' ? value : null
}

/**
 * AsyncStorage on the web, which Metro swaps in (metro/bundleRedirects.js): its
 * own web build uses `localStorage`. Nothing reads it on the web, since stores
 * persist to MMKV there, but whatever does lands in the store database.
 */
const WebAsyncStorage: AsyncStorageStatic = {
  getItem: async (key) => getItem(key),
  setItem: async (key, value) => webStores.set(ID, key, value),
  removeItem: async (key) => webStores.delete(ID, key),
  mergeItem: async (key, value) => {
    const current = getItem(key)
    webStores.set(
      ID,
      key,
      JSON.stringify({
        ...(current ? JSON.parse(current) : {}),
        ...JSON.parse(value),
      })
    )
  },
  clear: async () => webStores.clear(ID),
  getAllKeys: async () => webStores.keys(ID),
  flushGetRequests: () => {},
  multiGet: async (keys) => keys.map((key) => [key, getItem(key)] as const),
  multiSet: async (pairs) => {
    for (const [key, value] of pairs) webStores.set(ID, key, value)
  },
  multiRemove: async (keys) => {
    for (const key of keys) webStores.delete(ID, key)
  },
  multiMerge: async (pairs) => {
    for (const [key, value] of pairs)
      await WebAsyncStorage.mergeItem(key, value)
  },
}

export default WebAsyncStorage
