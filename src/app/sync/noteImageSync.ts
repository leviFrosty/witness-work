import {
  filenameForNoteImage,
  noteImageIdFromFilename,
} from '@/lib/syncTransport/imageNames'
import {
  type ImagePushTrigger,
  waitsOnFullAccount,
  type ImageSyncBookkeeping,
  type ImageSyncDeps,
  deletedElsewhere,
  downloadWaves,
  isLinkFailure,
  isTooLarge,
  uploadBackoffMs,
} from '@/app/sync/imageSync'
import { syncTransportErrorCode } from '@/lib/syncTransport/types'

export const NOTE_IMAGE_CLOUD_GRACE_MS = 24 * 60 * 60_000

type Paths = { localPath: (id: string) => string }

export async function pushNoteImages(
  args: Paths & {
    ids: Iterable<string>
    bookkeeping: ImageSyncBookkeeping
    deps: ImageSyncDeps

    trigger?: ImagePushTrigger
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
  let recorded = 0
  const container = new Map(
    (await deps.bridge.listBinaryFiles()).map((file) => [
      file.filename,
      file.modifiedAt,
    ])
  )
  for (const id of args.ids) {
    if (deps.canTransfer && !deps.canTransfer()) break
    const filename = filenameForNoteImage(id)
    const entry = bookkeeping[filename]
    const containerMtime = container.get(filename)
    if (containerMtime !== undefined) {
      if (deps.putsAgain && entry?.containerMtime === undefined) {
        const localMtime = await deps.fs.getModifiedAt(args.localPath(id))
        if (localMtime != null) {
          bookkeeping[filename] = {
            localMtime,
            uploadedMtime: localMtime,
            containerMtime,
          }
          recorded++
        }
      }
      continue
    }
    const path = args.localPath(id)
    const localMtime = await deps.fs.getModifiedAt(path)

    if (localMtime == null) continue
    if (deletedElsewhere(deps, filename, entry)) continue
    if (isTooLarge(entry, localMtime)) continue
    if (
      entry?.lastError &&
      (waitsOnFullAccount(deps, entry, args.trigger ?? 'store-edit') ??
        deps.now() - (entry.failedAt ?? 0) <
          uploadBackoffMs(entry.failures ?? 1))
    ) {
      continue
    }
    try {
      if (deps.canUpload && !deps.canUpload()) break
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
      if (isLinkFailure(error)) break
    }
  }

  return {
    bookkeeping:
      uploaded || failed || recorded ? bookkeeping : args.bookkeeping,
    uploaded,
    failed,
  }
}

export async function pullNoteImages(
  args: Paths & {
    ids: Iterable<string>
    deps: ImageSyncDeps

    prepare: () => Promise<void>
  }
): Promise<{
  downloaded: string[]
  failed: number
  seen: ImageSyncBookkeeping
}> {
  const { deps } = args
  const seen: ImageSyncBookkeeping = {}
  const wanted: string[] = []
  for (const id of args.ids) {
    if ((await deps.fs.getModifiedAt(args.localPath(id))) == null) {
      wanted.push(id)
    }
  }
  if (!wanted.length) return { downloaded: [], failed: 0, seen }
  const container = new Map(
    (await deps.bridge.listBinaryFiles()).map((file) => [
      file.filename,
      file.size,
    ])
  )

  const available = wanted.filter((id) =>
    container.has(filenameForNoteImage(id))
  )
  if (!available.length) return { downloaded: [], failed: 0, seen }
  await args.prepare()
  const downloaded: string[] = []
  let failed = 0
  const waves = downloadWaves(available, (id) =>
    container.get(filenameForNoteImage(id))
  )
  for (const wave of waves) {
    if (deps.canTransfer && !deps.canTransfer()) break
    await Promise.all(
      wave.map(async (id) => {
        try {
          const filename = filenameForNoteImage(id)
          const containerMtime = await deps.bridge.readBinary(
            filename,
            args.localPath(id)
          )
          downloaded.push(id)
          const localMtime = deps.putsAgain
            ? await deps.fs.getModifiedAt(args.localPath(id))
            : null
          if (localMtime != null)
            seen[filename] = {
              localMtime,
              uploadedMtime: localMtime,
              containerMtime,
            }
        } catch {
          failed++
        }
      })
    )
  }
  return { downloaded, failed, seen }
}

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
