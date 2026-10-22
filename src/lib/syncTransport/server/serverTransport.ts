import { HttpError } from '@/lib/http/request'
import type { BearerAccountOptions } from '@/lib/serverAccount/client'
import {
  BackupOpenError,
  BACKUP_PLAINTEXT_VERSION,
  type BackupPlatform,
} from '@/lib/serverAccount/backupCrypto'
import {
  BLOB_TIMEOUT_MS,
  deleteSyncSlot,
  getSyncSlot,
  listSyncSlots,
  putSyncSlot,
  SYNC_LIMITS,
  type SyncSlot,
} from '@/lib/syncTransport/server/syncClient'
import {
  openSyncBlob,
  sealSyncBlob,
  SYNC_SLOT_ID_PATTERN,
} from '@/lib/syncTransport/server/syncCrypto'
import {
  type SyncFile,
  type SyncTransport,
  SyncTransportError,
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
 * - Photos aren't transferred (phase 1): binaries list empty and refuse writes.
 */

/** What a call needs: the account, its sync key, and the session's options. */
export type ServerSyncAccess = {
  accountId: string
  syncKey: Uint8Array
  options: BearerAccountOptions
}

/** A server refusal the app records (the kill switch, or not entitled). */
export type ServerSyncRefusal = 'disabled' | 'supporter_required'

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
}

/**
 * The engine's wait for a write: the put's own upload timeout, plus opening or
 * refreshing the session and sealing the snapshot first. Shorter, and the
 * engine would give up on a slow upload that still lands, then retry with a put
 * the server refuses (429) while the first is uploading.
 */
export const SERVER_WRITE_TIMEOUT_MS = BLOB_TIMEOUT_MS + 30_000

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
      const plaintext = openSyncBlob(current.syncKey, blob, {
        accountId: current.accountId,
        slotId: slot.slotId,
      })
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

  const transport: ServerTransport = {
    kind: 'cloud',
    writeConfirmsUpload: true,
    supportsBinaries: false,
    writeTimeoutMs: SERVER_WRITE_TIMEOUT_MS,
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

    writeBinary: async () => {
      throw new SyncTransportError('not-found', 'Cloud Sync has no photos yet')
    },
    readBinary: async () => {
      throw new SyncTransportError('not-found', 'Cloud Sync has no photos yet')
    },
    listBinaryFiles: async () => [],
    deleteBinaryFile: async () => {},
    deleteAllBinaries: async () => {},

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
      cacheAccount = null
      seq = 0
    },
  }
  return transport
}
