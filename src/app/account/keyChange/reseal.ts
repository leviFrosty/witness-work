import { fromB64u } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import type { KeyChangeRecord } from '@/lib/accountKey/keyChangeRecord'
import {
  backupAad,
  deriveBackupKey,
  resealBlob,
} from '@/lib/serverAccount/backupCrypto'
import type { BearerAccountOptions } from '@/lib/serverAccount/client'
import { isCloudSyncPhotoFilename } from '@/lib/syncTransport/imageNames'
import { resealChange } from '@/lib/syncTransport/server/changeCrypto'
import {
  derivePhotoKeys,
  openPhoto,
  openPhotoMeta,
  type Pause,
  type PhotoKeys,
  PhotoOpenError,
  photoName,
  sealPhoto,
  sealPhotoMeta,
} from '@/lib/syncTransport/server/photoCrypto'
import {
  deleteSyncPhotos,
  getSyncPhoto,
  listSyncPhotos,
  putSyncPhoto,
  type SyncPhotoUsage,
} from '@/lib/syncTransport/server/syncClient'
import {
  deriveSyncKey,
  syncAad,
  syncBlobDigest,
} from '@/lib/syncTransport/server/syncCrypto'
import type { KeyChangeStep, KeyChangeStepContext } from './steps'

export type ResealSyncChange = {
  sequence: number
  slotId: string
  changeId: string
  blob: string
}

export type ResealSyncApi = {
  list: () => Promise<{ slotId: string; etag: string }[]>
  get: (slotId: string) => Promise<Uint8Array>
  put: (
    slotId: string,
    blob: Uint8Array,
    options: { ifMatch: string; reseal: boolean }
  ) => Promise<void>

  changes?: () => Promise<ResealSyncChange[]>
  resealChange?: (change: {
    sequence: number
    changeId: string
    blob: Uint8Array
  }) => Promise<void>
}

export type ResealBackupApi = {
  list: () => Promise<{ slotId: string }[]>

  get: (slotId: string) => Promise<{ blob: Uint8Array; etag: string | null }>
  put: (
    slotId: string,
    blob: Uint8Array,
    options: { ifMatch: string }
  ) => Promise<void>
}

export type ResealPhoto = { name: string; meta: string; size: number }

export type ResealPhotoApi = {
  list: () => Promise<{
    photos: ResealPhoto[]
    usage: SyncPhotoUsage | null
  }>
  get: (name: string) => Promise<Uint8Array>
  put: (photo: {
    name: string
    meta: string
    blob: Uint8Array
  }) => Promise<void>
  delete: (names: string[]) => Promise<void>
}

export function resealPhotoApi(
  options: BearerAccountOptions,
  ownSlotId: () => string | null
): ResealPhotoApi {
  return {
    list: async () => {
      const photos: ResealPhoto[] = []
      let usage: SyncPhotoUsage | null = null
      let cursor: string | null = null
      do {
        const page = await listSyncPhotos(options, cursor)
        for (const { name, meta, size } of page.photos)
          photos.push({ name, meta, size })
        usage = page.usage ?? usage
        cursor = page.cursor
      } while (cursor)
      return { photos, usage }
    },
    get: async (name) => (await getSyncPhoto(options, name)).blob,
    put: async (photo) => {
      await putSyncPhoto(options, photo, ownSlotId())
    },
    delete: async (names) => {
      await deleteSyncPhotos(options, { names }, ownSlotId())
    },
  }
}

export type PhotosLeftStore = {
  get: () => string | null
  set: (accountId: string | null) => void
}

export type ResealStepDeps = {
  sync: (accountKey: Uint8Array) => ResealSyncApi

  backup: (accountKey: Uint8Array) => ResealBackupApi

  photos: (accountKey: Uint8Array) => ResealPhotoApi

  ownSyncSlotId: () => string | null

  olderKeys: (
    accountId: string,
    kind: 'sync' | 'backup',
    accountKey: Uint8Array
  ) => Promise<readonly Uint8Array[] | null>

  olderPhotoKeys: (
    accountId: string,
    accountKey: Uint8Array
  ) => Promise<readonly PhotoKeys[] | null>
  photosLeft: PhotosLeftStore
  randomBytes: (length: number) => Uint8Array
  sleep: (ms: number) => Promise<void>

  pause?: Pause
}

