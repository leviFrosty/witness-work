import { HttpError } from '@/lib/http/request'
import type { KeyChangeRecord } from '@/lib/accountKey/keyChangeRecord'
import {
  backupAad,
  deriveBackupKey,
  resealBlob,
} from '@/lib/serverAccount/backupCrypto'
import type { BearerAccountOptions } from '@/lib/serverAccount/client'
import { isCloudSyncPhotoFilename } from '@/lib/syncTransport/imageNames'
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

/**
 * Step 5 of a key change (docs/account-key-change.md, "The device flow"): every
 * Cloud Sync slot, Cloud Sync photo and backup slot of the account, other
 * devices' too, re-sealed under the new key, so nothing the account stores
 * still needs the old one. Each slot done is saved into the record, so a crash
 * or a failure resumes after it. A slot that the old key and the key history
 * don't open is left as it is.
 *
 * Puts carry `If-Match` with the ETag read (a 412 reads it again), and Cloud
 * Sync's `x-ww-reseal: 1` for another device's slot, which keeps its writer and
 * time. A put too soon after the slot's last (2 s for Cloud Sync, a minute for
 * backup) waits, then reads the slot again, since what landed may be newer.
 *
 * A photo moves to the new key's name: the new one is put, then the old name
 * deleted, never the other way round. The listing shows which have moved (they
 * open with the new key), so only a photo left as it is goes in the record. A
 * photo the server refuses for space, count or rate stays under the old key,
 * where the key history opens it, for a later launch (`createPhotoResealRetry`)
 * without holding up the change.
 */

export type ResealSyncApi = {
  list: () => Promise<{ slotId: string; etag: string }[]>
  get: (slotId: string) => Promise<Uint8Array>
  put: (
    slotId: string,
    blob: Uint8Array,
    options: { ifMatch: string; reseal: boolean }
  ) => Promise<void>
}

export type ResealBackupApi = {
  list: () => Promise<{ slotId: string }[]>
  /** The slot's bytes, and their etag: null when the server sent none. */
  get: (slotId: string) => Promise<{ blob: Uint8Array; etag: string | null }>
  put: (
    slotId: string,
    blob: Uint8Array,
    options: { ifMatch: string }
  ) => Promise<void>
}

export type ResealPhoto = { name: string; meta: string; size: number }

export type ResealPhotoApi = {
  /** Every live photo, across pages, and the account's photo storage. */
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

/** `ResealPhotoApi` over `sync/photos/*`, as `options`' session. */
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

/**
 * This device's note that a key change left photos under an older key: the
 * account's id, or null. Device-local, holding no key.
 */
export type PhotosLeftStore = {
  get: () => string | null
  set: (accountId: string | null) => void
}

export type ResealStepDeps = {
  /** The account's Cloud Sync slots, as `accountKey`'s session. */
  sync: (accountKey: Uint8Array) => ResealSyncApi
  /** The account's backup slots, as `accountKey`'s session. */
  backup: (accountKey: Uint8Array) => ResealBackupApi
  /** The account's Cloud Sync photos, as `accountKey`'s session. */
  photos: (accountKey: Uint8Array) => ResealPhotoApi
  /** This device's own Cloud Sync slot, put without `x-ww-reseal`. */
  ownSyncSlotId: () => string | null
  /**
   * The key history's derived keys, newest first; null when the history can't
   * be read, so a slot only it might open isn't given up on.
   */
  olderKeys: (
    accountId: string,
    kind: 'sync' | 'backup',
    accountKey: Uint8Array
  ) => Promise<readonly Uint8Array[] | null>
  /** The key history's photo keys, newest first; null as `olderKeys`. */
  olderPhotoKeys: (
    accountId: string,
    accountKey: Uint8Array
  ) => Promise<readonly PhotoKeys[] | null>
  photosLeft: PhotosLeftStore
  randomBytes: (length: number) => Uint8Array
  sleep: (ms: number) => Promise<void>
  /** Between chunks of opening and sealing a photo. */
  pause?: Pause
}

type Done = NonNullable<KeyChangeRecord['reseal']>

/** Reads and puts one slot again when it changed meanwhile, this many times. */
const MAX_ATTEMPTS = 4
/**
 * Longer waits than this stop the step, to resume later (an account's daily
 * caps). It covers backup's one put a slot a minute, and Cloud Sync's 2-minute
 * hold on a slot while another put of it is in flight (this device's own push,
 * right after step 4).
 */
const MAX_WAIT_MS = 125_000
/** A Cloud Sync put in flight usually lands in seconds: look again soon. */
const SYNC_WAIT_STEP_MS = 3_000

/** The key history couldn't be read: a slot it might open waits. */
export class KeyHistoryUnavailableError extends Error {
  constructor() {
    super('The key history could not be read')
    this.name = 'KeyHistoryUnavailableError'
  }
}

const codeOf = (error: unknown) =>
  error instanceof HttpError ? error.serverCode : null

/** The account can't use Cloud Sync now: its slots stay under the old key. */
const syncUnavailable = (error: unknown) =>
  codeOf(error) === 'supporter_required' || codeOf(error) === 'disabled'

/** How long the server asks to wait, when it's short enough to. */
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
  // Photos the server said didn't fit, by name: not downloaded again when the
  // step runs again this launch.
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
    // Not a Supporter: an earlier change's note waits for the account to be.
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
  // Past the server's re-seal window, other devices' slots stay under the old
  // key, where the key history opens them: no use downloading the rest.
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
        // Deleted since it was listed.
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
          // Only over the bytes just read.
          ifMatch: await syncBlobDigest(blob),
          reseal: slotId !== own,
        })
        break
      } catch (error) {
        const code = codeOf(error)
        if (attempt < MAX_ATTEMPTS) {
          // Changed (or deleted) since it was read: read it again.
          if (code === 'precondition_failed') continue
          // Put a moment ago (one put a slot every 2 s), or another put of it
          // in flight: wait a little, then read again.
          const wait = waitFor(error)
          if (wait !== null) {
            await deps.sleep(Math.min(wait, SYNC_WAIT_STEP_MS))
            continue
          }
        }
        // Past the server's re-seal window: the key history still opens it.
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
}

