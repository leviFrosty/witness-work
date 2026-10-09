import { AppState, type AppStateStatus } from 'react-native'
import { logger } from '@/lib/logger'
import {
  SyncTransportError,
  syncTransportErrorCode,
  type BinaryFileInfo,
  type SyncFile,
  type SyncRead,
  type SyncTransport,
  type TransportSubscription,
} from '@/lib/syncTransport/types'
import {
  createDriveApi,
  type DriveApi,
  type DriveFile,
  type DriveFileTransfer,
} from '@/lib/syncTransport/googleDrive/driveApi'
import {
  addGoogleDriveAvailabilityListener,
  googleDriveAccessToken,
  googleDriveOrigin,
  isGoogleDriveConnected,
} from '@/lib/syncTransport/googleDrive/googleDriveAuth'
import { usePreferences } from '@/stores/preferences'

/**
 * Android: the hidden Google Drive app data folder of the connected Google
 * Account (ADR 0019), as a `SyncTransport`.
 *
 * Drive differs from an iCloud container in three ways this adapter hides:
 *
 * - **Duplicate names.** Drive allows several files with one name (two devices
 *   creating the account file at once). Reads present the newest copy; writes
 *   and deletes remove the others.
 * - **Revisions.** Updating a file's content keeps up to 100 old revisions for 30
 *   days, counted against the user's storage. JSON files are written
 *   copy-on-write instead: create the new copy, then delete the old one, so a
 *   reader always finds one complete copy and nothing accumulates.
 * - **No change events.** Drive pushes only to public webhooks, so while the app
 *   is in the foreground (and `shouldPoll` allows) the folder is listed every
 *   `POLL_INTERVAL_MS` and a file another device changed fires the
 *   remote-change event. Listings are shared for `LISTING_REUSE_MS`.
 *
 * Writes resolve once Drive has stored the file (`writeConfirmsUpload`), and
 * there's no offline queue: the sync engine's pending-push flag and retries
 * cover offline edits.
 */

const JSON_PREFIX = 'witness-work'
const JSON_EXT = '.json'
const IMAGE_PREFIXES = ['witness-work-img-', 'witness-work-note-']
const IMAGE_EXT = '.jpg'

export const isSyncJsonName = (name: string): boolean =>
  name.startsWith(JSON_PREFIX) &&
  name.endsWith(JSON_EXT) &&
  !name.includes('/') &&
  !name.includes('..')

/** Avatars (`witness-work-img-`) and note photos (`witness-work-note-`). */
export const isSyncImageName = (name: string): boolean =>
  IMAGE_PREFIXES.some((prefix) => name.startsWith(prefix)) &&
  name.endsWith(IMAGE_EXT) &&
  !name.includes('/') &&
  !name.includes('..')

/** Listing while the app is active, to notice other devices' writes. */
export const POLL_INTERVAL_MS = 60_000
/**
 * A listing this recent answers the next caller instead of a new request. One
 * peer change otherwise lists the folder about three times in a row: the
 * engine's pull, the account reconcile and the photo pass.
 */
export const LISTING_REUSE_MS = 3_000
/** Longest one photo upload or download may take before it's cancelled. */
export const TRANSFER_TIMEOUT_MS = 90_000
/** Longest wait between polls after failures. */
const MAX_POLL_INTERVAL_MS = 10 * 60_000
const DOWNLOAD_CONCURRENCY = 4

/** Newest first; ties broken by id so every device picks the same copy. */
const newestFirst = (a: DriveFile, b: DriveFile) =>
  b.modifiedAt - a.modifiedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

function assertName(name: string, valid: (name: string) => boolean): void {
  if (!valid(name))
    throw new SyncTransportError('unknown', `Not a sync filename: ${name}`)
}

async function inBatches<T>(
  items: T[],
  size: number,
  run: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += size)
    await Promise.all(items.slice(i, i + size).map(run))
}

/**
 * Runs a native transfer, cancelling it after `TRANSFER_TIMEOUT_MS`: neither of
 * expo-file-system's transfers has a timeout of its own, and one that never
 * finishes would hold every later photo transfer.
 */
