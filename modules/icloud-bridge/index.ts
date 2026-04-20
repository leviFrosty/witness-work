import {
  EventSubscription,
  NativeModule,
  Platform,
  requireOptionalNativeModule,
} from 'expo-modules-core'

export type SyncFile = {
  filename: string
  json: string
  modifiedAt: number
}

/** One entry returned by `listBinaryFiles` — filename + container mtime. */
export type BinaryFileInfo = {
  filename: string
  modifiedAt: number
}

type ICloudBridgeEvents = {
  onRemoteChange: (event: { modifiedAt: number }) => void
  onAvailabilityChange: (event: { available: boolean }) => void
}

declare class ICloudBridgeNative extends NativeModule<ICloudBridgeEvents> {
  isAvailable(): boolean
  getContainerPath(): string | null
  waitForInitialScan(timeoutMs: number): Promise<boolean>
  readAll(): Promise<SyncFile[]>
  write(filename: string, json: string): Promise<number>
  deleteFile(filename: string): Promise<null>
  deleteAll(): Promise<null>
  writeBinary(filename: string, sourcePath: string): Promise<number>
  readBinary(filename: string, destinationPath: string): Promise<number>
  listBinaryFiles(): Promise<BinaryFileInfo[]>
  deleteBinaryFile(filename: string): Promise<null>
  deleteAllBinaries(): Promise<null>
}

const native = requireOptionalNativeModule<ICloudBridgeNative>('ICloudBridge')

export function isAvailable(): boolean {
  if (Platform.OS !== 'ios' || !native) return false
  return native.isAvailable()
}

/** Debug helper: absolute filesystem path of the ubiquity container (or null). */
export function getContainerPath(): string | null {
  if (Platform.OS !== 'ios' || !native) return null
  return native.getContainerPath()
}

/**
 * Resolves `true` once `NSMetadataQuery` has completed at least one full scan
 * of the ubiquity container, or `false` if `timeoutMs` elapses first.
 *
 * Callers that enumerate files for a "do we have a backup?" decision should
 * await this first on cold launch: `FileManager.contentsOfDirectory` can return
 * an empty list for several seconds after app start even when a remote
 * per-device file already exists, and an unconditional "no backup" verdict
 * during onboarding is what produces the bug where a fresh install's defaults
 * later beat the real remote data in the LWW merge.
 *
 * On non-iOS / no native module, resolves `true` immediately — there's no scan
 * to wait on, and callers should fall through to their own noop path.
 */
export async function waitForInitialScan(timeoutMs = 5000): Promise<boolean> {
  if (Platform.OS !== 'ios' || !native) return true
  return native.waitForInitialScan(timeoutMs)
}

/**
 * Reads every `witness-work*.json` file in the ubiquity container, triggering
 * downloads in parallel for any that are still iCloud placeholders. Resolves to
 * the list of successfully-materialized files — anything still downloading at
 * the 10s deadline is skipped and picked up by the next pull.
 *
 * Returns an empty array when there are no sync files yet.
 */
export async function readAll(): Promise<SyncFile[]> {
  if (Platform.OS !== 'ios' || !native) return []
  return native.readAll()
}

/**
 * Writes `json` to `filename` inside the ubiquity container using an atomic,
 * coordinated write. Filename must live in the `witness-work*.json` namespace —
 * anything else is rejected by the native module.
 *
 * Resolves to the file's modification time in epoch ms.
 */
export async function write(filename: string, json: string): Promise<number> {
  if (Platform.OS !== 'ios' || !native) {
    throw new Error('iCloud bridge is not available on this platform')
  }
  return native.write(filename, json)
}

/**
 * Coordinated delete of a single sync file. Idempotent — no error if missing.
 * Filename is validated against the sync namespace by the native module.
 */
export async function deleteFile(filename: string): Promise<void> {
  if (Platform.OS !== 'ios' || !native) return
  await native.deleteFile(filename)
}

/** Coordinated delete of every `witness-work*.json` in the container. */
export async function deleteAll(): Promise<void> {
  if (Platform.OS !== 'ios' || !native) return
  await native.deleteAll()
}

/**
 * Copies a local file at `sourcePath` into the ubiquity container under the
 * validated image filename (`witness-work-img-*.jpg` namespace) and resolves to
 * the resulting file's modification time in epoch ms.
 *
 * File-path transport — the bytes never flow through the JS bridge, so a 5 MB
 * original-quality photo uploads for the price of a stat() + coordinated copy.
 */
export async function writeBinary(
  filename: string,
  sourcePath: string
): Promise<number> {
  if (Platform.OS !== 'ios' || !native) {
    throw new Error('iCloud bridge is not available on this platform')
  }
  return native.writeBinary(filename, sourcePath)
}

/**
 * Coordinated-read of a container binary into `destinationPath`. Kicks off
 * `startDownloadingUbiquitousItem` if the file is still an iCloud placeholder
 * and polls up to 10s for it to materialize. Resolves to the container file's
 * modification time in epoch ms (used by the sync bookkeeper to skip redundant
 * re-downloads next cycle).
 *
 * Rejects with `ICLOUD_READ_BINARY_MISSING` when the file is absent from the
 * container — callers should treat that as "fall back to initials" rather than
 * a hard error.
 */
export async function readBinary(
  filename: string,
  destinationPath: string
): Promise<number> {
  if (Platform.OS !== 'ios' || !native) {
    throw new Error('iCloud bridge is not available on this platform')
  }
  return native.readBinary(filename, destinationPath)
}

/**
 * Enumerates `witness-work-img-*.jpg` in the container with their container
 * mtimes. Does not trigger downloads. Returns an empty array when the iCloud
 * bridge is unavailable, so callers can treat "no iCloud" and "no binaries"
 * identically for list-style operations.
 */
export async function listBinaryFiles(): Promise<BinaryFileInfo[]> {
  if (Platform.OS !== 'ios' || !native) return []
  return native.listBinaryFiles()
}

/**
 * Coordinated delete of a single binary file. Idempotent on the native side —
 * resolves cleanly when the target doesn't exist.
 */
export async function deleteBinaryFile(filename: string): Promise<void> {
  if (Platform.OS !== 'ios' || !native) return
  await native.deleteBinaryFile(filename)
}

/** Coordinated delete of every `witness-work-img-*.jpg` in the container. */
export async function deleteAllBinaries(): Promise<void> {
  if (Platform.OS !== 'ios' || !native) return
  await native.deleteAllBinaries()
}

/**
 * Fires when NSMetadataQuery observes a modification to any sync file whose
 * content-change date is strictly newer than the most recent write/read this
 * device performed for that filename — typically meaning another device pushed
 * an update.
 */
export function addRemoteChangeListener(
  listener: ICloudBridgeEvents['onRemoteChange']
): EventSubscription {
  if (!native) {
    return { remove: () => {} }
  }
  return native.addListener('onRemoteChange', listener)
}

/**
 * Fires when the iCloud identity token changes — e.g. the user signs out or
 * into a different Apple ID while the app is foregrounded.
 */
export function addAvailabilityChangeListener(
  listener: ICloudBridgeEvents['onAvailabilityChange']
): EventSubscription {
  if (!native) {
    return { remove: () => {} }
  }
  return native.addListener('onAvailabilityChange', listener)
}