/**
 * A key change's photos left under an older key, moved on a later launch: with
 * the key history's photo keys (the old key itself is gone by then), until none
 * is left. Once a launch, with a session open into the noted account and no
 * change under way; never two at once.
 */
export function createPhotoResealRetry(
  deps: Pick<
    ResealStepDeps,
    'photos' | 'olderPhotoKeys' | 'photosLeft' | 'randomBytes' | 'pause'
  > & {
    /** The open session's account, or null without one. */
    sessionAccountId: () => string | null
    changeUnderWay: () => Promise<boolean>
    /** This device's account key, or null without one. */
    accountKey: () => Promise<Uint8Array | null>
  }
): () => Promise<void> {
  let tried = false
  let running = false
  const tooBig = new Set<string>()
  return async () => {
    // Checked and set before any await, so two calls can't both pass.
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

/** Refusals that leave one photo for later while the rest go on. */
const PHOTO_LEFT_ALONE = new Set(['storage_full', 'conflict'])

/**
 * Moves each photo under an older key (`from`, newest first) to `to`'s name.
 * `left` when one is still under an older key for a later try; never throws for
 * the server, so photos don't hold up the change.
 */
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
    /** False when only `from`'s first key could be read, not the history. */
    historyRead: boolean
    /** Photos left as they are before: damaged. */
    skip: readonly string[]
    /** Photos the server said didn't fit; one refused is added. */
    tooBig: Set<string>
    /** Leaves a damaged photo as it is, for good. */
    leave: (name: string) => Promise<void>
  }
): Promise<'done' | 'left' | 'unavailable'> {
  let listing: Awaited<ReturnType<ResealPhotoApi['list']>>
  try {
    listing = await api.list()
  } catch (error) {
    // Not a Supporter: Cloud Sync can't use its photos, nor put them.
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
    // Already the new key's.
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
      // Another account's key, damaged, or newer: left as it is. Unless the
      // history, which might open it, couldn't be read.
      if (!historyRead) left = true
      continue
    }

    const target = { accountId, name: photoName(to.nameKey, filename) }
    // An earlier try already put it: only the old name is left to delete.
    if (!live.has(target.name)) {
      // Known not to fit (the copy is the same size), by the listing or the
      // server earlier this launch: not downloaded.
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
        // Deleted since the listing.
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
        // A name already live answers `existed`, as put. If Cloud Sync
        // deletes the photo (every name it has) between this put and the
        // delete below, the new copy is left unreferenced; the engine's
        // cleanup removes it after its one-day grace.
        await api.put({ name: target.name, meta, blob: sealed })
      } catch (error) {
        // Stays under the old key, where the history opens it. Out of room
        // for this one, the next may fit; out of count, rate or photos, none
        // will.
        left = true
        const code = codeOf(error)
        if (code === 'storage_full') tooBig.add(photo.name)
        if (PHOTO_LEFT_ALONE.has(code ?? '')) continue
        break
      }
    }
    // The new one is live: the old name can go.
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
        // Deleted since it was listed.
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
      // Without the etag, the put could land over a newer backup or make a
      // deleted slot again: stop, to try later.
      if (!read.etag) throw new Error('Backup slot read without an etag')
      try {
        // Only over the bytes just read.
        await api.put(slotId, result.blob, { ifMatch: read.etag })
        break
      } catch (error) {
        // Backup was turned off: the rest stays under the old key, where the
        // key history opens it.
        if (codeOf(error) === 'disabled') return
        if (attempt < MAX_ATTEMPTS) {
          // Uploaded (or deleted) since it was read: read it again, which
          // skips a slot that's gone.
          if (codeOf(error) === 'precondition_failed') continue
          // One put a slot a minute, checked before `If-Match`: wait, then
          // read again, since what was put in that minute may be newer.
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
