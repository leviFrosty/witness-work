import { HttpError } from '@/lib/http/request'
import type { BearerAccountOptions } from '@/lib/serverAccount/client'
import {
  BackupOpenError,
  BACKUP_PLAINTEXT_VERSION,
  type BackupPlatform,
} from '@/lib/serverAccount/backupCrypto'
import {
  MAX_PHOTO_FILE_BYTES,
  openPhoto,
  openPhotoMeta,
  type Pause,
  PhotoOpenError,
  type PhotoKeys,
  photoName,
  sealedPhotoBytes,
  sealPhoto,
  sealPhotoMeta,
} from '@/lib/syncTransport/server/photoCrypto'
import { isCloudSyncPhotoFilename } from '@/lib/syncTransport/imageNames'
import {
  BLOB_TIMEOUT_MS,
  deleteSyncPhotos,
  deleteSyncSlot,
  getSyncPhoto,
  getSyncSlot,
  listSyncPhotos,
  listSyncSlots,
  parsePhotoUsage,
  PHOTO_TIMEOUT_MS,
  putSyncPhoto,
  putSyncSlot,
  SYNC_LIMITS,
  type SyncPhotoUsage,
  type SyncSlot,
} from '@/lib/syncTransport/server/syncClient'
import {
  openSyncBlob,
  sealSyncBlob,
  SYNC_SLOT_ID_PATTERN,
} from '@/lib/syncTransport/server/syncCrypto'
import {
  type BinaryFileInfo,
  type SyncFile,
  type SyncTransport,
  SyncTransportError,
  type SyncTransportErrorCode,
  type TransportSubscription,
} from '@/lib/syncTransport/types'

/**
 * Cloud Sync's transport (ADR 0030): the account's slots on ww-api, one per
 * device, each an end-to-end encrypted snapshot. The engine sees the same
 * namespace a cloud folder gives it: `witness-work-<slotId>.json` for each
 * slot, holding the JSON the device put. Pure, with its account access and
 * clock injected, so it runs in tests against a fake server.
 *
 * - Reads list the slots and download only those whose ETag changed since this
 *   transport last read them; the rest come from memory.
 * - Writes seal the payload and put it; the server has it when they resolve.
 * - Remote changes come from the live socket (`notifyRemoteChange`), wired by the
 *   app, never by polling.
 * - Photo binaries are the account's photos (docs/cloud-sync-photos.md): each one
 *   sealed under a keyed name, listed through its sealed filename. They travel
 *   once the server says it has photos (`supportsBinaries`); while its photo
 *   switch is off, uploads wait and the rest goes on.
 */

/** What a call needs: the account, its keys, and the session's options. */
export type ServerSyncAccess = {
  accountId: string
  syncKey: Uint8Array
  /** Derived from the account key with the sync key (`derivePhotoKeys`). */
  photoKeys: PhotoKeys
  /**
   * The sync keys of the account's older account keys (the key history's,
   * newest first), for a slot a key change didn't re-seal.
   */
  olderSyncKeys?: readonly Uint8Array[]
  options: BearerAccountOptions
}

/**
 * A server refusal the app records: the kill switch, not entitled, or photos'
 * own switch.
 */
export type ServerSyncRefusal =
  | 'disabled'
  | 'supporter_required'
  | 'photos_disabled'

/** What told the app the account's photo storage. */
export type PhotoUsageSource = 'put' | 'list' | 'delete' | 'usage' | 'full'

/** Reads and writes photo files on this device. */
export type PhotoFiles = {
  /** The file's size in bytes, without reading it. */
  size: (path: string) => Promise<number>
  read: (path: string) => Promise<Uint8Array>
  /** Replaces the file at `path` with `bytes` whole, never part of them. */
  write: (path: string, bytes: Uint8Array) => Promise<void>
}

