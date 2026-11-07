import { browserIndexedDB } from '@/lib/webStorage/browserIndexedDB'
import { transactionDone } from '@/lib/webStorage/idb'

export const SECURE_KV_DATABASE_NAME = 'witnesswork-keys'
const VERSION = 1
const STORE = 'kv'

type Options = { indexedDB: IDBFactory | undefined }

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

export function createSecureKv({ indexedDB }: Options) {
  let connection: Promise<IDBDatabase> | undefined

  function open(): Promise<IDBDatabase> {
    if (!indexedDB) {
      return Promise.reject(new Error('secureKv is only available on the web'))
    }
    connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(SECURE_KV_DATABASE_NAME, VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE)
        }
      }
      request.onsuccess = () => {
        const db = request.result

        const forget = () => {
          db.close()
          connection = undefined
        }
        db.onversionchange = forget
        db.onclose = () => (connection = undefined)
        resolve(db)
      }
      request.onerror = () => {
        connection = undefined
        reject(request.error)
      }
      request.onblocked = () => {
        connection = undefined
        reject(new Error('secureKv: opening was blocked by another tab'))
      }
    })
    return connection
  }

  async function run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const db = await open()
    const tx = db.transaction(STORE, mode)
    const result = done(action(tx.objectStore(STORE)))

    result.catch(() => {})
    await transactionDone(tx)
    return result
  }

  return {
    available: indexedDB !== undefined,

    get: <T = unknown>(key: string) =>
      run('readonly', (store) => store.get(key)) as Promise<T | undefined>,

    set: async (key: string, value: unknown) => {
      await run('readwrite', (store) => store.put(value, key))
    },
    delete: async (key: string) => {
      await run('readwrite', (store) => store.delete(key))
    },

    clearAll: async () => {
      await run('readwrite', (store) => store.clear())
    },
    close() {
      void connection?.then(
        (db) => db.close(),
        () => undefined
      )
      connection = undefined
    },
  }
}

export type SecureKv = ReturnType<typeof createSecureKv>

export const secureKv = createSecureKv({ indexedDB: browserIndexedDB() })
