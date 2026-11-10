import { browserIndexedDB } from '@/lib/webStorage/browserIndexedDB'
import { transactionDone } from '@/lib/webStorage/idb'

export const WEB_PHOTO_DATABASE_NAME = 'witnesswork-photos'
const VERSION = 1
const PHOTOS = 'photos'
const META = 'meta'
const PATH_PREFIX = 'webphoto:'
const OPEN_TIMEOUT_MS = 10_000

export type WebPhotoProblem = 'quotaExceeded' | 'writeFailed'

type Meta = { savedAt: number; size: number; type: string }
type Photo = Meta & {
  blob?: Blob
  url?: string
  loading?: Promise<Blob | undefined>
}

const isQuotaError = (error: unknown) =>
  error instanceof Error || error instanceof DOMException
    ? error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    : false

const isMeta = (value: unknown): value is Meta => {
  const meta = value as Partial<Meta> | null
  return (
    !!meta &&
    typeof meta.savedAt === 'number' &&
    typeof meta.size === 'number' &&
    typeof meta.type === 'string'
  )
}

const request = <T>(pending: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    pending.onsuccess = () => resolve(pending.result)
    pending.onerror = () => reject(pending.error)
  })

export const webPhotoPath = (id: string) => `${PATH_PREFIX}${id}`

export const webPhotoPathId = (path: string): string | undefined =>
  path.startsWith(PATH_PREFIX) ? path.slice(PATH_PREFIX.length) : undefined

