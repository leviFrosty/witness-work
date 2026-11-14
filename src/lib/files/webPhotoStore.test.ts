import 'fake-indexeddb/auto'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createWebPhotoStore,
  webPhotoPath,
  webPhotoPathId,
  deleteWebPhoto,
  getWebPhotoBlob,
  getWebPhotoUrl,
  hasWebPhoto,
  listWebPhotos,
  putWebPhoto,
} from './webPhotoStore'

describe('webPhotoStore', () => {
  let counter = 0
  const revoke = vi.fn()

  beforeEach(() => {
    counter = 0
    revoke.mockClear()
    vi.stubGlobal('URL', {
      createObjectURL: () => `blob:photo-${++counter}`,
      revokeObjectURL: revoke,
    })
  })
  afterEach(() => {
    deleteWebPhoto('a')
    deleteWebPhoto('b')
    vi.unstubAllGlobals()
  })

  it('holds a photo by id', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    putWebPhoto('a', blob)
    expect(hasWebPhoto('a')).toBe(true)
    expect(await getWebPhotoBlob('a')).toBe(blob)
    expect(listWebPhotos().map((p) => p.id)).toEqual(['a'])
  })

  it('gives an empty URL for a photo this page does not have', () => {
    expect(getWebPhotoUrl('missing')).toBe('')
  })

  it('reuses one object URL per photo and revokes it on delete or replace', () => {
    putWebPhoto('a', new Blob(['1']))
    const url = getWebPhotoUrl('a')
    expect(getWebPhotoUrl('a')).toBe(url)
    putWebPhoto('a', new Blob(['2']))
    expect(revoke).toHaveBeenCalledWith(url)
    const next = getWebPhotoUrl('a')
    expect(next).not.toBe(url)
    deleteWebPhoto('a')
    expect(revoke).toHaveBeenCalledWith(next)
    expect(hasWebPhoto('a')).toBe(false)
  })
})

describe('webPhotoStore in IndexedDB', () => {
  const blob = (text: string) => new Blob([text], { type: 'image/jpeg' })

  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:photo',
      revokeObjectURL: () => {},
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps a photo for the next page load, with the time it was saved', async () => {
    const indexedDB = new IDBFactory()
    const first = createWebPhotoStore({ indexedDB, now: () => 1234 })
    first.put('a', blob('one'))
    await first.settled()

    const second = createWebPhotoStore({ indexedDB })
    expect(second.has('a')).toBe(false)
    await second.ready()
    expect(second.info('a')).toEqual({ size: 3, modifiedAt: 1234 })
    expect(await (await second.blob('a'))?.text()).toBe('one')
    expect((await second.blob('a'))?.type).toBe('image/jpeg')
  })

  it('forgets a deleted photo', async () => {
    const indexedDB = new IDBFactory()
    const first = createWebPhotoStore({ indexedDB })
    first.put('a', blob('one'))
    first.delete('a')
    await first.settled()

    const second = createWebPhotoStore({ indexedDB })
    await second.ready()
    expect(second.list()).toEqual([])
  })

  it('keeps what changed while the saved photos were still loading', async () => {
    const indexedDB = new IDBFactory()
    const first = createWebPhotoStore({ indexedDB })
    first.put('replaced', blob('old'))
    first.put('deleted', blob('old'))
    await first.settled()

    const second = createWebPhotoStore({ indexedDB })
    const ready = second.ready()
    second.put('replaced', blob('new'))
    second.delete('deleted')
    await ready
    expect(await (await second.blob('replaced'))?.text()).toBe('new')
    expect(second.has('deleted')).toBe(false)
  })

  it('loads a saved photo when its URL is first asked for, and tells listeners', async () => {
    const indexedDB = new IDBFactory()
    const first = createWebPhotoStore({ indexedDB })
    first.put('a', blob('one'))
    await first.settled()

    const second = createWebPhotoStore({ indexedDB })
    const changes: boolean[] = []
    const loaded = new Promise<void>((resolve) =>
      second.onChange(() => {
        changes.push(second.pending('a'))
        if (second.url('a')) resolve()
      })
    )
    expect(second.pending('a')).toBe(true)
    expect(second.url('a')).toBe('')
    await loaded
    expect(second.url('a')).toBe('blob:photo')
    expect(second.pending('a')).toBe(false)
    expect(second.pending('missing')).toBe(false)
    expect(changes).toEqual([true, false])
  })

  it('reads only the photos that are asked for', async () => {
    const indexedDB = new IDBFactory()
    const first = createWebPhotoStore({ indexedDB })
    first.put('a', blob('one'))
    first.put('b', blob('two'))
    await first.settled()

    const reads = vi.spyOn(IDBObjectStore.prototype, 'get')
    const second = createWebPhotoStore({ indexedDB })
    await second.ready()
    expect(second.list().map((photo) => photo.id)).toEqual(['a', 'b'])
    expect(reads).not.toHaveBeenCalled()
    await second.blob('b')
    await second.blob('b')
    expect(reads.mock.calls).toEqual([['b']])
    reads.mockRestore()
  })

  it('stops holding a photo whose bytes the browser lost', async () => {
    const indexedDB = new IDBFactory()
    const first = createWebPhotoStore({ indexedDB })
    first.put('a', blob('one'))
    await first.settled()
    const db = await new Promise<IDBDatabase>((resolve) => {
      const opening = indexedDB.open('witnesswork-photos')
      opening.onsuccess = () => resolve(opening.result)
    })
    const tx = db.transaction('photos', 'readwrite')
    tx.objectStore('photos').delete('a')
    await new Promise((resolve) => (tx.oncomplete = resolve))
    db.close()

    const second = createWebPhotoStore({ indexedDB })
    await second.ready()
    expect(second.has('a')).toBe(true)
    expect(await second.blob('a')).toBeUndefined()
    expect(second.has('a')).toBe(false)
  })

  it('wipes every photo and writes nothing afterwards', async () => {
    const indexedDB = new IDBFactory()
    const first = createWebPhotoStore({ indexedDB })
    first.put('a', blob('one'))
    await first.wipe()
    first.put('b', blob('two'))
    await first.settled()

    const second = createWebPhotoStore({ indexedDB })
    await second.ready()
    expect(second.list()).toEqual([])
  })

  it('holds photos in memory when the browser has no IndexedDB', async () => {
    const store = createWebPhotoStore({ indexedDB: undefined })
    await store.ready()
    store.put('a', blob('one'))
    await store.settled()
    expect(store.has('a')).toBe(true)
    expect(store.problems()).toEqual([])
  })

  it('reports a failed save once and keeps the photo for this page load', async () => {
    const indexedDB = new IDBFactory()
    const store = createWebPhotoStore({ indexedDB })
    await store.ready()
    const problems: string[] = []
    store.onProblem((problem) => problems.push(problem))
    const quota = new DOMException('full', 'QuotaExceededError')
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw quota
    })
    store.put('a', blob('one'))
    store.put('b', blob('two'))
    await store.settled()
    vi.restoreAllMocks()
    expect(problems).toEqual(['quotaExceeded'])
    expect(store.has('a')).toBe(true)
  })

  it('names a photo by a path the sync pass can hand back', () => {
    expect(webPhotoPathId(webPhotoPath('abc-123'))).toBe('abc-123')
    expect(webPhotoPathId('file:///photos/abc-123.jpg')).toBeUndefined()
  })
})
