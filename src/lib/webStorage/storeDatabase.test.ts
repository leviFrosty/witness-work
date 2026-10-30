import 'fake-indexeddb/auto'
import { forceCloseDatabase, IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createStoreDatabase,
  type StoreDatabase,
  type StoreProblem,
} from '@/lib/webStorage/storeDatabase'

let databases: StoreDatabase[] = []

function open(factory: IDBFactory | undefined = new IDBFactory()) {
  const db = createStoreDatabase({ indexedDB: factory })
  databases.push(db)
  return db
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const db of databases) db.close()
  databases = []
})

/** The connections a factory opens, newest last. */
function captureConnections(factory: IDBFactory) {
  const connections: IDBDatabase[] = []
  const openDatabase = factory.open.bind(factory)
  vi.spyOn(factory, 'open').mockImplementation((...args) => {
    const request = openDatabase(...args)
    request.addEventListener('success', () => connections.push(request.result))
    return request
  })
  return connections
}

/** What a fresh tab on the same browser profile would load. */
async function reload(factory: IDBFactory) {
  const next = open(factory)
  await next.hydrate()
  return next
}

describe('storeDatabase', () => {
  it('reads back what an earlier session wrote, per id and with its type', async () => {
    const factory = new IDBFactory()
    const first = open(factory)
    await first.hydrate()
    first.set('mmkv.default', 'contacts', '{"state":{}}')
    first.set('mmkv.default', 'count', 3)
    first.set('mmkv.default', 'flag', false)
    first.set('install-id', 'installId', 'abc')
    first.set('pet-secrets', 'bytes', new Uint8Array([1, 2, 3]).buffer)
    await first.flush()

    const second = await reload(factory)
    expect(second.get('mmkv.default', 'contacts')).toBe('{"state":{}}')
    expect(second.get('mmkv.default', 'count')).toBe(3)
    expect(second.get('mmkv.default', 'flag')).toBe(false)
    expect(second.get('install-id', 'installId')).toBe('abc')
    expect(second.keys('install-id')).toEqual(['installId'])
    expect(
      new Uint8Array(second.get('pet-secrets', 'bytes') as ArrayBuffer)
    ).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('answers reads from memory straight after a write', async () => {
    const db = open()
    await db.hydrate()
    db.set('a', 'k', 'v')
    expect(db.get('a', 'k')).toBe('v')
    db.delete('a', 'k')
    expect(db.get('a', 'k')).toBeUndefined()
  })

  it('coalesces the writes of one task into one transaction, keeping the last value', async () => {
    const factory = new IDBFactory()
    const db = open(factory)
    await db.hydrate()
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction')
    db.set('a', 'k', '1')
    db.set('a', 'k', '2')
    db.set('a', 'other', 'x')
    db.delete('a', 'other')
    await db.flush()
    expect(transaction).toHaveBeenCalledTimes(1)
    transaction.mockRestore()

    const next = await reload(factory)
    expect(next.get('a', 'k')).toBe('2')
    expect(next.keys('a')).toEqual(['k'])
  })

  it('issues each task’s writes without waiting for a later flush', async () => {
    const factory = new IDBFactory()
    const db = open(factory)
    await db.hydrate()
    db.set('a', 'k', '1')
    // The write goes out at the end of this task; nothing calls flush.
    await new Promise((resolve) => setTimeout(resolve, 20))
    const next = await reload(factory)
    expect(next.get('a', 'k')).toBe('1')
  })

  it('keeps writes from later tasks in order', async () => {
    const factory = new IDBFactory()
    const db = open(factory)
    await db.hydrate()
    for (let i = 0; i < 20; i++) {
      db.set('a', 'k', String(i))
      await Promise.resolve()
    }
    await db.flush()
    const next = await reload(factory)
    expect(next.get('a', 'k')).toBe('19')
  })

  it('clears one id, and writes after the clear survive it', async () => {
    const factory = new IDBFactory()
    const db = open(factory)
    await db.hydrate()
    db.set('a', 'old', '1')
    db.set('b', 'keep', '1')
    await db.flush()
    db.set('a', 'dropped', '1')
    db.clear('a')
    db.set('a', 'new', '2')
    expect(db.keys('a')).toEqual(['new'])
    await db.flush()

    const next = await reload(factory)
    expect(next.keys('a')).toEqual(['new'])
    expect(next.get('b', 'keep')).toBe('1')
  })

  it('keeps memory and tells once when a write fails for lack of space, then saves on retry', async () => {
    const factory = new IDBFactory()
    const db = open(factory)
    await db.hydrate()
    db.set('a', 'before', 'x')
    await db.flush()
    const problems: StoreProblem[] = []
    db.onProblem((problem) => problems.push(problem))

    const put = IDBObjectStore.prototype.put
    const failing = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (this: IDBObjectStore) {
        throw new DOMException('full', 'QuotaExceededError')
      })
    db.set('a', 'k', 'edited')
    await db.flush()
    db.set('a', 'k2', 'edited too')
    await db.flush()
    expect(problems).toEqual(['quotaExceeded'])
    expect(db.get('a', 'k')).toBe('edited')
    expect(db.pendingWrites()).toBe(true)

    failing.mockImplementation(put)
    await db.flush()
    expect(db.pendingWrites()).toBe(false)
    failing.mockRestore()

    const next = await reload(factory)
    expect(next.get('a', 'k')).toBe('edited')
    expect(next.get('a', 'k2')).toBe('edited too')
    expect(next.get('a', 'before')).toBe('x')
  })

  it('reports a transaction that aborts with a quota error', async () => {
    const db = open()
    await db.hydrate()
    const problems: StoreProblem[] = []
    db.onProblem((problem) => problems.push(problem))
    const transaction = IDBDatabase.prototype.transaction
    const spy = vi
      .spyOn(IDBDatabase.prototype, 'transaction')
      .mockImplementation(function (
        this: IDBDatabase,
        ...args: Parameters<IDBDatabase['transaction']>
      ) {
        const tx = transaction.apply(this, args)
        // The browser runs out of space as the transaction commits.
        tx.commit = () => {
          Object.defineProperty(tx, 'error', {
            value: new DOMException('full', 'QuotaExceededError'),
          })
          tx.abort()
        }
        return tx
      })
    db.set('a', 'k', 'v')
    await db.flush()
    spy.mockRestore()
    expect(problems).toEqual(['quotaExceeded'])
    expect(db.pendingWrites()).toBe(true)
  })

  it('rewrites an id in full after a failed clear, so stale rows never come back', async () => {
    const factory = new IDBFactory()
    const db = open(factory)
    await db.hydrate()
    db.set('a', 'stale', '1')
    await db.flush()

    const failing = vi
      .spyOn(IDBObjectStore.prototype, 'delete')
      .mockImplementation(() => {
        throw new DOMException('nope', 'UnknownError')
      })
    db.clear('a')
    db.set('a', 'fresh', '2')
    await db.flush()
    failing.mockRestore()
    await db.flush()

    const next = await reload(factory)
    expect(next.keys('a')).toEqual(['fresh'])
  })

  it('runs from memory and says so when IndexedDB is missing', async () => {
    const db = createStoreDatabase({ indexedDB: undefined })
    const problems: StoreProblem[] = []
    db.onProblem((problem) => problems.push(problem))
    await db.hydrate()
    expect(db.mode()).toBe('memoryOnly')
    db.set('a', 'k', 'v')
    expect(db.get('a', 'k')).toBe('v')
    await db.flush()
    expect(problems).toEqual(['unavailable'])
  })

  it('runs from memory when the browser refuses to open the database', async () => {
    const factory = new IDBFactory()
    vi.spyOn(factory, 'open').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const db = open(factory)
    const problems: StoreProblem[] = []
    db.onProblem((problem) => problems.push(problem))
    await db.hydrate()
    expect(db.mode()).toBe('memoryOnly')
    expect(problems).toEqual(['unavailable'])
  })

  it('gives up waiting on a blocked open and runs from memory', async () => {
    const factory = new IDBFactory()
    vi.spyOn(factory, 'open').mockImplementation(() => {
      const request = {} as IDBOpenDBRequest
      queueMicrotask(() => request.onblocked?.(new Event('blocked') as never))
      return request
    })
    const db = createStoreDatabase({ indexedDB: factory, openTimeoutMs: 10 })
    databases.push(db)
    const problems: StoreProblem[] = []
    db.onProblem((problem) => problems.push(problem))
    await db.hydrate()
    expect(db.mode()).toBe('memoryOnly')
    expect(problems).toEqual(['unavailable'])
  })

  it('closes its connection when a newer version needs the database', async () => {
    const factory = new IDBFactory()
    const db = open(factory)
    const onVersionChange = vi.fn()
    db.onVersionChange(onVersionChange)
    await db.hydrate()
    db.set('a', 'k', 'v')
    await db.flush()

    await new Promise<void>((resolve, reject) => {
      const request = factory.open('witnesswork-stores', 99)
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
    expect(onVersionChange).toHaveBeenCalledTimes(1)
    expect(db.mode()).toBe('stopped')
  })

  it('stops writing once stopped, and settles what was already issued', async () => {
    const factory = new IDBFactory()
    const db = open(factory)
    await db.hydrate()
    db.set('a', 'k', 'kept')
    await db.stopWriting()
    db.set('a', 'k', 'dropped')
    await db.flush()
    const next = await reload(factory)
    expect(next.get('a', 'k')).toBe('kept')
  })

  it('wipes every row and empties memory', async () => {
    const factory = new IDBFactory()
    const db = open(factory)
    await db.hydrate()
    db.set('a', 'k', 'v')
    db.set('b', 'k', 'v')
    await db.flush()
    await db.wipe()
    expect(db.keys('a')).toEqual([])
    db.set('a', 'after', 'ignored until reload')
    await db.flush()
    const next = await reload(factory)
    expect(next.keys('a')).toEqual([])
    expect(next.keys('b')).toEqual([])
  })

  it('reopens and saves everything again when the browser closes the connection', async () => {
    const factory = new IDBFactory()
    const connections = captureConnections(factory)
    const db = open(factory)
    await db.hydrate()
    db.set('a', 'k', 'v')
    await db.flush()
    forceCloseDatabase(connections[0] as never)
    db.set('a', 'k2', 'v2')
    await db.flush()
    const next = await reload(factory)
    expect(next.get('a', 'k')).toBe('v')
    expect(next.get('a', 'k2')).toBe('v2')
  })

  it('keeps trying to open again when the first try after a forced close fails', async () => {
    const factory = new IDBFactory()
    const connections: IDBDatabase[] = []
    let refuseNext = false
    const openDatabase = factory.open.bind(factory)
    const opens = vi.spyOn(factory, 'open').mockImplementation((...args) => {
      if (refuseNext) {
        refuseNext = false
        throw new DOMException('clearing', 'UnknownError')
      }
      const request = openDatabase(...args)
      request.addEventListener('success', () =>
        connections.push(request.result)
      )
      return request
    })
    const db = createStoreDatabase({ indexedDB: factory, retryMs: 20 })
    databases.push(db)
    await db.hydrate()
    db.set('a', 'k', 'v')
    await db.flush()
    refuseNext = true
    forceCloseDatabase(connections[0] as never)
    db.set('a', 'k2', 'after the clear')
    await db.flush()
    expect(refuseNext).toBe(false)
    expect(opens.mock.calls.length).toBeGreaterThan(1)
    await vi.waitFor(async () => {
      const next = await reload(factory)
      expect(next.get('a', 'k2')).toBe('after the clear')
      expect(next.get('a', 'k')).toBe('v')
    })
  })

  it('opens again when the connection closed without saying so', async () => {
    const factory = new IDBFactory()
    const db = open(factory)
    await db.hydrate()
    db.set('a', 'k', 'v')
    await db.flush()
    const transaction = IDBDatabase.prototype.transaction
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(
      () => {
        throw new DOMException('closed', 'InvalidStateError')
      }
    )
    db.set('a', 'k2', 'v2')
    await db.flush()
    expect(IDBDatabase.prototype.transaction).not.toBe(transaction)
    await vi.waitFor(async () => {
      await db.flush()
      const next = await reload(factory)
      expect(next.get('a', 'k2')).toBe('v2')
    })
  })
})