export function createWebPhotoStore(options: {
  indexedDB: IDBFactory | undefined
  now?: () => number
  openTimeoutMs?: number
}) {
  const { indexedDB } = options
  const now = options.now ?? Date.now
  const photos = new Map<string, Photo>()
  const touched = new Set<string>()
  const changeListeners = new Set<() => void>()
  const problemListeners = new Set<(problem: WebPhotoProblem) => void>()
  const reported = new Set<WebPhotoProblem>()
  let connection: Promise<IDBDatabase> | undefined
  let hydration: Promise<void> | undefined
  let hydrated = false
  let stopped = false
  let writes: Promise<void> = Promise.resolve()

  const changed = () => {
    for (const listener of [...changeListeners]) listener()
  }

  const report = (error: unknown) => {
    const problem = isQuotaError(error) ? 'quotaExceeded' : 'writeFailed'
    if (reported.has(problem)) return
    reported.add(problem)
    for (const listener of [...problemListeners]) listener(problem)
  }

  function open(): Promise<IDBDatabase> {
    if (!indexedDB) return Promise.reject(new Error('IndexedDB is unavailable'))
    connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const fail = (error: unknown) => {
        clearTimeout(timer)
        connection = undefined
        reject(error)
      }
      const timer = setTimeout(
        () => fail(new Error('Opening the photo database was blocked')),
        options.openTimeoutMs ?? OPEN_TIMEOUT_MS
      )
      let opening: IDBOpenDBRequest
      try {
        opening = indexedDB.open(WEB_PHOTO_DATABASE_NAME, VERSION)
      } catch (error) {
        return fail(error)
      }
      opening.onupgradeneeded = () => {
        for (const name of [PHOTOS, META])
          if (!opening.result.objectStoreNames.contains(name))
            opening.result.createObjectStore(name)
      }
      opening.onsuccess = () => {
        clearTimeout(timer)
        const db = opening.result
        db.onversionchange = () => {
          db.close()
          connection = undefined
        }
        db.onclose = () => (connection = undefined)
        resolve(db)
      }
      opening.onerror = () => fail(opening.error)
    })
    return connection
  }

  const revoke = (photo: Photo | undefined) => {
    if (photo?.url) URL.revokeObjectURL(photo.url)
  }

  function write(
    action: (photos: IDBObjectStore, meta: IDBObjectStore) => void,
    before?: () => Promise<void>
  ): void {
    if (!indexedDB || stopped) return
    writes = writes.then(async () => {
      if (stopped) return
      try {
        await before?.()
        const db = await open()
        const tx = db.transaction([PHOTOS, META], 'readwrite')
        action(tx.objectStore(PHOTOS), tx.objectStore(META))
        await transactionDone(tx)
      } catch (error) {
        report(error)
      }
    })
  }

  function hydrate(): Promise<void> {
    hydration ??= (async () => {
      let loaded = 0
      try {
        if (!indexedDB) return
        const db = await open()
        const tx = db.transaction(META, 'readonly')
        const store = tx.objectStore(META)
        const keys = store.getAllKeys()
        const rows = store.getAll()
        await transactionDone(tx)
        keys.result.forEach((key, index) => {
          const id = String(key)
          const meta: unknown = rows.result[index]
          if (stopped || touched.has(id) || !isMeta(meta)) return
          photos.set(id, {
            savedAt: meta.savedAt,
            size: meta.size,
            type: meta.type,
          })
          loaded++
        })
      } catch {
      } finally {
        hydrated = true
        touched.clear()
        if (loaded) changed()
      }
    })()
    return hydration
  }

  function load(id: string): Promise<Blob | undefined> {
    const photo = photos.get(id)
    if (!photo) return Promise.resolve(undefined)
    if (photo.blob) return Promise.resolve(photo.blob)
    photo.loading ??= (async () => {
      try {
        const db = await open()
        const tx = db.transaction(PHOTOS, 'readonly')
        const bytes: unknown = await request(tx.objectStore(PHOTOS).get(id))
        if (photos.get(id) !== photo) return photos.get(id)?.blob
        if (!(bytes instanceof ArrayBuffer)) {
          photos.delete(id)
          changed()
          return undefined
        }
        photo.blob = new Blob([bytes], { type: photo.type })
        changed()
        return photo.blob
      } catch {
        return undefined
      } finally {
        photo.loading = undefined
      }
    })()
    return photo.loading
  }

  return {
    ready: hydrate,

    put(id: string, blob: Blob): void {
      revoke(photos.get(id))
      const meta: Meta = { savedAt: now(), size: blob.size, type: blob.type }
      photos.set(id, { ...meta, blob })
      if (!hydrated) touched.add(id)
      let bytes: ArrayBuffer | undefined
      write(
        (store, metaStore) => {
          if (!bytes) return
          store.put(bytes, id)
          metaStore.put(meta, id)
        },
        async () => {
          bytes = await blob.arrayBuffer()
        }
      )
      changed()
    },

    has: (id: string) => photos.has(id),

    blob: async (id: string): Promise<Blob | undefined> => {
      await hydrate()
      return load(id)
    },

    info(id: string): { size: number; modifiedAt: number } | undefined {
      const photo = photos.get(id)
      return photo && { size: photo.size, modifiedAt: photo.savedAt }
    },

    url(id: string): string {
      const photo = photos.get(id)
      if (!photo) {
        if (!hydrated) void hydrate()
        return ''
      }
      if (!photo.blob) {
        void load(id)
        return ''
      }
      photo.url ??= URL.createObjectURL(photo.blob)
      return photo.url
    },

    pending: (id: string): boolean => {
      if (!hydrated) return indexedDB !== undefined
      const photo = photos.get(id)
      return !!photo && !photo.blob
    },

    delete(id: string): void {
      revoke(photos.get(id))
      const had = photos.delete(id)
      if (!hydrated) touched.add(id)
      write((store, metaStore) => {
        store.delete(id)
        metaStore.delete(id)
      })
      if (had) changed()
    },

    list: () =>
      [...photos].map(([id, { savedAt }]) => ({ id, modifiedAt: savedAt })),

    settled: () => writes,

    async stopWriting(): Promise<void> {
      stopped = true
      await writes
    },

    async wipe(): Promise<void> {
      stopped = true
      await writes
      for (const photo of photos.values()) revoke(photo)
      photos.clear()
      hydrated = true
      if (!indexedDB) return
      const db = await open()
      const tx = db.transaction([PHOTOS, META], 'readwrite')
      tx.objectStore(PHOTOS).clear()
      tx.objectStore(META).clear()
      await transactionDone(tx)
    },

    problems: (): WebPhotoProblem[] => [...reported],

    onProblem(listener: (problem: WebPhotoProblem) => void) {
      problemListeners.add(listener)
      return () => void problemListeners.delete(listener)
    },

    onChange(listener: () => void) {
      changeListeners.add(listener)
      return () => void changeListeners.delete(listener)
    },
  }
}

export type WebPhotoStore = ReturnType<typeof createWebPhotoStore>

export const webPhotos = createWebPhotoStore({ indexedDB: browserIndexedDB() })

export const webPhotosReady = () => webPhotos.ready()
export const putWebPhoto = (id: string, blob: Blob) => webPhotos.put(id, blob)
export const hasWebPhoto = (id: string) => webPhotos.has(id)
export const getWebPhotoBlob = (id: string) => webPhotos.blob(id)
export const getWebPhotoInfo = (id: string) => webPhotos.info(id)
export const getWebPhotoUrl = (id: string) => webPhotos.url(id)
export const deleteWebPhoto = (id: string) => webPhotos.delete(id)
export const listWebPhotos = () => webPhotos.list()
