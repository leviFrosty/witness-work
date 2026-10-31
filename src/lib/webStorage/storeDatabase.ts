/**
 * The web's saved stores: every MMKV instance's keys, kept in memory so reads
 * stay synchronous, loaded from IndexedDB before the app's first render and
 * written back to it after each task. See docs/web-storage.md.
 */

import { transactionDone } from '@/lib/webStorage/idb'

export type StoredValue = string | number | boolean | ArrayBuffer

/**
 * - `ready`: memory mirrors IndexedDB and writes go through.
 * - `memoryOnly`: IndexedDB couldn't be opened. Nothing is ever written to it,
 *   because memory doesn't hold what it has.
 * - `stopped`: another tab or a newer version took over, or the data was wiped.
 *   Writes are dropped until the page reloads.
 */
export type StoreMode =
  | 'idle'
  | 'hydrating'
  | 'ready'
  | 'memoryOnly'
  | 'stopped'

/** What the User is told about, once each per page load. */
export type StoreProblem = 'unavailable' | 'quotaExceeded' | 'writeFailed'

export const STORE_DATABASE_NAME = 'witnesswork-stores'
const VERSION = 1
const ENTRIES = 'entries'

const REMOVED = Symbol('removed')
type Pending = StoredValue | typeof REMOVED

type Batch = {
  cleared: string[]
  rewrite: string[]
  entries: [id: string, key: string, value: Pending][]
}

type Options = {
  indexedDB: IDBFactory | undefined
  /** How long to wait on an open that other connections block. */
  openTimeoutMs?: number
  /** How long a failed write waits before it tries again on its own. */
  retryMs?: number
}

const isQuotaError = (error: unknown) =>
  error instanceof Error || error instanceof DOMException
    ? error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    : false

const copyValue = (value: StoredValue | ArrayBufferView): StoredValue => {
  if (value instanceof ArrayBuffer) return value.slice(0)
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength
    )
    return bytes.slice().buffer
  }
  return value
}

const settled = <T>(promise: Promise<T>) =>
  promise.then(
    () => undefined,
    () => undefined
  )

