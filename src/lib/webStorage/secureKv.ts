/**
 * A small async key/value store for the browser's account secrets: the
 * non-extractable WebCrypto key and the session records (ADR 0038 §8). Values
 * are structured clones, so a `CryptoKey` comes back usable and still
 * non-extractable, and nothing is turned into a string. It's a database of its
 * own, apart from the stores, so wiping or rewriting store data never touches
 * it. See docs/web-storage.md.
 *
 * Web only: on iOS and Android `available` is false and every call rejects.
 */

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
        // A newer version or a cleared site: open again on the next call.
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
    // The transaction's error is the one to report.
    result.catch(() => {})
    await transactionDone(tx)
    return result
  }

  return {
    available: indexedDB !== undefined,
    /** The value saved under `key`, or undefined. */
    get: <T = unknown>(key: string) =>
      run('readonly', (store) => store.get(key)) as Promise<T | undefined>,
    /** Saves a structured-cloneable value; rejects on one that isn't. */
    set: async (key: string, value: unknown) => {
      await run('readwrite', (store) => store.put(value, key))
    },
    delete: async (key: string) => {
      await run('readwrite', (store) => store.delete(key))
    },
    /** Deletes every key, for sign-out. */
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

/** The page's secure key/value store. */
export const secureKv = createSecureKv({ indexedDB: browserIndexedDB() })
