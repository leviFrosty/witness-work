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