async function withCancel<T>(
  run: () => Promise<T>,
  cancel: () => Promise<void>,
  what: string
): Promise<T> {
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    void cancel().catch(() => {})
  }, TRANSFER_TIMEOUT_MS)
  try {
    const result = await run()
    if (timedOut) throw new Error(`${what} timed out`)
    return result
  } catch (error) {
    throw timedOut ? new Error(`${what} timed out`) : error
  } finally {
    clearTimeout(timer)
  }
}

const header = (headers: Record<string, string> | undefined, name: string) =>
  Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === name
  )?.[1] ?? null

/**
 * `expo-file-system`, downloading to a sibling file and moving it in place.
 * Loaded on first transfer so importing the transport stays native-free.
 */
const fileSystem = () => import('expo-file-system/legacy')
const fileSystemTransfer: DriveFileTransfer = {
  async upload({ url, sourcePath, headers }) {
    const FileSystem = await fileSystem()
    const task = FileSystem.createUploadTask(url, sourcePath, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers,
    })
    const result = await withCancel(
      () => task.uploadAsync(),
      () => task.cancelAsync(),
      'Drive upload'
    )
    if (!result) throw new Error('Drive upload cancelled')
    return {
      status: result.status,
      body: result.body,
      retryAfter: header(result.headers, 'retry-after'),
    }
  },
  async download({ url, destinationPath, headers }) {
    const FileSystem = await fileSystem()
    const partial = `${destinationPath}.part`
    try {
      const download = FileSystem.createDownloadResumable(url, partial, {
        headers,
      })
      const result = await withCancel(
        () => download.downloadAsync(),
        () => download.cancelAsync(),
        'Drive download'
      )
      if (!result) throw new Error('Drive download cancelled')
      if (result.status >= 200 && result.status < 300) {
        await FileSystem.deleteAsync(destinationPath, { idempotent: true })
        await FileSystem.moveAsync({ from: partial, to: destinationPath })
        return { status: result.status }
      }
      // Drive's error JSON landed in the file; its reason tells a throttle
      // from a refused token.
      const body = await FileSystem.readAsStringAsync(partial).catch(
        () => undefined
      )
      return {
        status: result.status,
        body: body && body.length < 16_384 ? body : undefined,
        retryAfter: header(result.headers, 'retry-after'),
      }
    } finally {
      await FileSystem.deleteAsync(partial, { idempotent: true })
    }
  },
}