export type ServerTransportDeps = {
  /**
   * The account a call runs as. Throws (any error) when there's no account key
   * or session to be had; the transport reports it as `unauthorized`.
   */
  access: () => Promise<ServerSyncAccess>
  /** Whether this device has the account's session (and may sync). */
  isAvailable: () => boolean
  /** The account the namespace belongs to; null without a session. */
  identityToken: () => string | null
  randomBytes: (length: number) => Uint8Array
  deviceName: () => string
  platform: BackupPlatform
  now: () => number
  addAvailabilityListener?: (
    listener: (event: { available: boolean }) => void
  ) => TransportSubscription
  /** The server refused a call; the app updates what it knows. */
  onRefused?: (refusal: ServerSyncRefusal) => void
  /** Photo files on this device; without them, photos don't travel. */
  files?: PhotoFiles
  /**
   * The server's photo switch as last recorded: null until a server that has
   * photos said so. Off, uploads wait; reads and deletes go on.
   */
  photoSwitch?: () => boolean | null
  /** This device's slot, sent with photo writes so its own socket isn't told. */
  slotId?: () => string | null
  /** Between chunks of sealing or opening a photo. */
  pause?: Pause
  /** The server said how much photo storage the account uses. */
  onPhotoUsage?: (usage: SyncPhotoUsage, source: PhotoUsageSource) => void
  /** A photo didn't upload or download, classified (for analytics). */
  onPhotoFailure?: (
    direction: 'upload' | 'download',
    code: SyncTransportErrorCode
  ) => void
}

/**
 * The engine's wait for a write: the put's own upload timeout, plus opening or
 * refreshing the session and sealing the snapshot first. Shorter, and the
 * engine would give up on a slow upload that still lands, then retry with a put
 * the server refuses (429) while the first is uploading.
 */
export const SERVER_WRITE_TIMEOUT_MS = BLOB_TIMEOUT_MS + 30_000

/** The engine's wait for a photo: its own request's, plus sealing it. */
export const SERVER_BINARY_TIMEOUT_MS = PHOTO_TIMEOUT_MS + 30_000

const PREFIX = 'witness-work-'
const SUFFIX = '.json'

/** The slot a sync filename names, or null for anything else (legacy, account). */
export function slotIdForFilename(filename: string): string | null {
  if (!filename.startsWith(PREFIX) || !filename.endsWith(SUFFIX)) return null
  const slotId = filename.slice(PREFIX.length, -SUFFIX.length)
  return SYNC_SLOT_ID_PATTERN.test(slotId) ? slotId : null
}

export const filenameForSlot = (slotId: string) => `${PREFIX}${slotId}${SUFFIX}`

/**
 * A slot written by a newer app version: the engine reads `version` as newer
 * and waits, as it does for a newer file in iCloud.
 */
const NEWER_PLACEHOLDER = JSON.stringify({ version: Number.MAX_SAFE_INTEGER })

/** A failed call, classified the way the engine reads transport errors. */
export function toServerTransportError(
  error: unknown,
  onRefused?: (refusal: ServerSyncRefusal) => void
): SyncTransportError {
  if (error instanceof SyncTransportError) return error
  if (!(error instanceof HttpError))
    return new SyncTransportError('unauthorized', 'no account session')
  const message = error.serverCode ?? error.kind
  switch (error.serverCode) {
    case 'disabled':
      onRefused?.('disabled')
      return new SyncTransportError('unauthorized', message)
    case 'supporter_required':
      onRefused?.('supporter_required')
      return new SyncTransportError('unauthorized', message)
    // Photos' own switch is off for now: the rest of sync goes on, and the
    // photo waits for it as for a server failure.
    case 'photos_disabled':
      onRefused?.('photos_disabled')
      return new SyncTransportError('server-error', message, error.retryAfterMs)
    // A photo's name was deleted while it uploaded, or the account has no slot
    // yet (the snapshot publishes first): a race the next try settles.
    case 'conflict':
    case 'no_slot':
      return new SyncTransportError('server-error', message, error.retryAfterMs)
    case 'storage_full':
    case 'too_large':
    case 'limit':
      return new SyncTransportError('storage-full', message)
    case 'not_found':
      return new SyncTransportError('not-found', message)
  }
  // This app version is too old (Update Required shows); only the User
  // updating fixes it, so it isn't reported as a bug on every retry.
  if (
    error.status === 401 ||
    error.status === 403 ||
    error.status === 426 ||
    error.serverCode === 'upgrade_required'
  )
    return new SyncTransportError('unauthorized', message)
  if (error.kind === 'rateLimited' || error.status === 429)
    return new SyncTransportError('rate-limited', message, error.retryAfterMs)
  if (error.kind === 'offline' || error.kind === 'timeout')
    return new SyncTransportError('network', message, error.retryAfterMs)
  // ww-api answered, so the phone is online: retried like `network`.
  if (error.kind === 'server')
    return new SyncTransportError('server-error', message, error.retryAfterMs)
  return new SyncTransportError('unknown', message)
}