type Done = NonNullable<KeyChangeRecord['reseal']>

const MAX_ATTEMPTS = 4

const MAX_WAIT_MS = 125_000

const SYNC_WAIT_STEP_MS = 3_000

export class KeyHistoryUnavailableError extends Error {
  constructor() {
    super('The key history could not be read')
    this.name = 'KeyHistoryUnavailableError'
  }
}

const codeOf = (error: unknown) =>
  error instanceof HttpError ? error.serverCode : null

const syncUnavailable = (error: unknown) =>
  codeOf(error) === 'supporter_required' || codeOf(error) === 'disabled'

function waitFor(error: unknown): number | null {
  if (!(error instanceof HttpError) || error.serverCode !== 'rate_limited')
    return null
  const retryAfter = (error.body as { retryAfter?: unknown } | null)?.retryAfter
  const ms =
    error.retryAfterMs ??
    (typeof retryAfter === 'number' ? retryAfter * 1_000 : null)
  return ms !== null && ms <= MAX_WAIT_MS ? ms : null
}

export function createResealStep(deps: ResealStepDeps): KeyChangeStep {
  const tooBig = new Set<string>()
  return async (context: KeyChangeStepContext) => {
    const done: Done = {
      syncSlots: [...(context.record.reseal?.syncSlots ?? [])],
      photos: [...(context.record.reseal?.photos ?? [])],
      backupSlots: [...(context.record.reseal?.backupSlots ?? [])],
    }
    const record = async (
      list: 'syncSlots' | 'photos' | 'backupSlots',
      id: string
    ) => {
      done[list].push(id)
      await context.save({
        syncSlots: [...done.syncSlots],
        photos: [...done.photos],
        backupSlots: [...done.backupSlots],
      })
    }

    await resealSync(deps, context, done, (id) => record('syncSlots', id))
    const { oldKey, newKey, accountId } = context
    const older = await deps.olderPhotoKeys(accountId, newKey)
    const photos = await resealPhotos(deps, deps.photos(newKey), {
      accountId,
      from: [derivePhotoKeys(oldKey), ...(older ?? [])],
      to: derivePhotoKeys(newKey),
      historyRead: older !== null,
      skip: done.photos,
      tooBig,
      leave: (name) => record('photos', name),
    })

    if (photos !== 'unavailable')
      deps.photosLeft.set(photos === 'left' ? accountId : null)
    await resealBackups(deps, context, done, (id) => record('backupSlots', id))
  }
}

async function resealSync(
  deps: ResealStepDeps,
  { oldKey, newKey, accountId }: KeyChangeStepContext,
  done: Done,
  record: (slotId: string) => Promise<void>
): Promise<void> {
  const api = deps.sync(newKey)
  let slots: { slotId: string }[]
  try {
    slots = await api.list()
  } catch (error) {
    if (syncUnavailable(error)) return
    throw error
  }
  const older = await deps.olderKeys(accountId, 'sync', newKey)
  const from = [deriveSyncKey(oldKey), ...(older ?? [])]
  const to = deriveSyncKey(newKey)
  const own = deps.ownSyncSlotId()

  let resealRefused = false

  for (const { slotId } of slots) {
    if (done.syncSlots.includes(slotId)) continue
    if (resealRefused && slotId !== own) {
      await record(slotId)
      continue
    }
    const aad = syncAad({ accountId, slotId })
    for (let attempt = 1; ; attempt++) {
      let blob: Uint8Array
      try {
        blob = await api.get(slotId)
      } catch (error) {
        if (codeOf(error) === 'not_found') break
        throw error
      }
      const result = resealBlob(blob, aad, {
        from,
        to,
        nonce: deps.randomBytes(24),
      })
      if (result.outcome === 'unopened' && older === null)
        throw new KeyHistoryUnavailableError()
      if (result.outcome !== 'resealed') break
      try {
        await api.put(slotId, result.blob, {
          ifMatch: await syncBlobDigest(blob),
          reseal: slotId !== own,
        })
        break
      } catch (error) {
        const code = codeOf(error)
        if (attempt < MAX_ATTEMPTS) {
          if (code === 'precondition_failed') continue

          const wait = waitFor(error)
          if (wait !== null) {
            await deps.sleep(Math.min(wait, SYNC_WAIT_STEP_MS))
            continue
          }
        }

        if (code === 'forbidden') {
          resealRefused = true
          break
        }
        if (syncUnavailable(error)) return
        throw error
      }
    }
    await record(slotId)
  }
  await resealSyncChanges(deps, api, accountId, { from, to })
}

