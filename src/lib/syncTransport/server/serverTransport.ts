import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes, toB64u } from '@/lib/bytes'
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
  PHOTO_MAX_DOWNLOAD_TIMEOUT_MS,
  PHOTO_MAX_UPLOAD_TIMEOUT_MS,
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

export type ServerSyncAccess = {
  accountId: string
  syncKey: Uint8Array

  photoKeys: PhotoKeys

  olderSyncKeys?: readonly Uint8Array[]

  olderPhotoKeys?: readonly PhotoKeys[]
  options: BearerAccountOptions
}

export type ServerSyncRefusal =
  | 'disabled'
  | 'supporter_required'
  | 'photos_disabled'

export type PhotoUsageSource = 'put' | 'list' | 'delete' | 'usage' | 'full'

export type PhotoFiles = {
  size: (path: string) => Promise<number>
  read: (path: string) => Promise<Uint8Array>

  write: (path: string, bytes: Uint8Array) => Promise<void>
}

export type ServerTransportDeps = {
  access: () => Promise<ServerSyncAccess>

  isAvailable: () => boolean

  identityToken: () => string | null
  randomBytes: (length: number) => Uint8Array
  deviceName: () => string
  platform: BackupPlatform
  now: () => number
  addAvailabilityListener?: (
    listener: (event: { available: boolean }) => void
  ) => TransportSubscription

  onRefused?: (refusal: ServerSyncRefusal) => void

  files?: PhotoFiles

  photoSwitch?: () => boolean | null

  slotId?: () => string | null

  pause?: Pause

  onPhotoUsage?: (usage: SyncPhotoUsage, source: PhotoUsageSource) => void

  onPhotoFailure?: (
    direction: 'upload' | 'download',
    code: SyncTransportErrorCode
  ) => void
}

export const SERVER_WRITE_TIMEOUT_MS = BLOB_TIMEOUT_MS + 30_000

export const SERVER_BINARY_TIMEOUT_MS =
  Math.max(PHOTO_MAX_DOWNLOAD_TIMEOUT_MS, PHOTO_MAX_UPLOAD_TIMEOUT_MS) + 30_000

export const SERVER_BINARY_SETUP_TIMEOUT_MS = 5 * 60_000

const keysFingerprint = (access: ServerSyncAccess) =>
  toB64u(
    sha256(
      concatBytes(
        access.syncKey,
        ...(access.olderSyncKeys ?? []),
        access.photoKeys.nameKey,
        ...(access.olderPhotoKeys ?? []).map(({ nameKey }) => nameKey)
      )
    )
  )

const PREFIX = 'witness-work-'
const SUFFIX = '.json'

export function slotIdForFilename(filename: string): string | null {
  if (!filename.startsWith(PREFIX) || !filename.endsWith(SUFFIX)) return null
  const slotId = filename.slice(PREFIX.length, -SUFFIX.length)
  return SYNC_SLOT_ID_PATTERN.test(slotId) ? slotId : null
}

export const filenameForSlot = (slotId: string) => `${PREFIX}${slotId}${SUFFIX}`

const NEWER_PLACEHOLDER = JSON.stringify({ version: Number.MAX_SAFE_INTEGER })

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

    case 'photos_disabled':
      onRefused?.('photos_disabled')
      return new SyncTransportError('server-error', message, error.retryAfterMs)

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

  if (error.kind === 'server')
    return new SyncTransportError('server-error', message, error.retryAfterMs)
  return new SyncTransportError('unknown', message)
}

export function endedWebSlots(
  slots: readonly SyncSlot[],
  ownSlotId: string,
  merged: ReadonlyMap<string, number>
): SyncSlot[] {
  return slots.filter(
    (slot) =>
      slot.slotId !== ownSlotId &&
      slot.platform === 'web' &&
      slot.ended &&
      merged.get(filenameForSlot(slot.slotId)) === slot.updatedAt
  )
}

