import type { Configuration } from 'react-native-mmkv'
import type { NativeMMKV } from 'react-native-mmkv/lib/typescript/src/Types'
import { webStores } from '@/lib/webStorage/webStores'

/**
 * React-native-mmkv's web `createMMKV`, which Metro swaps in on the web
 * (metro/bundleRedirects.js). The package's own keeps everything in
 * `localStorage`; this keeps each instance's keys in the page's store database,
 * so `new MMKV(...)` works unchanged everywhere in the app.
 */
export const createMMKV = (config: Configuration): NativeMMKV => {
  if (config.encryptionKey != null) {
    throw new Error("MMKV: 'encryptionKey' is not supported on Web!")
  }
  const id = config.id
  const read = (key: string) => webStores.get(id, key)

  return {
    set: (key, value) => webStores.set(id, key, value),
    getString: (key) => {
      const value = read(key)
      return typeof value === 'string' ? value : undefined
    },
    getNumber: (key) => {
      const value = read(key)
      return typeof value === 'number' ? value : undefined
    },
    getBoolean: (key) => {
      const value = read(key)
      return typeof value === 'boolean' ? value : undefined
    },
    getBuffer: (key) => {
      const value = read(key)
      return value instanceof ArrayBuffer ? value.slice(0) : undefined
    },
    contains: (key) => read(key) !== undefined,
    delete: (key) => webStores.delete(id, key),
    getAllKeys: () => webStores.keys(id),
    clearAll: () => webStores.clear(id),
    recrypt: () => {
      throw new Error('`recrypt(..)` is not supported on Web!')
    },
    trim: () => {},
    // Native MMKV reports bytes; callers only ask whether it's empty.
    get size() {
      return webStores.keys(id).length
    },
    isReadOnly: false,
  }
}
