import { filenameForContact, filenameForProfile } from '@/app/sync/imageNames'

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
}

/**
 * An identity's avatar source on disk. The orchestrator turns these into
 * deterministic container filenames via `imageNames.ts`.
 */
export type AvatarSource =
  | { kind: 'profile'; localPath: string }
  | { kind: 'contact'; id: string; localPath: string }

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
 * - `lastError` / `failedAt`: last failure classification and timestamp. Drives
 *   foreground-only backoff for quota errors.
 */
export type ImageSyncBookkeeping = Record<
  string,
  {
    localMtime: number
    uploadedMtime: number | null
    containerMtime?: number
    lastError?: string
    failedAt?: number
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
function filenameForSource(source: AvatarSource): string {
  return source.kind === 'profile'
    ? filenameForProfile()
    : filenameForContact(source.id)
}

/**
 * Rough error classifier for write/read failures. A genuine "iCloud is full"
 * response must back off to foreground-only retries so the debounced push on
 * every store edit doesn't thrash the network. Everything else is treated as
 * transient and freely retried on the next push.
 *
 * Pattern-matches on the Swift bridge's rejection message — the native layer
 * passes `NSError.localizedDescription` through, so we watch for the keywords
 * iOS surfaces when iCloud storage is exhausted. Over-classifying here is cheap
 * (we just wait until the next foreground) so err towards the backoff when in
 * doubt.
 */
function isQuotaError(message: string): boolean {
  return /quota|out of space|not enough space|storage/i.test(message)
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

  for (const source of sources) {
    const filename = filenameForSource(source)
    const localMtime = await deps.fs.getModifiedAt(source.localPath)
    if (localMtime == null) continue
    const entry = bookkeeping[filename]
    if (entry && entry.uploadedMtime === localMtime) {
      skipped++
      continue
    }
    // Quota-failed entries get a foreground-only retry policy so routine
    // store-edit pushes don't spam the network when iCloud is full. On
    // foreground, the user may have freed up space, so we retry once.
    if (
      args.trigger === 'store-edit' &&
      entry?.lastError &&
      isQuotaError(entry.lastError) &&
      entry.localMtime === localMtime
    ) {
      skipped++
      continue
    }
    try {
      await deps.bridge.writeBinary(filename, source.localPath)
      bookkeeping[filename] = { localMtime, uploadedMtime: localMtime }
      uploaded++
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      bookkeeping[filename] = {
        localMtime,
        uploadedMtime: entry?.uploadedMtime ?? null,
        lastError: message,
        failedAt: deps.now(),
      }
      failed++
    }
  }

  return { bookkeeping, uploaded, failed, skipped }
}

export type DownloadedAvatar =
  | { kind: 'profile'; localUri: string }
  | { kind: 'contact'; id: string; localUri: string }

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

  const containerIndex = new Map<string, number>()
  for (const entry of await deps.bridge.listBinaryFiles()) {
    containerIndex.set(entry.filename, entry.modifiedAt)
  }

  for (const source of expectedSources) {
    const filename = filenameForSource(source)
    const containerMtime = containerIndex.get(filename)
    if (containerMtime == null) {
      missing.push(
        source.kind === 'profile'
          ? { kind: 'profile' }
          : { kind: 'contact', id: source.id }
      )
      continue
    }

    const existing = bookkeeping[filename]
    if (existing?.containerMtime === containerMtime) {
      continue
    }

    await deps.bridge.readBinary(filename, source.localPath)
    bookkeeping[filename] = {
      localMtime: existing?.localMtime ?? 0,
      uploadedMtime: existing?.uploadedMtime ?? null,
      containerMtime,
    }
    const localUri = `${source.localPath}?t=${deps.now()}`
    downloaded.push(
      source.kind === 'profile'
        ? { kind: 'profile', localUri }
        : { kind: 'contact', id: source.id, localUri }
    )
  }

  return { downloaded, missing, bookkeeping }
}

/** An active identity the caller wants to keep in the container. */
export type ActiveIdentity =
  | { kind: 'profile' }
  | { kind: 'contact'; id: string }

export type GcResult = {
  /** Filenames removed from the container. */
  deleted: string[]
}

/**
 * Deletes container binaries that no longer correspond to any active local
 * identity — the Phase-2 equivalent of tombstone cleanup. Safe to run
 * liberally; the container is not the source of truth for avatars (the contact
 * records are), so deleting an orphan never loses user data that isn't already
 * lost.
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
  deps: ImageSyncDeps
}): Promise<GcResult> {
  const { deps } = args
  const keep = new Set<string>()
  for (const id of args.activeIdentities) {
    keep.add(
      id.kind === 'profile' ? filenameForProfile() : filenameForContact(id.id)
    )
  }

  const container = await deps.bridge.listBinaryFiles()
  const deleted: string[] = []
  for (const { filename } of container) {
    if (keep.has(filename)) continue
    await deps.bridge.deleteBinaryFile(filename)
    deleted.push(filename)
  }

  return { deleted }
}
