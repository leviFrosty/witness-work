import { filenameForContact, filenameForProfile } from '@/app/sync/imageNames'
import { syncTransportErrorCode } from '@/lib/syncTransport/types'

/**
 * Dependencies injected by the caller (`iCloudSync.ts`). Keeping the module
 * pure of react-native / expo-file-system / ICloudBridge imports makes it
 * trivially unit-testable and leaves a single integration seam.
 */
export type ImageSyncDeps = {
  bridge: {
    writeBinary(filename: string, sourcePath: string): Promise<number>
    readBinary(filename: string, destinationPath: string): Promise<number>
    listBinaryFiles(): Promise<Array<{ filename: string; modifiedAt: number }>>
    deleteBinaryFile(filename: string): Promise<void>
  }
  fs: {
    /** Returns the file's mtime in epoch ms, or null when missing. */
    getModifiedAt(path: string): Promise<number | null>
  }
  now: () => number
  /** Recheck consent/access before starting each operation, after awaits. */
  canTransfer?: () => boolean
}

/**
 * An identity's avatar source on disk. The orchestrator turns these into
 * deterministic container filenames via `imageNames.ts`.
 */
export type AvatarSource =
  | {
      kind: 'profile'
      localPath: string
      revision?: string
      expectedValue?: string
      expectedUpdatedAt?: number
      fallbackPath?: string
    }
  | {
      kind: 'contact'
      id: string
      localPath: string
      revision?: string
      expectedValue?: string
      expectedUpdatedAt?: number
      fallbackPath?: string
    }

/**
 * Persistent bookkeeping keyed by container filename. Mirrors the
 * `iCloudImageSync` preference shape — see `stores/preferences.ts` for the full
 * semantic documentation. Fields:
 *
 * - `localMtime` / `uploadedMtime`: on-device file mtime at the point of the last
 *   successful upload — drives "do I need to re-upload?" on the push side.
 * - `containerMtime`: container (iCloud) mtime observed at the point of the last
 *   successful download — drives "do I need to re-download?" on the pull side.
 *   Independent of the upload fields because the container mtime is
 *   server-assigned and has no relation to the local file's mtime.
 * - `lastError` / `failedAt`: last failure message and timestamp.
 * - `errorCode`: the transport's classification of it (`storage-full`, …).
 * - `failures`: consecutive failed uploads of this file, for `uploadBackoffMs`.
 */
export type ImageSyncBookkeeping = Record<
  string,
  {
    localMtime: number
    uploadedMtime: number | null
    containerMtime?: number
    lastError?: string
    errorCode?: string
    failedAt?: number
    failures?: number
  }
>

export type PushImagesResult = {
  /** Updated bookkeeping — caller persists this to preferences. */
  bookkeeping: ImageSyncBookkeeping
  uploaded: number
  failed: number
  skipped: number
}

/** Maps an `AvatarSource` identity to its deterministic container filename. */
export function filenameForSource(source: AvatarSource): string {
  return source.kind === 'profile'
    ? filenameForProfile(source.revision)
    : filenameForContact(source.id, source.revision)
}

/**
 * Whether a failed upload hit a full account. Those retry only on foreground,
 * so the debounced push on every store edit doesn't thrash the network. The
 * transport's code decides (Drive's 403 `storageQuotaExceeded`); entries
 * recorded before codes existed fall back to the message.
 */
function isQuotaFailure(entry: { lastError?: string; errorCode?: string }) {
  if (entry.errorCode) return entry.errorCode === 'storage-full'
  return /quota|out of space|not enough space|storage/i.test(
    entry.lastError ?? ''
  )
}

/** Waits after 1, 2, 3… failed uploads of one file: 30 s, 2 min, 8 min… 1 h. */
export function uploadBackoffMs(failures: number): number {
  return Math.min(30_000 * 4 ** Math.max(0, failures - 1), 60 * 60_000)
}

/**
 * Walks the provided avatar sources and uploads any whose local file has
 * changed since its last recorded upload (or has never been uploaded). The
 * caller is responsible for reading sources out of the zustand stores — this
 * module stays store-agnostic.
 *
 * The `trigger` argument distinguishes routine store-edit push cycles from
 * explicit foreground-driven retries: quota-failed entries are skipped on
 * store-edit pushes (to avoid thrashing every time the user types) and only
 * re-attempted on foreground.
 */
