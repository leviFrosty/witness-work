import type { Configuration } from 'react-native-mmkv'
import type { NativeMMKV } from 'react-native-mmkv/lib/typescript/src/Types'
import { webStores } from '@/lib/webStorage/webStores'

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

    get size() {
      return webStores.keys(id).length
    },
    isReadOnly: false,
  }
}