export type ServerTransport = SyncTransport & {
  notifyRemoteChange: () => void

  notifyAvailabilityChange: () => void

  lastSeq: () => number

  reset: () => void
}

export function createServerTransport(
  deps: ServerTransportDeps
): ServerTransport {
  const remoteListeners = new Set<(event: { modifiedAt: number }) => void>()
  const availabilityListeners = new Set<
    (event: { available: boolean }) => void
  >()

  let cache = new Map<string, { etag: string; json: string }>()
  let cacheAccount: string | null = null
  let seq = 0

  let photoFilenames = new Map<string, string | null>()

  let olderKeysByName = new Map<string, PhotoKeys>()

  let listedPhotos = new Map<string, { name: string; size: number }>()

  let openedWith: string | null = null

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
      olderKeysByName = new Map()
      listedPhotos = new Map()
      lastUsage = null
      cacheAccount = current.accountId
      seq = 0
    }

    const keysId = keysFingerprint(current)
    if (openedWith !== keysId) {
      cache = new Map()
      photoFilenames = new Map()
      olderKeysByName = new Map()
      listedPhotos = new Map()
      openedWith = keysId
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

  const photoFail = (
    error: unknown,
    direction?: 'upload' | 'download'
  ): never => {
    let failure: SyncTransportError
    if (error instanceof HttpError && error.serverCode === 'too_large')
      failure = new SyncTransportError('too-large', 'too_large')
    else {
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
        listedPhotos.get(filename)?.name ??
        photoName(current.photoKeys.nameKey, filename),
      size: listedPhotos.get(filename)?.size,
    })
    return { current, address }
  }
  const slotId = () => deps.slotId?.() ?? null

  const findUnderOtherName = async (
    current: ServerSyncAccess,
    filename: string,
    tried: string,
    size: number | undefined
  ) => {
    for (const keys of [current.photoKeys, ...(current.olderPhotoKeys ?? [])]) {
      const name = photoName(keys.nameKey, filename)
      if (name === tried) continue

      const target = { accountId: current.accountId, name, size }
      try {
        const got = await getSyncPhoto(current.options, target.name, size)
        return { target, keys, got }
      } catch (error) {
        if (!(error instanceof HttpError && error.serverCode === 'not_found'))
          throw error
      }
    }
    return null
  }

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
    binarySetupTimeoutMs: SERVER_BINARY_SETUP_TIMEOUT_MS,
    isAvailable: deps.isAvailable,
    identityToken: deps.identityToken,
    identityTokenMatches: (stored) => {
      const current = deps.identityToken()
      return current === null ? null : current === stored
    },
    waitForInitialScan: async () => true,

    async readFiles(include, options) {
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
        if (options?.listOnly?.(filename)) {
          files.push({ filename, json: '', modifiedAt: slot.updatedAt })
          continue
        }
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

    async deleteEndedWebSnapshots(merged) {
      const own = slotId()
      if (!own) return []
      const current = await access()
      let listing: Awaited<ReturnType<typeof listSyncSlots>>
      try {
        listing = await listSyncSlots(current.options)
      } catch (error) {
        return fail(error)
      }
      const deleted: string[] = []
      for (const slot of endedWebSlots(listing.slots, own, merged)) {
        try {
          await deleteSyncSlot(current.options, slot.slotId)
        } catch {
          continue
        }
        cache.delete(slot.slotId)
        deleted.push(filenameForSlot(slot.slotId))
      }
      return deleted
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

    async writeBinary(filename, sourcePath, phases) {
      if (!deps.files) throw new SyncTransportError('unknown', 'no photo files')

      if (!isCloudSyncPhotoFilename(filename))
        throw new SyncTransportError('unknown', 'not a Cloud Sync photo name')
      if (deps.photoSwitch?.() === false)
        throw new SyncTransportError('server-error', 'photos_disabled')
      const { current } = await photoAccess()

      const target = {
        accountId: current.accountId,
        name: photoName(current.photoKeys.nameKey, filename),
      }

      const size = await deps.files.size(sourcePath)
      if (size > MAX_PHOTO_FILE_BYTES)
        return photoFail(
          new SyncTransportError('too-large', 'too_large'),
          'upload'
        )

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
        phases?.start()
        const put = await putSyncPhoto(
          current.options,
          { name: target.name, meta, blob },
          slotId()
        )
        phases?.end()
        photoFilenames.set(target.name, filename)
        olderKeysByName.delete(target.name)
        listedPhotos.set(filename, { name: target.name, size: blob.length })
        usage(put.usage, 'put')
        return put.createdAt
      } catch (error) {
        return photoFail(error, 'upload')
      }
    },

    async readBinary(filename, destinationPath, phases) {
      if (!deps.files) throw new SyncTransportError('unknown', 'no photo files')
      const { current, address } = await photoAccess()
      let target = address(filename)
      let keys = olderKeysByName.get(target.name) ?? current.photoKeys
      let got: Awaited<ReturnType<typeof getSyncPhoto>>
      try {
        phases?.start()
        got = await getSyncPhoto(current.options, target.name, target.size)
        phases?.end()
      } catch (error) {
        const found =
          error instanceof HttpError && error.serverCode === 'not_found'
            ? await findUnderOtherName(
                current,
                filename,
                target.name,
                target.size
              ).catch((older: unknown) => photoFail(older, 'download'))
            : null
        if (!found) return photoFail(error, 'download')
        ;({ target, keys, got } = found)
      }
      let bytes: Uint8Array
      try {
        bytes = await openPhoto(keys.photoKey, got.blob, target, pause)
      } catch (error) {
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
      const names = new Map<string, { name: string; size: number }>()
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
            const address = { accountId: current.accountId, name: photo.name }
            filename = openPhotoMeta(
              photoKey,
              photo.meta,
              address,
              nameKey,
              isCloudSyncPhotoFilename
            )
            for (const older of current.olderPhotoKeys ?? []) {
              if (filename) break
              filename = openPhotoMeta(
                older.photoKey,
                photo.meta,
                address,
                older.nameKey,
                isCloudSyncPhotoFilename
              )
              if (filename) olderKeysByName.set(photo.name, older)
            }
            photoFilenames.set(photo.name, filename)
          }
          if (!filename) continue

          const seen = names.get(filename)
          if (seen !== undefined) {
            if (
              olderKeysByName.has(photo.name) ||
              !olderKeysByName.has(seen.name)
            )
              continue
            files.splice(
              files.findIndex((file) => file.filename === filename),
              1
            )
          }
          names.set(filename, { name: photo.name, size: photo.size })
          files.push({
            filename,
            modifiedAt: photo.createdAt,
            size: photo.size,
          })
        }
        last = page.usage ?? last
        cursor = page.cursor
      } while (cursor)
      for (const name of photoFilenames.keys())
        if (!listed.has(name)) {
          photoFilenames.delete(name)
          olderKeysByName.delete(name)
        }
      listedPhotos = names
      usage(last, 'list')
      return files
    },

    async deleteBinaryFile(filename) {
      const { current, address } = await photoAccess()

      const names = [
        ...new Set([
          address(filename).name,
          photoName(current.photoKeys.nameKey, filename),
          ...(current.olderPhotoKeys ?? []).map((older) =>
            photoName(older.nameKey, filename)
          ),
        ]),
      ].slice(0, 100)
      try {
        const deleted = await deleteSyncPhotos(
          current.options,
          { names },
          slotId()
        )
        for (const name of names) {
          photoFilenames.delete(name)
          olderKeysByName.delete(name)
        }
        listedPhotos.delete(filename)
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
        olderKeysByName = new Map()
        listedPhotos = new Map()
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
      olderKeysByName = new Map()
      listedPhotos = new Map()
      openedWith = null
      cacheAccount = null
      seq = 0
    },
  }
  return transport
}