async function resealSyncChanges(
  deps: ResealStepDeps,
  api: ResealSyncApi,
  accountId: string,
  keys: { from: readonly Uint8Array[]; to: Uint8Array }
): Promise<void> {
  if (!api.changes || !api.resealChange) return
  let changes: ResealSyncChange[]
  try {
    changes = await api.changes()
  } catch (error) {
    if (syncUnavailable(error) || codeOf(error) === 'changes_disabled') return
    throw error
  }
  for (const change of changes) {
    const result = resealChange(
      fromB64u(change.blob),
      { accountId, slotId: change.slotId, changeId: change.changeId },
      { ...keys, nonce: deps.randomBytes(24) }
    )
    if (result.outcome !== 'resealed') continue
    try {
      await api.resealChange({
        sequence: change.sequence,
        changeId: change.changeId,
        blob: result.blob,
      })
    } catch (error) {
      const code = codeOf(error)
      if (code === 'not_found') continue
      if (
        code === 'forbidden' ||
        code === 'changes_disabled' ||
        syncUnavailable(error)
      )
        return
      throw error
    }
  }
}

export function createPhotoResealRetry(
  deps: Pick<
    ResealStepDeps,
    'photos' | 'olderPhotoKeys' | 'photosLeft' | 'randomBytes' | 'pause'
  > & {
    sessionAccountId: () => string | null
    changeUnderWay: () => Promise<boolean>

    accountKey: () => Promise<Uint8Array | null>
  }
): () => Promise<void> {
  let tried = false
  let running = false
  const tooBig = new Set<string>()
  return async () => {
    if (tried || running) return
    const accountId = deps.sessionAccountId()
    if (!accountId || deps.photosLeft.get() !== accountId) return
    running = true
    try {
      if (await deps.changeUnderWay()) return
      const accountKey = await deps.accountKey()
      if (!accountKey) return
      tried = true
      const older = await deps.olderPhotoKeys(accountId, accountKey)
      if (!older) return
      const photos = await resealPhotos(deps, deps.photos(accountKey), {
        accountId,
        from: older,
        to: derivePhotoKeys(accountKey),
        historyRead: true,
        skip: [],
        tooBig,
        leave: async () => {},
      })
      if (photos === 'done') deps.photosLeft.set(null)
    } finally {
      running = false
    }
  }
}

const PHOTO_LEFT_ALONE = new Set(['storage_full', 'conflict'])

