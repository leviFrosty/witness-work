import {
  filenameForNoteImage,
  noteImageIdFromFilename,
} from '@/app/sync/imageNames'
import {
  type ImageSyncBookkeeping,
  type ImageSyncDeps,
  uploadBackoffMs,
} from '@/app/sync/imageSync'
import { syncTransportErrorCode } from '@/lib/syncTransport/types'

/*
 * Photos in notes, synced next to the JSON like avatars (and behind the same
 * "Include photos" setting), but simpler: a photo never changes once it's
 * taken, so each one uploads once under `witness-work-note-<id>.jpg` and
 * downloads only when a note refers to it and this device doesn't have it.
 * Pure: the caller (`iCloudSync.ts`) supplies the transport and files.
 */

/** A cloud photo no note refers to is kept this long first. */
export const NOTE_IMAGE_CLOUD_GRACE_MS = 24 * 60 * 60_000
const DOWNLOAD_CONCURRENCY = 4

type Paths = { localPath: (id: string) => string }

/** Uploads the referenced photos that aren't in the cloud yet. */
export async function pushNoteImages(
  args: Paths & {
    ids: Iterable<string>
    bookkeeping: ImageSyncBookkeeping
    deps: ImageSyncDeps
  }
): Promise<{
  bookkeeping: ImageSyncBookkeeping
  uploaded: number
  failed: number
}> {
  const { deps } = args
  const bookkeeping: ImageSyncBookkeeping = { ...args.bookkeeping }
  let uploaded = 0
  let failed = 0
  const container = new Set(
    (await deps.bridge.listBinaryFiles()).map((file) => file.filename)
  )
  for (const id of args.ids) {
    if (deps.canTransfer && !deps.canTransfer()) break
    const filename = filenameForNoteImage(id)
    if (container.has(filename)) continue
    const path = args.localPath(id)
    const localMtime = await deps.fs.getModifiedAt(path)
    // Another device's photo that hasn't downloaded here; it uploads it.
    if (localMtime == null) continue
    const entry = bookkeeping[filename]
    if (
      entry?.lastError &&
      deps.now() - (entry.failedAt ?? 0) < uploadBackoffMs(entry.failures ?? 1)
    ) {
      continue
    }
    try {
      const containerMtime = await deps.bridge.writeBinary(filename, path)
      bookkeeping[filename] = {
        localMtime,
        uploadedMtime: localMtime,
        containerMtime,
      }
      uploaded++
    } catch (error) {
      const errorCode = syncTransportErrorCode(error)
      bookkeeping[filename] = {
        localMtime,
        uploadedMtime: null,
        lastError: error instanceof Error ? error.message : String(error),
        ...(errorCode ? { errorCode } : {}),
        failedAt: deps.now(),
        failures: entry?.lastError ? (entry.failures ?? 1) + 1 : 1,
      }
      failed++
    }
  }
  return { bookkeeping, uploaded, failed }
}

/** Downloads the referenced photos this device doesn't have. */
export async function pullNoteImages(
  args: Paths & {
    ids: Iterable<string>
    deps: ImageSyncDeps
    /** Makes the folder downloads land in. */
    prepare: () => Promise<void>
  }
): Promise<{ downloaded: string[]; failed: number }> {
  const { deps } = args
  const wanted: string[] = []
  for (const id of args.ids) {
    if ((await deps.fs.getModifiedAt(args.localPath(id))) == null) {
      wanted.push(id)
    }
  }
  if (!wanted.length) return { downloaded: [], failed: 0 }
  const container = new Set(
    (await deps.bridge.listBinaryFiles()).map((file) => file.filename)
  )
  // Not uploaded (yet): its device has photo sync off, or is still uploading.
  const available = wanted.filter((id) =>
    container.has(filenameForNoteImage(id))
  )
  if (!available.length) return { downloaded: [], failed: 0 }
  await args.prepare()
  const downloaded: string[] = []
  let failed = 0
  for (let start = 0; start < available.length; start += DOWNLOAD_CONCURRENCY) {
    if (deps.canTransfer && !deps.canTransfer()) break
    await Promise.all(
      available.slice(start, start + DOWNLOAD_CONCURRENCY).map(async (id) => {
        try {
          await deps.bridge.readBinary(
            filenameForNoteImage(id),
            args.localPath(id)
          )
          downloaded.push(id)
        } catch {
          // One unreadable photo mustn't strand the rest; the next pull tries
          // it again.
          failed++
        }
      })
    )
  }
  return { downloaded, failed }
}

/**
 * Deletes cloud note photos no note refers to, once they're past the grace
 * period. Only safe when `referenced` reflects every device's notes (after a
 * complete pull): a photo whose note hasn't arrived yet looks unused.
 */
export async function gcNoteImages(args: {
  referenced: Set<string>
  deps: ImageSyncDeps
  shouldStop?: () => boolean
}): Promise<{ deleted: string[]; stopped: boolean }> {
  const { deps } = args
  const deleted: string[] = []
  for (const { filename, modifiedAt } of await deps.bridge.listBinaryFiles()) {
    const id = noteImageIdFromFilename(filename)
    if (!id || args.referenced.has(id)) continue
    if (deps.now() - modifiedAt < NOTE_IMAGE_CLOUD_GRACE_MS) continue
    if (args.shouldStop?.() || (deps.canTransfer && !deps.canTransfer())) {
      return { deleted, stopped: true }
    }
    await deps.bridge.deleteBinaryFile(filename)
    deleted.push(filename)
  }
  return { deleted, stopped: false }
}
