import {
  filenameForContact,
  filenameForProfile,
} from '@/lib/syncTransport/imageNames'
import { syncTransportErrorCode } from '@/lib/syncTransport/types'
import { isStorageFullError } from '@/lib/errorTrackingPolicy'

export type ImageSyncDeps = {
  bridge: {
    writeBinary(filename: string, sourcePath: string): Promise<number>
    readBinary(filename: string, destinationPath: string): Promise<number>
    listBinaryFiles(): Promise<
      Array<{ filename: string; modifiedAt: number; size?: number }>
    >
    deleteBinaryFile(filename: string): Promise<void>
  }
  fs: {
    getModifiedAt(path: string): Promise<number | null>
  }
  now: () => number

  canTransfer?: () => boolean

  immutableNames?: boolean

  canUpload?: () => boolean

  fullRetriesOnSignal?: boolean

  putsAgain?: (filename: string) => boolean
}

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
  bookkeeping: ImageSyncBookkeeping
  uploaded: number
  failed: number
  skipped: number
}

export function filenameForSource(source: AvatarSource): string {
  return source.kind === 'profile'
    ? filenameForProfile(source.revision)
    : filenameForContact(source.id, source.revision)
}

function isQuotaFailure(entry: { lastError?: string; errorCode?: string }) {
  if (entry.errorCode) return entry.errorCode === 'storage-full'
  const message = entry.lastError ?? ''
  return (
    isStorageFullError(message) ||
    /quota|not enough space|storage/i.test(message)
  )
}

export type ImagePushTrigger = 'store-edit' | 'foreground'

export function waitsOnFullAccount(
  deps: ImageSyncDeps,
  entry: { lastError?: string; errorCode?: string },
  trigger: ImagePushTrigger
): boolean | null {
  if (!deps.fullRetriesOnSignal || !isQuotaFailure(entry)) return null
  return trigger === 'store-edit'
}

export const isTooLarge = (
  entry: { errorCode?: string; localMtime: number } | undefined,
  localMtime: number
) => entry?.errorCode === 'too-large' && entry.localMtime === localMtime

export function bookkeepingForNewTransport(
  bookkeeping: ImageSyncBookkeeping
): ImageSyncBookkeeping {
  return Object.fromEntries(
    Object.entries(bookkeeping).map(([filename, entry]) => [
      filename,
      { localMtime: entry.localMtime, uploadedMtime: entry.uploadedMtime },
    ])
  )
}

export const deletedElsewhere = (
  deps: ImageSyncDeps,
  filename: string,
  entry: { containerMtime?: number } | undefined
) =>
  entry?.containerMtime !== undefined &&
  !!deps.putsAgain &&
  !deps.putsAgain(filename)

export const isLinkFailure = (error: unknown) =>
  syncTransportErrorCode(error) === 'network'

const DOWNLOAD_WAVE_BYTES = 4 * 1024 * 1024
const DOWNLOAD_WAVE_FILES = 4

export function downloadWaves<T>(
  items: T[],
  sizeOf: (item: T) => number | undefined
): T[][] {
  const waves: T[][] = []
  let bytes = 0
  for (const item of items) {
    const size = sizeOf(item) ?? 0
    const wave = waves[waves.length - 1]
    if (
      wave &&
      wave.length < DOWNLOAD_WAVE_FILES &&
      bytes + size <= DOWNLOAD_WAVE_BYTES
    ) {
      wave.push(item)
      bytes += size
    } else {
      waves.push([item])
      bytes = size
    }
  }
  return waves
}

export function uploadBackoffMs(failures: number): number {
  return Math.min(30_000 * 4 ** Math.max(0, failures - 1), 60 * 60_000)
}

export async function pushAllImages(args: {
  sources: AvatarSource[]
  bookkeeping: ImageSyncBookkeeping
  deps: ImageSyncDeps
  trigger: ImagePushTrigger
}): Promise<PushImagesResult> {
  const { sources, deps } = args
  const bookkeeping: ImageSyncBookkeeping = { ...args.bookkeeping }
  let uploaded = 0
  let failed = 0
  let skipped = 0

  const containerFiles = new Map(
    (await deps.bridge.listBinaryFiles()).map((file) => [
      file.filename,
      file.modifiedAt,
    ])
  )
  for (const source of sources) {
    if (deps.canTransfer && !deps.canTransfer()) break
    const filename = filenameForSource(source)
    const localMtime = await deps.fs.getModifiedAt(source.localPath)
    if (localMtime == null) continue
    const entry = bookkeeping[filename]
    const containerMtime = containerFiles.get(filename)
    if (
      entry &&
      entry.uploadedMtime === localMtime &&
      containerMtime !== undefined
    ) {
      if (deps.putsAgain && entry.containerMtime === undefined)
        bookkeeping[filename] = { ...entry, containerMtime }
      skipped++
      continue
    }
    if (
      containerMtime === undefined &&
      deletedElsewhere(deps, filename, entry)
    ) {
      skipped++
      continue
    }

    if (isTooLarge(entry, localMtime)) {
      skipped++
      continue
    }
    if (entry?.lastError && entry.localMtime === localMtime) {
      const full = waitsOnFullAccount(deps, entry, args.trigger)
      const waiting =
        full ??
        (deps.now() - (entry.failedAt ?? 0) <
          uploadBackoffMs(entry.failures ?? 1) ||
          (args.trigger === 'store-edit' && isQuotaFailure(entry)))
      if (waiting) {
        skipped++
        continue
      }
    }
    try {
      if (deps.canTransfer && !deps.canTransfer()) break
      if (deps.canUpload && !deps.canUpload()) break
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
      if (isLinkFailure(e)) break
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
  downloaded: DownloadedAvatar[]

  missing: Array<{ kind: 'profile' } | { kind: 'contact'; id: string }>

  failed: number

  bookkeeping: ImageSyncBookkeeping
}

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
  const containerSizes = new Map<string, number>()
  for (const entry of await deps.bridge.listBinaryFiles()) {
    containerIndex.set(entry.filename, entry.modifiedAt)
    if (entry.size !== undefined) containerSizes.set(entry.filename, entry.size)
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
        bookkeeping[filename]?.containerMtime === containerMtime ||
        (deps.immutableNames && source.revision !== undefined))
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

  const waves = downloadWaves(expectedSources, (source) =>
    containerSizes.get(filenameForSource(source))
  )
  for (const wave of waves) {
    if (deps.canTransfer && !deps.canTransfer()) break
    await Promise.all(wave.map(downloadOne))
  }

  return { downloaded, missing, failed, bookkeeping }
}

export type ActiveIdentity =
  | { kind: 'profile'; revision?: string }
  | { kind: 'contact'; id: string; revision?: string }

export type GcResult = {
  deleted: string[]

  stopped: boolean
}

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