export async function pushAllImages(args: {
  sources: AvatarSource[]
  bookkeeping: ImageSyncBookkeeping
  deps: ImageSyncDeps
  trigger: 'store-edit' | 'foreground'
}): Promise<PushImagesResult> {
  const { sources, deps } = args
  const bookkeeping: ImageSyncBookkeeping = { ...args.bookkeeping }
  let uploaded = 0
  let failed = 0
  let skipped = 0

  const containerFiles = new Set(
    (await deps.bridge.listBinaryFiles()).map((file) => file.filename)
  )
  for (const source of sources) {
    if (deps.canTransfer && !deps.canTransfer()) break
    const filename = filenameForSource(source)
    const localMtime = await deps.fs.getModifiedAt(source.localPath)
    if (localMtime == null) continue
    const entry = bookkeeping[filename]
    if (
      entry &&
      entry.uploadedMtime === localMtime &&
      containerFiles.has(filename)
    ) {
      skipped++
      continue
    }
    // A file that failed backs off before it's tried again, unless the user
    // picked a new photo. A full account retries only on foreground: routine
    // store-edit pushes mustn't spam the network, and by then the user may
    // have freed up space.
    if (entry?.lastError && entry.localMtime === localMtime) {
      const waiting =
        deps.now() - (entry.failedAt ?? 0) <
        uploadBackoffMs(entry.failures ?? 1)
      if (waiting || (args.trigger === 'store-edit' && isQuotaFailure(entry))) {
        skipped++
        continue
      }
    }
    try {
      if (deps.canTransfer && !deps.canTransfer()) break
      const containerMtime = await deps.bridge.writeBinary(
        filename,
        source.localPath
      )
      bookkeeping[filename] = {
        localMtime,
        uploadedMtime: localMtime,
        containerMtime,
      }
      uploaded++
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const errorCode = syncTransportErrorCode(e)
      bookkeeping[filename] = {
        localMtime,
        uploadedMtime: entry?.uploadedMtime ?? null,
        lastError: message,
        ...(errorCode ? { errorCode } : {}),
        failedAt: deps.now(),
        failures:
          entry?.lastError && entry.localMtime === localMtime
            ? (entry.failures ?? 1) + 1
            : 1,
      }
      failed++
    }
  }

  return { bookkeeping, uploaded, failed, skipped }
}

export type DownloadedAvatar =
  | {
      kind: 'profile'
      localUri: string
      revision?: string
      expectedValue?: string
      expectedUpdatedAt?: number
      fallbackPath?: string
    }
  | {
      kind: 'contact'
      id: string
      localUri: string
      revision?: string
      expectedValue?: string
      expectedUpdatedAt?: number
      fallbackPath?: string
    }

export type PullImagesResult = {
  /**
   * Identities whose binaries were just materialized on disk. The caller
   * rewrites `avatar.value` on the corresponding record to `localUri` so the
   * display layer swaps the marker out for a real path.
   */
  downloaded: DownloadedAvatar[]
  /**
   * Identities whose binaries are absent from the container — the sender
   * deleted them, or image sync isn't enabled on the other device. Caller
   * should leave the marker in place; the Avatar component treats it as "fall
   * back to initials."
   */
  missing: Array<{ kind: 'profile' } | { kind: 'contact'; id: string }>
  /**
   * Binaries that failed to download this pass (removed since the listing,
   * still downloading at the deadline). Left out of `bookkeeping`, so the next
   * pull tries them again.
   */
  failed: number
  /**
   * Updated per-filename bookkeeping. Currently just echoes the input — the
   * pull path doesn't own the upload-mtime field — but reserved here for a
   * future per-filename "last downloaded container mtime" once we want to
   * short-circuit cross-device redundant downloads.
   */
  bookkeeping: ImageSyncBookkeeping
}

/**
 * Mirror of `pushAllImages` for the inbound direction. Given a list of
 * identities whose synced record currently carries an icloud:// marker in
 * `avatar.value`, this function downloads any missing binaries and returns the
 * resulting local URIs the caller should write back onto the records.
 *
 * Missing-in-container is not an error — see Q3 in the design doc. A sender
 * that turns image sync off deletes its binaries; receivers fall back to
 * initials gracefully via the Avatar component's marker-aware rendering.
 */