async function resealPhotos(
  deps: Pick<ResealStepDeps, 'randomBytes' | 'pause'>,
  api: ResealPhotoApi,
  {
    accountId,
    from,
    to,
    historyRead,
    skip,
    tooBig,
    leave,
  }: {
    accountId: string
    from: readonly PhotoKeys[]
    to: PhotoKeys

    historyRead: boolean

    skip: readonly string[]

    tooBig: Set<string>

    leave: (name: string) => Promise<void>
  }
): Promise<'done' | 'left' | 'unavailable'> {
  let listing: Awaited<ReturnType<ResealPhotoApi['list']>>
  try {
    listing = await api.list()
  } catch (error) {
    if (codeOf(error) === 'supporter_required') return 'unavailable'
    return 'left'
  }
  const live = new Set(listing.photos.map(({ name }) => name))
  const { usage } = listing
  let left = false

  for (const photo of listing.photos) {
    if (skip.includes(photo.name)) continue
    const address = { accountId, name: photo.name }
    const opens = (keys: PhotoKeys) =>
      openPhotoMeta(
        keys.photoKey,
        photo.meta,
        address,
        keys.nameKey,
        isCloudSyncPhotoFilename
      )

    if (opens(to)) continue
    let keys: PhotoKeys | null = null
    let filename: string | null = null
    for (const candidate of from) {
      filename = opens(candidate)
      if (filename === null) continue
      keys = candidate
      break
    }
    if (!keys || filename === null) {
      if (!historyRead) left = true
      continue
    }

    const target = { accountId, name: photoName(to.nameKey, filename) }

    if (!live.has(target.name)) {
      if (
        tooBig.has(photo.name) ||
        (usage && usage.bytes + photo.size > usage.limit)
      ) {
        left = true
        continue
      }
      let blob: Uint8Array
      try {
        blob = await api.get(photo.name)
      } catch (error) {
        if (codeOf(error) === 'not_found') continue
        left = true
        break
      }
      let bytes: Uint8Array
      try {
        bytes = await openPhoto(keys.photoKey, blob, address, deps.pause)
      } catch (error) {
        if (!(error instanceof PhotoOpenError)) throw error
        await leave(photo.name)
        continue
      }
      const sealed = await sealPhoto(
        to.photoKey,
        bytes,
        target,
        deps.randomBytes(24),
        deps.pause
      )
      const meta = sealPhotoMeta(
        to.photoKey,
        filename,
        target,
        deps.randomBytes(24)
      )
      try {
        await api.put({ name: target.name, meta, blob: sealed })
      } catch (error) {
        left = true
        const code = codeOf(error)
        if (code === 'storage_full') tooBig.add(photo.name)
        if (PHOTO_LEFT_ALONE.has(code ?? '')) continue
        break
      }
    }

    try {
      await api.delete([photo.name])
    } catch {
      left = true
      break
    }
  }
  return left ? 'left' : 'done'
}

async function resealBackups(
  deps: ResealStepDeps,
  { oldKey, newKey, accountId }: KeyChangeStepContext,
  done: Done,
  record: (slotId: string) => Promise<void>
): Promise<void> {
  const api = deps.backup(newKey)
  let slots: { slotId: string }[]
  try {
    slots = await api.list()
  } catch (error) {
    if (codeOf(error) === 'disabled') return
    throw error
  }
  const older = await deps.olderKeys(accountId, 'backup', newKey)
  const from = [deriveBackupKey(oldKey), ...(older ?? [])]
  const to = deriveBackupKey(newKey)

  for (const { slotId } of slots) {
    if (done.backupSlots.includes(slotId)) continue
    const aad = backupAad({ accountId, slotId })
    for (let attempt = 1; ; attempt++) {
      let read: { blob: Uint8Array; etag: string | null }
      try {
        read = await api.get(slotId)
      } catch (error) {
        if (codeOf(error) === 'not_found') break
        throw error
      }
      const result = resealBlob(read.blob, aad, {
        from,
        to,
        nonce: deps.randomBytes(24),
      })
      if (result.outcome === 'unopened' && older === null)
        throw new KeyHistoryUnavailableError()
      if (result.outcome !== 'resealed') break

      if (!read.etag) throw new Error('Backup slot read without an etag')
      try {
        await api.put(slotId, result.blob, { ifMatch: read.etag })
        break
      } catch (error) {
        if (codeOf(error) === 'disabled') return
        if (attempt < MAX_ATTEMPTS) {
          if (codeOf(error) === 'precondition_failed') continue

          const wait = waitFor(error)
          if (wait !== null) {
            await deps.sleep(wait)
            continue
          }
        }
        throw error
      }
    }
    await record(slotId)
  }
}