export function createGoogleDriveTransport(deps: {
  /**
   * A Drive client whose requests act only for `account`: a token request fails
   * once another account is connected.
   */
  api: (account: string | null) => DriveApi
  isConnected: () => boolean
  accountToken: () => string | null
  addAvailabilityListener: typeof addGoogleDriveAvailabilityListener
  now?: () => number
  appState?: () => {
    current: AppStateStatus
    subscribe: (listener: (state: AppStateStatus) => void) => {
      remove: () => void
    }
  }
}): SyncTransport & {
  /** Lists now and fires remote-change for what changed (tests, foreground). */
  poll(): Promise<void>
} {
  /** Every copy of each name, newest first, from the latest listing. */
  let index: Map<string, DriveFile[]> | null = null
  /** The copy this device last read or wrote, per JSON name. */
  const observed = new Map<string, DriveFile>()
  /** The copy a poll last announced, so an unread change fires once. */
  const announced = new Map<string, string>()
  /** Downloaded JSON by Drive file id; copies are immutable (copy-on-write). */
  const contents = new Map<string, string>()
  /** Per-name queue, so one name never has two writes racing. */
  const queues = new Map<string, Promise<unknown>>()
  /** The account the caches above describe; another account starts over. */
  let cachedAccount: string | null = null
  /** When `index` was last listed in full, for `LISTING_REUSE_MS`. */
  let listedAt = 0
  /** The listing request in flight, shared by every caller meanwhile. */
  let listing: { account: string | null; promise: Promise<void> } | null = null
  let shouldPoll: () => boolean = () => true
  const now = deps.now ?? Date.now

  /**
   * Captures the account when an operation is called, so the operation (even
   * one queued behind another write) never runs under a newly connected one.
   */
  type Op = { account: string | null; api: DriveApi }
  function begin(): Op {
    const account = deps.accountToken()
    return { account, api: deps.api(account) }
  }

  function forAccount(account: string | null): void {
    if (account === cachedAccount) return
    cachedAccount = account
    index = null
    listedAt = 0
    observed.clear()
    announced.clear()
    contents.clear()
  }

  const remoteListeners = new Set<(event: { modifiedAt: number }) => void>()
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let pollDelay = POLL_INTERVAL_MS
  let polling: Promise<void> | null = null
  let appStateSub: { remove: () => void } | null = null
  let availabilitySub: TransportSubscription | null = null

  function serialize<T>(name: string, work: () => Promise<T>): Promise<T> {
    const previous = queues.get(name) ?? Promise.resolve()
    const next = previous.then(work, work)
    const settled = next.then(
      () => undefined,
      () => undefined
    )
    queues.set(name, settled)
    void settled.then(() => {
      if (queues.get(name) === settled) queues.delete(name)
    })
    return next
  }

  async function listNow(op: Op): Promise<void> {
    const next = new Map<string, DriveFile[]>()
    for (const file of await op.api.listFiles()) {
      const copies = next.get(file.name)
      if (copies) copies.push(file)
      else next.set(file.name, [file])
    }
    for (const copies of next.values()) copies.sort(newestFirst)
    // Another account was connected while this listed.
    if (op.account !== cachedAccount) return
    index = next
    listedAt = now()
    const live = new Set(
      [...next.values()].flatMap((copies) => copies.map((f) => f.id))
    )
    for (const id of [...contents.keys()])
      if (!live.has(id)) contents.delete(id)
  }

  /**
   * The folder's current listing. Callers within `LISTING_REUSE_MS` of the last
   * one, or while one is in flight, share it; `fresh` always lists anew (after
   * a read found a copy already gone).
   */
  async function list(
    op: Op,
    { fresh = false }: { fresh?: boolean } = {}
  ): Promise<Map<string, DriveFile[]>> {
    forAccount(op.account)
    if (!fresh && index && now() - listedAt < LISTING_REUSE_MS) return index
    if (!fresh && listing?.account === op.account) await listing.promise
    else {
      const promise = listNow(op)
      const entry = { account: op.account, promise }
      listing = entry
      try {
        await promise
      } finally {
        if (listing === entry) listing = null
      }
    }
    forAccount(op.account)
    if (!index) throw new SyncTransportError('network', 'Drive listing lost')
    return index
  }

  const copiesOf = async (op: Op, name: string): Promise<DriveFile[]> => {
    forAccount(op.account)
    return ((index ?? (await list(op))).get(name) ?? []).slice()
  }

  function remember(file: DriveFile): void {
    index ??= new Map<string, DriveFile[]>()
    const copies = index.get(file.name) ?? []
    index.set(
      file.name,
      [file, ...copies.filter((copy) => copy.id !== file.id)].sort(newestFirst)
    )
  }

  function forgetCopies(name: string, ids: Set<string>): void {
    const copies = index?.get(name)
    if (!copies) return
    const kept = copies.filter((copy) => !ids.has(copy.id))
    if (kept.length) index!.set(name, kept)
    else index!.delete(name)
    for (const id of ids) contents.delete(id)
  }

  /** Deletes `copies`; a failure is left for the next write or delete. */
  async function removeCopies(op: Op, name: string, copies: DriveFile[]) {
    const removed = new Set<string>()
    for (const copy of copies) {
      try {
        await op.api.deleteFile(copy.id)
        removed.add(copy.id)
      } catch (error) {
        logger.warn('[GoogleDrive] stale copy not deleted', { name, error })
      }
    }
    forgetCopies(name, removed)
  }

  async function deleteName(op: Op, name: string): Promise<void> {
    const copies = await copiesOf(op, name)
    for (const copy of copies) await op.api.deleteFile(copy.id)
    forgetCopies(name, new Set(copies.map((copy) => copy.id)))
    observed.delete(name)
  }

  function emitRemoteChange(modifiedAt: number): void {
    remoteListeners.forEach((listener) => listener({ modifiedAt }))
  }

  /**
   * JSON files whose newest copy this device hasn't read, written, or already
   * announced. Returns the newest such change, or null.
   */
  function unannouncedChanges(
    listing: Map<string, DriveFile[]>
  ): number | null {
    let newest: number | null = null
    for (const [name, copies] of listing) {
      if (!isSyncJsonName(name)) continue
      const current = copies[0]
      const seen = observed.get(name)
      if (seen && seen.id === current.id) continue
      if (seen && current.modifiedAt < seen.modifiedAt) continue
      if (announced.get(name) === current.id) continue
      announced.set(name, current.id)
      newest = Math.max(newest ?? 0, current.modifiedAt)
    }
    return newest
  }

  async function pollNow(): Promise<void> {
    if (!deps.isConnected() || !shouldPoll()) return
    let listing: Map<string, DriveFile[]>
    try {
      // A poll exists to see what changed, so it always lists anew; the
      // engine's pull right after reuses this listing.
      listing = await list(begin(), { fresh: true })
      pollDelay = POLL_INTERVAL_MS
    } catch (error) {
      pollDelay = Math.min(pollDelay * 2, MAX_POLL_INTERVAL_MS)
      logger.warn('[GoogleDrive] poll failed', error)
      return
    }
    const changedAt = unannouncedChanges(listing)
    if (changedAt !== null) emitRemoteChange(changedAt)
  }

  function poll(): Promise<void> {
    polling ??= pollNow().finally(() => {
      polling = null
    })
    return polling
  }

  const appState = () =>
    deps.appState?.() ?? {
      current: AppState.currentState,
      subscribe: (listener: (state: AppStateStatus) => void) =>
        AppState.addEventListener('change', listener),
    }

  function stopPolling(): void {
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
  }

  function schedulePoll(): void {
    stopPolling()
    if (!remoteListeners.size || !deps.isConnected()) return
    if (appState().current !== 'active') return
    pollTimer = setTimeout(() => {
      pollTimer = null
      void poll().finally(schedulePoll)
    }, pollDelay)
  }

  function startWatching(): void {
    if (appStateSub) return
    appStateSub = appState().subscribe((state) => {
      // The engine catches up on foreground itself; polling resumes after.
      if (state === 'active') schedulePoll()
      else stopPolling()
    })
    availabilitySub = deps.addAvailabilityListener(() => schedulePoll())
    schedulePoll()
  }

  function stopWatching(): void {
    stopPolling()
    appStateSub?.remove()
    appStateSub = null
    availabilitySub?.remove()
    availabilitySub = null
  }

  return {
    kind: 'google-drive',
    writeConfirmsUpload: true,
    isAvailable: () => deps.isConnected(),
    identityToken: () => deps.accountToken(),
    identityTokenMatches: (stored) => {
      const current = deps.accountToken()
      return current === null ? null : current === stored
    },
    // A Drive listing is complete as soon as it returns.
    waitForInitialScan: async () => true,

    async readFiles(include): Promise<SyncRead> {
      const op = begin()
      const wantedIn = (listing: Map<string, DriveFile[]>) =>
        [...listing.entries()]
          .filter(([name]) => isSyncJsonName(name) && include(name))
          .map(([, copies]) => copies[0])
      const files: SyncFile[] = []
      const pending: string[] = []
      /** Copies another device replaced (copy-on-write) after the listing. */
      const replaced: string[] = []
      const read = (wanted: DriveFile[], last: boolean) =>
        inBatches(wanted, DOWNLOAD_CONCURRENCY, async (file) => {
          try {
            let json = contents.get(file.id)
            if (json === undefined) {
              json = await op.api.downloadText(file.id)
              contents.set(file.id, json)
            }
            files.push({
              filename: file.name,
              json,
              modifiedAt: file.modifiedAt,
            })
            observed.set(file.name, file)
          } catch (error) {
            if (!last && syncTransportErrorCode(error) === 'not-found') {
              replaced.push(file.name)
              return
            }
            logger.warn('[GoogleDrive] file not read', {
              name: file.name,
              error,
            })
            pending.push(file.name)
            // Still unread: the next poll announces it again.
            announced.delete(file.name)
          }
        })
      await read(wantedIn(await list(op)), false)
      if (replaced.length) {
        // Read the copy that replaced it; a name that's gone entirely was
        // deleted, which isn't a failed read.
        const names = new Set(replaced)
        await read(
          wantedIn(await list(op, { fresh: true })).filter((file) =>
            names.has(file.name)
          ),
          true
        )
      }
      files.sort((a, b) => a.filename.localeCompare(b.filename))
      return { files, pending }
    },

    write: async (filename, json) => {
      assertName(filename, isSyncJsonName)
      const op = begin()
      return serialize(filename, async () => {
        const previous = await copiesOf(op, filename)
        const created = await op.api.createJson(filename, json)
        contents.set(created.id, json)
        remember(created)
        observed.set(filename, created)
        await removeCopies(op, filename, previous)
        return created.modifiedAt
      })
    },

    supportsUploadStatus: () => false,
    uploadStatus: async () => null,

    deleteFile: async (filename) => {
      assertName(filename, isSyncJsonName)
      const op = begin()
      return serialize(filename, () => deleteName(op, filename))
    },

    async deleteAll() {
      const op = begin()
      const listing = await list(op)
      for (const name of listing.keys())
        if (isSyncJsonName(name))
          await serialize(name, () => deleteName(op, name))
    },

    writeBinary: async (filename, sourcePath) => {
      assertName(filename, isSyncImageName)
      const op = begin()
      return serialize(filename, async () => {
        const [current, ...stale] = await copiesOf(op, filename)
        const upload = (existingId: string | null) =>
          op.api.uploadBinary({ existingId, name: filename, sourcePath })
        let uploaded: DriveFile
        try {
          uploaded = await upload(current?.id ?? null)
        } catch (error) {
          // Another device's cleanup deleted the copy we knew of.
          if (!current || syncTransportErrorCode(error) !== 'not-found')
            throw error
          forgetCopies(filename, new Set([current.id]))
          uploaded = await upload(null)
        }
        remember(uploaded)
        await removeCopies(op, filename, stale)
        return uploaded.modifiedAt
      })
    },

    async readBinary(filename, destinationPath) {
      assertName(filename, isSyncImageName)
      const op = begin()
      const [current] = await copiesOf(op, filename)
      if (!current || current.size === 0)
        throw new SyncTransportError('not-found', `${filename} is not in Drive`)
      await op.api.downloadBinary(current.id, destinationPath)
      return current.modifiedAt
    },

    async listBinaryFiles(): Promise<BinaryFileInfo[]> {
      const listing = await list(begin())
      const files: BinaryFileInfo[] = []
      for (const [name, copies] of listing) {
        // An empty file is an upload that never finished: treat it as absent
        // so its owner uploads it again.
        if (!isSyncImageName(name) || copies[0].size === 0) continue
        files.push({ filename: name, modifiedAt: copies[0].modifiedAt })
      }
      return files
    },

    deleteBinaryFile: async (filename) => {
      assertName(filename, isSyncImageName)
      const op = begin()
      return serialize(filename, () => deleteName(op, filename))
    },

    async deleteAllBinaries() {
      const op = begin()
      const listing = await list(op)
      for (const name of listing.keys())
        if (isSyncImageName(name))
          await serialize(name, () => deleteName(op, name))
    },

    addRemoteChangeListener(listener) {
      remoteListeners.add(listener)
      startWatching()
      return {
        remove: () => {
          remoteListeners.delete(listener)
          if (!remoteListeners.size) stopWatching()
        },
      }
    },

    addAvailabilityChangeListener: (listener) =>
      deps.addAvailabilityListener(listener),

    setShouldPoll(next) {
      shouldPoll = next
    },

    poll,
  }
}

export const googleDriveTransport = createGoogleDriveTransport({
  // Built per operation: the account binds its token requests, and the dev
  // fake can change the origin at runtime.
  api: (account) =>
    createDriveApi({
      origin: googleDriveOrigin(),
      getToken: (options) => googleDriveAccessToken({ ...options, account }),
      transfer: fileSystemTransfer,
    }),
  isConnected: isGoogleDriveConnected,
  accountToken: () => usePreferences.getState().googleDriveAccountId,
  addAvailabilityListener: addGoogleDriveAvailabilityListener,
})