export async function pullMissingImages(args: {
  expectedSources: AvatarSource[]
  bookkeeping: ImageSyncBookkeeping
  deps: ImageSyncDeps
}): Promise<PullImagesResult> {
  const { expectedSources, deps } = args
  const bookkeeping: ImageSyncBookkeeping = { ...args.bookkeeping }
  const downloaded: DownloadedAvatar[] = []
  const missing: PullImagesResult['missing'] = []
  let failed = 0

  const containerIndex = new Map<string, number>()
  for (const entry of await deps.bridge.listBinaryFiles()) {
    containerIndex.set(entry.filename, entry.modifiedAt)
  }

  const downloadOne = async (source: AvatarSource) => {
    if (deps.canTransfer && !deps.canTransfer()) return
    const filename = filenameForSource(source)
    const containerMtime = containerIndex.get(filename)
    let localPath = source.localPath
    let localMtime = await deps.fs.getModifiedAt(localPath)
    if (localMtime == null && source.fallbackPath) {
      const fallbackMtime = await deps.fs.getModifiedAt(source.fallbackPath)
      if (fallbackMtime != null) {
        localPath = source.fallbackPath
        localMtime = fallbackMtime
      }
    }
    const reference = {
      ...(source.revision ? { revision: source.revision } : {}),
      ...(source.expectedValue !== undefined
        ? { expectedValue: source.expectedValue }
        : {}),
      ...(source.expectedUpdatedAt !== undefined
        ? { expectedUpdatedAt: source.expectedUpdatedAt }
        : {}),
    }
    if (
      localMtime != null &&
      (containerMtime == null ||
        bookkeeping[filename]?.containerMtime === containerMtime)
    ) {
      downloaded.push(
        source.kind === 'profile'
          ? {
              kind: 'profile',
              localUri: `${localPath}?t=${localMtime}`,
              ...reference,
            }
          : {
              kind: 'contact',
              id: source.id,
              localUri: `${localPath}?t=${localMtime}`,
              ...reference,
            }
      )
      return
    }
    if (containerMtime == null) {
      missing.push(
        source.kind === 'profile'
          ? { kind: 'profile' }
          : { kind: 'contact', id: source.id }
      )
      return
    }

    let downloadedContainerMtime: number
    try {
      if (deps.canTransfer && !deps.canTransfer()) return
      downloadedContainerMtime = await deps.bridge.readBinary(
        filename,
        source.localPath
      )
    } catch {
      // One unreadable binary mustn't strand every photo after it — or the
      // ones already downloaded this pass, which the caller only applies
      // once this returns.
      failed++
      return
    }
    const downloadedMtime = (await deps.fs.getModifiedAt(source.localPath)) ?? 0
    bookkeeping[filename] = {
      localMtime: downloadedMtime,
      uploadedMtime: downloadedMtime,
      containerMtime: downloadedContainerMtime,
    }
    const localUri = `${source.localPath}?t=${deps.now()}`
    downloaded.push(
      source.kind === 'profile'
        ? { kind: 'profile', localUri, ...reference }
        : { kind: 'contact', id: source.id, localUri, ...reference }
    )
  }

  for (let start = 0; start < expectedSources.length; start += 4) {
    if (deps.canTransfer && !deps.canTransfer()) break
    await Promise.all(expectedSources.slice(start, start + 4).map(downloadOne))
  }

  return { downloaded, missing, failed, bookkeeping }
}

/** An active identity the caller wants to keep in the container. */
export type ActiveIdentity =
  | { kind: 'profile'; revision?: string }
  | { kind: 'contact'; id: string; revision?: string }

export type GcResult = {
  /** Filenames removed from the container. */
  deleted: string[]
  /** `shouldStop` ended the sweep before every orphan was deleted. */
  stopped: boolean
}

/**
 * Deletes container binaries that no longer correspond to any active local
 * identity — the Phase-2 equivalent of tombstone cleanup. Only safe when
 * `activeIdentities` reflects every device's records: a binary whose owner
 * hasn't reached this device yet looks orphaned, and its uploader never
 * re-uploads an unchanged photo. `shouldStop` is checked before each delete so
 * the caller can end the sweep when that set may have changed.
 *
 * Concrete cases this catches:
 *
 * - Contact deleted on Device A while Device B was offline. Device B's push path
 *   sees the resurrected tombstone and the next GC sweep on A removes the
 *   now-orphaned binary.
 * - Profile avatar changed from image → emoji on Device A, leaving
 *   `witness-work-img-profile.jpg` unreferenced by anyone's record.
 * - Historical drift from pre-Phase-2 installs once we enable image sync.
 */
export async function gcOrphanImages(args: {
  activeIdentities: ActiveIdentity[]
  deletions: Array<{ identity: ActiveIdentity; deletedAt: number }>
  deps: ImageSyncDeps
  shouldStop?: () => boolean
}): Promise<GcResult> {
  const { deps } = args
  const keep = new Set<string>()
  for (const id of args.activeIdentities) {
    keep.add(
      id.kind === 'profile'
        ? filenameForProfile(id.revision)
        : filenameForContact(id.id, id.revision)
    )
  }

  const container = await deps.bridge.listBinaryFiles()
  const deleted: string[] = []
  for (const { filename, modifiedAt } of container) {
    if (keep.has(filename)) continue
    const deletion = args.deletions.find(({ identity }) => {
      const base =
        identity.kind === 'profile'
          ? filenameForProfile()
          : filenameForContact(identity.id)
      return filename === base || filename.startsWith(`${base.slice(0, -4)}--`)
    })
    const grace = 24 * 60 * 60_000
    if (
      !deletion ||
      deps.now() - Math.max(modifiedAt, deletion.deletedAt) < grace
    )
      continue
    if (args.shouldStop?.() || (deps.canTransfer && !deps.canTransfer()))
      return { deleted, stopped: true }
    await deps.bridge.deleteBinaryFile(filename)
    deleted.push(filename)
  }

  return { deleted, stopped: false }
}