export type ServerTransport = SyncTransport & {
  /** The live socket said another device changed something. */
  notifyRemoteChange: () => void
  /** Availability or the account changed (a session opened or ended). */
  notifyAvailabilityChange: () => void
  /**
   * The account `seq` this device has caught up to: the last listing's, or its
   * own put right after it. 0 before any.
   */
  lastSeq: () => number
  /** Forgets cached snapshots, after an account change. */
  reset: () => void
}

export function createServerTransport(
  deps: ServerTransportDeps
): ServerTransport {
  const remoteListeners = new Set<(event: { modifiedAt: number }) => void>()
  const availabilityListeners = new Set<
    (event: { available: boolean }) => void
  >()
  /** Last read of each peer slot, by ETag, for the account it was read under. */
  let cache = new Map<string, { etag: string; json: string }>()
  let cacheAccount: string | null = null
  let seq = 0
  /** The filename each listed photo's meta opened to, by name: both immutable. */
  let photoFilenames = new Map<string, string | null>()
  /** The listed name of each filename, used rather than computing it again. */
  let listedNames = new Map<string, string>()
  /** The account's photo storage as last heard, for a refusal without it. */
  let lastUsage: SyncPhotoUsage | null = null
  const pause = deps.pause ?? (async () => {})

  const fail = (error: unknown): never => {
    throw toServerTransportError(error, deps.onRefused)
  }

  const access = async () => {
    let current: ServerSyncAccess
    try {
      current = await deps.access()
    } catch (error) {
      return fail(error)
    }
    if (cacheAccount !== current.accountId) {
      cache = new Map()
      photoFilenames = new Map()
      listedNames = new Map()
      lastUsage = null
      cacheAccount = current.accountId
      seq = 0
    }
    return current
  }

  const readSlot = async (
    current: ServerSyncAccess,
    slot: SyncSlot
  ): Promise<string | null> => {
    const cached = cache.get(slot.slotId)
    if (cached?.etag === slot.etag) return cached.json
    let blob: Uint8Array
    try {
      blob = await getSyncSlot(current.options, slot.slotId)
    } catch (error) {
      // Deleted since the listing: as if it hadn't been listed.
      if (error instanceof HttpError && error.serverCode === 'not_found')
        return null
      return fail(error)
    }
    let json: string
    try {
      const plaintext = openSyncBlob(
        current.syncKey,
        blob,
        { accountId: current.accountId, slotId: slot.slotId },
        current.olderSyncKeys
      )
      json = JSON.stringify(plaintext.payload)
    } catch (error) {
      // Unreadable (another key's, or damaged) or from a newer version: the
      // engine reports it like a bad or newer file and keeps going.
      json =
        error instanceof BackupOpenError && error.problem === 'newer'
          ? NEWER_PLACEHOLDER
          : ''
    }
    cache.set(slot.slotId, { etag: slot.etag, json })
    return json
  }

  const usage = (value: SyncPhotoUsage | null, source: PhotoUsageSource) => {
    if (!value) return
    lastUsage = value
    deps.onPhotoUsage?.(value, source)
  }

  /** A photo call's failure, with the account's usage when it's full. */
  const photoFail = (
    error: unknown,
    direction?: 'upload' | 'download'
  ): never => {
    let failure: SyncTransportError
    if (error instanceof HttpError && error.serverCode === 'too_large')
      // A photo over the server's cap never fits; it isn't the account full.
      failure = new SyncTransportError('too-large', 'too_large')
    else {
      // Full by bytes or by count: either way, room is what it waits for.
      if (
        error instanceof HttpError &&
        (error.serverCode === 'storage_full' || error.serverCode === 'limit')
      )
        usage(parsePhotoUsage(error.body) ?? lastUsage, 'full')
      failure = toServerTransportError(error, deps.onRefused)
    }
    if (direction) deps.onPhotoFailure?.(direction, failure.code)
    throw failure
  }

  const photoAccess = async () => {
    const current = await access()
    const address = (filename: string) => ({
      accountId: current.accountId,
      name:
        listedNames.get(filename) ??
        photoName(current.photoKeys.nameKey, filename),
    })
    return { current, address }
  }
  const slotId = () => deps.slotId?.() ?? null

  const transport: ServerTransport = {
    kind: 'cloud',
    writeConfirmsUpload: true,
    get supportsBinaries() {
      return Boolean(deps.files) && (deps.photoSwitch?.() ?? null) !== null
    },
    get binaryWritesPaused() {
      return deps.photoSwitch?.() === false
    },
    writeTimeoutMs: SERVER_WRITE_TIMEOUT_MS,
    binaryTimeoutMs: SERVER_BINARY_TIMEOUT_MS,
    isAvailable: deps.isAvailable,
    identityToken: deps.identityToken,
    identityTokenMatches: (stored) => {
      const current = deps.identityToken()
      return current === null ? null : current === stored
    },
    waitForInitialScan: async () => true,

    async readFiles(include) {
      const current = await access()
      let listing: Awaited<ReturnType<typeof listSyncSlots>>
      try {
        listing = await listSyncSlots(current.options)
      } catch (error) {
        return fail(error)
      }
      seq = Math.max(seq, listing.seq)
      const listed = new Set(listing.slots.map((slot) => slot.slotId))
      for (const slotId of cache.keys())
        if (!listed.has(slotId)) cache.delete(slotId)
      const files: SyncFile[] = []
      for (const slot of listing.slots) {
        const filename = filenameForSlot(slot.slotId)
        if (!include(filename)) continue
        const json = await readSlot(current, slot)
        if (json === null) continue
        files.push({ filename, json, modifiedAt: slot.updatedAt })
      }
      return { files, pending: [] }
    },

    async write(filename, json) {
      const slotId = slotIdForFilename(filename)
      if (!slotId)
        throw new SyncTransportError('unknown', 'not a device snapshot name')
      const current = await access()
      const blob = sealSyncBlob(
        current.syncKey,
        {
          v: BACKUP_PLAINTEXT_VERSION,
          deviceName: deps.deviceName(),
          platform: deps.platform,
          createdAt: deps.now(),
          payload: JSON.parse(json) as unknown,
        },
        { accountId: current.accountId, slotId },
        deps.randomBytes(24)
      )
      if (blob.length > SYNC_LIMITS.bytes)
        throw new SyncTransportError('storage-full', 'too_large')
      try {
        const put = await putSyncSlot(current.options, slotId, blob)
        // Our own put is past what we've read only when nothing came between
        // (another device's put); otherwise the live socket's `hello` would
        // look caught up and that change wait for some other pull. The next
        // listing records it.
        if (put.seq === seq + 1) seq = put.seq
        return put.updatedAt
      } catch (error) {
        return fail(error)
      }
    },

    supportsUploadStatus: () => false,
    uploadStatus: async () => null,

    async deleteFile(filename) {
      const slotId = slotIdForFilename(filename)
      if (!slotId) return
      const current = await access()
      try {
        await deleteSyncSlot(current.options, slotId)
      } catch (error) {
        fail(error)
      }
      cache.delete(slotId)
    },

    async deleteAll() {
      const current = await access()
      try {
        await deleteSyncSlot(current.options)
      } catch (error) {
        fail(error)
      }
      cache = new Map()
    },

    async writeBinary(filename, sourcePath) {
      if (!deps.files) throw new SyncTransportError('unknown', 'no photo files')
      // Legacy avatar names were last-writer-wins; the engine gives the photo
      // a revision before it comes here.
      if (!isCloudSyncPhotoFilename(filename))
        throw new SyncTransportError('unknown', 'not a Cloud Sync photo name')
      if (deps.photoSwitch?.() === false)
        throw new SyncTransportError('server-error', 'photos_disabled')
      const { current, address } = await photoAccess()
      const target = address(filename)
      // Sized before it's read: a photo over the cap isn't loaded at all.
      const size = await deps.files.size(sourcePath)
      if (size > MAX_PHOTO_FILE_BYTES)
        return photoFail(
          new SyncTransportError('too-large', 'too_large'),
          'upload'
        )
      // Known not to fit: refused here, not sent whole for a 429, so retrying
      // a full account doesn't upload every stuck photo again.
      if (
        lastUsage &&
        lastUsage.bytes + sealedPhotoBytes(size) > lastUsage.limit
      ) {
        usage(lastUsage, 'full')
        return photoFail(
          new SyncTransportError('storage-full', 'storage_full'),
          'upload'
        )
      }
      const bytes = await deps.files.read(sourcePath)
      const { photoKey } = current.photoKeys
      const blob = await sealPhoto(
        photoKey,
        bytes,
        target,
        deps.randomBytes(24),
        pause
      )
      const meta = sealPhotoMeta(
        photoKey,
        filename,
        target,
        deps.randomBytes(24)
      )
      try {
        const put = await putSyncPhoto(
          current.options,
          { name: target.name, meta, blob },
          slotId()
        )
        photoFilenames.set(target.name, filename)
        listedNames.set(filename, target.name)
        usage(put.usage, 'put')
        return put.createdAt
      } catch (error) {
        return photoFail(error, 'upload')
      }
    },

    async readBinary(filename, destinationPath) {
      if (!deps.files) throw new SyncTransportError('unknown', 'no photo files')
      const { current, address } = await photoAccess()
      const target = address(filename)
      let got: Awaited<ReturnType<typeof getSyncPhoto>>
      try {
        got = await getSyncPhoto(current.options, target.name)
      } catch (error) {
        return photoFail(error, 'download')
      }
      let bytes: Uint8Array
      try {
        bytes = await openPhoto(
          current.photoKeys.photoKey,
          got.blob,
          target,
          pause
        )
      } catch (error) {
        // Another key's, damaged, or moved: a bad file, never written here.
        if (error instanceof PhotoOpenError)
          return photoFail(
            new SyncTransportError('unknown', `photo ${error.problem}`),
            'download'
          )
        throw error
      }
      await deps.files.write(destinationPath, bytes)
      return got.createdAt ?? deps.now()
    },

    async listBinaryFiles() {
      const { current } = await photoAccess()
      const { photoKey, nameKey } = current.photoKeys
      const files: BinaryFileInfo[] = []
      const listed = new Set<string>()
      const names = new Map<string, string>()
      let cursor: string | null = null
      let last: SyncPhotoUsage | null = null
      do {
        let page: Awaited<ReturnType<typeof listSyncPhotos>>
        try {
          page = await listSyncPhotos(current.options, cursor)
        } catch (error) {
          return photoFail(error)
        }
        for (const photo of page.photos) {
          listed.add(photo.name)
          let filename = photoFilenames.get(photo.name)
          if (filename === undefined) {
            // Unreadable (another key's, damaged, newer) or not the name it's
            // listed under: skipped, as if it weren't there.
            filename = openPhotoMeta(
              photoKey,
              photo.meta,
              { accountId: current.accountId, name: photo.name },
              nameKey,
              isCloudSyncPhotoFilename
            )
            photoFilenames.set(photo.name, filename)
          }
          if (!filename) continue
          names.set(filename, photo.name)
          files.push({ filename, modifiedAt: photo.createdAt })
        }
        last = page.usage ?? last
        cursor = page.cursor
      } while (cursor)
      for (const name of photoFilenames.keys())
        if (!listed.has(name)) photoFilenames.delete(name)
      listedNames = names
      usage(last, 'list')
      return files
    },

    async deleteBinaryFile(filename) {
      const { current, address } = await photoAccess()
      const { name } = address(filename)
      try {
        const deleted = await deleteSyncPhotos(
          current.options,
          { names: [name] },
          slotId()
        )
        photoFilenames.delete(name)
        listedNames.delete(filename)
        usage(deleted.usage, 'delete')
      } catch (error) {
        photoFail(error)
      }
    },

    async deleteAllBinaries() {
      const { current } = await photoAccess()
      try {
        const deleted = await deleteSyncPhotos(
          current.options,
          { all: true },
          slotId()
        )
        photoFilenames = new Map()
        listedNames = new Map()
        usage(deleted.usage, 'delete')
      } catch (error) {
        photoFail(error)
      }
    },

    addRemoteChangeListener(listener) {
      remoteListeners.add(listener)
      return { remove: () => remoteListeners.delete(listener) }
    },
    addAvailabilityChangeListener(listener) {
      availabilityListeners.add(listener)
      const outer = deps.addAvailabilityListener?.(listener)
      return {
        remove: () => {
          availabilityListeners.delete(listener)
          outer?.remove()
        },
      }
    },

    notifyRemoteChange() {
      const event = { modifiedAt: deps.now() }
      for (const listener of [...remoteListeners]) listener(event)
    },
    notifyAvailabilityChange() {
      const event = { available: deps.isAvailable() }
      for (const listener of [...availabilityListeners]) listener(event)
    },
    lastSeq: () => seq,
    reset() {
      cache = new Map()
      photoFilenames = new Map()
      listedNames = new Map()
      cacheAccount = null
      seq = 0
    },
  }
  return transport
}