export function createStoreDatabase({
  indexedDB,
  openTimeoutMs = 10_000,
  retryMs = 15_000,
}: Options) {
  const memory = new Map<string, Map<string, StoredValue>>()
  let dirty = new Map<string, Map<string, Pending>>()
  let cleared = new Set<string>()
  let rewrite = new Set<string>()
  const inFlight = new Set<Promise<void>>()
  let mode: StoreMode = 'idle'
  let db: IDBDatabase | undefined
  let reopening: Promise<void> | undefined
  let flushQueued = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  const reported = new Set<StoreProblem>()
  const problemListeners = new Set<(problem: StoreProblem) => void>()
  const versionChangeListeners = new Set<() => void>()

  const report = (problem: StoreProblem) => {
    if (reported.has(problem)) return
    reported.add(problem)
    for (const listener of problemListeners) listener(problem)
  }

  const entriesOf = (id: string) => {
    let entries = memory.get(id)
    if (!entries) memory.set(id, (entries = new Map()))
    return entries
  }

  function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!indexedDB) return reject(new Error('IndexedDB is unavailable'))
      let done = false
      const timer = setTimeout(() => {
        done = true
        reject(new Error('Opening IndexedDB was blocked'))
      }, openTimeoutMs)
      const finish = (fn: () => void) => {
        clearTimeout(timer)
        if (done) return
        done = true
        fn()
      }
      let request: IDBOpenDBRequest
      try {
        request = indexedDB.open(STORE_DATABASE_NAME, VERSION)
      } catch (error) {
        return finish(() => reject(error))
      }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(ENTRIES)) {
          request.result.createObjectStore(ENTRIES)
        }
      }
      request.onsuccess = () => {
        const connection = request.result
        // Late, after the timeout chose memory: never write to it.
        if (done) return connection.close()
        finish(() => resolve(connection))
      }
      // An older version's connection in another tab is in the way. It closes
      // on `versionchange`; if it doesn't, the timeout above runs from memory.
      request.onblocked = () => {}
      request.onerror = () =>
        finish(() => reject(request.error ?? new Error('IndexedDB failed')))
    })
  }

  function adopt(connection: IDBDatabase) {
    db = connection
    connection.onversionchange = () => {
      // Send what's waiting first; closing lets issued writes finish.
      sendPending()
      connection.close()
      if (db === connection) db = undefined
      mode = 'stopped'
      for (const listener of versionChangeListeners) listener()
    }
    // The browser closed it: site data cleared, a disk error.
    connection.onclose = () => {
      if (db === connection) reconnect()
    }
  }

  /**
   * Opens the database again after the browser dropped the connection. Memory
   * still holds everything, so it's all saved again; if opening fails, it tries
   * again later.
   */
  function reconnect() {
    db = undefined
    if (mode !== 'ready' || reopening) return
    for (const id of memory.keys()) rewrite.add(id)
    reopening = openDatabase().then(
      (next) => {
        reopening = undefined
        if (mode !== 'ready') return next.close()
        adopt(next)
        sendPending()
      },
      () => {
        reopening = undefined
        report('writeFailed')
        scheduleRetry()
      }
    )
  }

  function scheduleRetry() {
    if (retryTimer !== undefined) return
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      sendPending()
    }, retryMs)
  }

  async function readAll(connection: IDBDatabase) {
    const tx = connection.transaction(ENTRIES, 'readonly')
    const store = tx.objectStore(ENTRIES)
    const keys = store.getAllKeys()
    const values = store.getAll()
    await transactionDone(tx)
    const all = values.result as StoredValue[]
    ;(keys.result as [string, string][]).forEach(([id, key], index) => {
      const entries = entriesOf(id)
      // A write made before hydration is newer than what was saved.
      if (!entries.has(key) && !dirty.get(id)?.has(key)) {
        entries.set(key, all[index])
      }
    })
  }

  async function hydrate() {
    if (mode !== 'idle') return
    mode = 'hydrating'
    let connection: IDBDatabase | undefined
    try {
      connection = await openDatabase()
      await readAll(connection)
      adopt(connection)
      mode = 'ready'
      sendPending()
    } catch {
      connection?.close()
      db = undefined
      mode = 'memoryOnly'
      dirty = new Map()
      cleared = new Set()
      report('unavailable')
    }
  }

  function scheduleFlush() {
    if (flushQueued) return
    flushQueued = true
    // A microtask, not a timer: background tabs throttle timers, and a write
    // has to be on its way before anything else (another tab taking over, the
    // page closing) can happen.
    queueMicrotask(() => {
      flushQueued = false
      sendPending()
    })
  }

  function takeBatch(): Batch | null {
    if (!dirty.size && !cleared.size && !rewrite.size) return null
    const batch: Batch = {
      cleared: [...cleared],
      rewrite: [...rewrite],
      entries: [],
    }
    for (const [id, keys] of dirty) {
      // A rewrite saves the id's whole memory anyway.
      if (rewrite.has(id)) continue
      for (const [key, value] of keys) batch.entries.push([id, key, value])
    }
    dirty = new Map()
    cleared = new Set()
    rewrite = new Set()
    return batch
  }

  /** The ids a failed batch touched get saved again in full. */
  function retryLater(batch: Batch, error: unknown) {
    for (const id of batch.cleared) rewrite.add(id)
    for (const id of batch.rewrite) rewrite.add(id)
    for (const [id] of batch.entries) rewrite.add(id)
    report(isQuotaError(error) ? 'quotaExceeded' : 'writeFailed')
    scheduleRetry()
  }

  function write(connection: IDBDatabase, batch: Batch) {
    return new Promise<void>((resolve) => {
      let tx: IDBTransaction
      try {
        tx = connection.transaction(ENTRIES, 'readwrite')
      } catch (error) {
        retryLater(batch, error)
        // Closed without telling us (site data cleared): open it again.
        if (
          error instanceof DOMException &&
          error.name === 'InvalidStateError'
        ) {
          if (db === connection) reconnect()
        }
        return resolve()
      }
      tx.oncomplete = () => resolve()
      tx.onabort = () => {
        retryLater(batch, tx.error)
        resolve()
      }
      try {
        const store = tx.objectStore(ENTRIES)
        for (const id of [...batch.cleared, ...batch.rewrite]) {
          store.delete(IDBKeyRange.bound([id], [id, []]))
        }
        for (const id of batch.rewrite) {
          for (const [key, value] of memory.get(id) ?? []) {
            store.put(value, [id, key])
          }
        }
        for (const [id, key, value] of batch.entries) {
          if (value === REMOVED) store.delete([id, key])
          else store.put(value, [id, key])
        }
        // Don't wait for more requests: commit now, before the page can go.
        tx.commit?.()
      } catch (error) {
        tx.onabort = null
        try {
          tx.abort()
        } catch {
          // Already finished.
        }
        retryLater(batch, error)
        resolve()
      }
    })
  }

  function sendPending() {
    if (mode !== 'ready') return
    if (!db) return reconnect()
    const batch = takeBatch()
    if (!batch) return
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer)
      retryTimer = undefined
    }
    const pending = write(db, batch)
    inFlight.add(pending)
    void pending.finally(() => inFlight.delete(pending))
  }

  function markDirty(id: string, key: string, value: Pending) {
    if (mode === 'stopped' || mode === 'memoryOnly') return
    let keys = dirty.get(id)
    if (!keys) dirty.set(id, (keys = new Map()))
    keys.set(key, value)
    scheduleFlush()
  }

  async function settle() {
    while (inFlight.size || reopening) {
      await Promise.all([...inFlight, reopening].map((p) => p && settled(p)))
    }
  }

  return {
    hydrate,
    mode: () => mode,

    get(id: string, key: string): StoredValue | undefined {
      return memory.get(id)?.get(key)
    },
    set(id: string, key: string, value: StoredValue | ArrayBufferView) {
      const copy = copyValue(value)
      entriesOf(id).set(key, copy)
      markDirty(id, key, copy)
    },
    delete(id: string, key: string) {
      memory.get(id)?.delete(key)
      markDirty(id, key, REMOVED)
    },
    keys(id: string): string[] {
      return [...(memory.get(id)?.keys() ?? [])]
    },
    /** Whether any store holds a key. */
    hasEntries(): boolean {
      for (const entries of memory.values()) if (entries.size) return true
      return false
    },
    clear(id: string) {
      memory.get(id)?.clear()
      if (mode === 'stopped' || mode === 'memoryOnly') return
      dirty.delete(id)
      cleared.add(id)
      scheduleFlush()
    },

    /** Sends what's waiting now, and resolves once every write settled. */
    async flush() {
      sendPending()
      await settle()
    },
    /** True while some change isn't saved yet. */
    pendingWrites() {
      return Boolean(
        dirty.size || cleared.size || rewrite.size || inFlight.size
      )
    },
    /** Another tab took over: drop later writes, finish the ones on the way. */
    async stopWriting() {
      if (mode === 'ready') sendPending()
      mode = 'stopped'
      dirty = new Map()
      cleared = new Set()
      await settle()
    },
    /** Deletes every saved row and empties memory; writes stop until reload. */
    async wipe() {
      if (mode === 'ready') mode = 'stopped'
      await settle()
      for (const entries of memory.values()) entries.clear()
      dirty = new Map()
      cleared = new Set()
      rewrite = new Set()
      if (mode === 'memoryOnly' || mode === 'idle') return
      mode = 'stopped'
      const connection = db ?? (await openDatabase())
      const tx = connection.transaction(ENTRIES, 'readwrite')
      tx.objectStore(ENTRIES).clear()
      await transactionDone(tx)
    },

    /** Every problem reported so far, in order. */
    problems: (): StoreProblem[] => [...reported],
    onProblem(listener: (problem: StoreProblem) => void) {
      problemListeners.add(listener)
      return () => void problemListeners.delete(listener)
    },
    onVersionChange(listener: () => void) {
      versionChangeListeners.add(listener)
      return () => void versionChangeListeners.delete(listener)
    },
    close() {
      if (retryTimer !== undefined) clearTimeout(retryTimer)
      retryTimer = undefined
      const connection = db
      db = undefined
      connection?.close()
    },
  }
}

export type StoreDatabase = ReturnType<typeof createStoreDatabase>
