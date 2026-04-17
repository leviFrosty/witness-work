import {
  EventSubscription,
  NativeModule,
  Platform,
  requireOptionalNativeModule,
} from 'expo-modules-core'

export type ReadResult = {
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
  read(): Promise<ReadResult | null>
  write(json: string): Promise<number>
  deleteFile(): Promise<null>
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
 * Reads the JSON blob from the ubiquity container. Resolves to null if the file
 * does not yet exist. Rejects on coordination / I/O errors or when iCloud is
 * unavailable.
 */
export async function read(): Promise<ReadResult | null> {
  if (Platform.OS !== 'ios' || !native) return null
  return native.read()
}

/**
 * Writes `json` to the ubiquity container using an atomic, coordinated write.
 * Resolves to the file's modification time in epoch ms.
 */
export async function write(json: string): Promise<number> {
  if (Platform.OS !== 'ios' || !native) {
    throw new Error('iCloud bridge is not available on this platform')
  }
  return native.write(json)
}

/** Coordinated delete of the sync file. Idempotent — no error if missing. */
export async function deleteFile(): Promise<void> {
  if (Platform.OS !== 'ios' || !native) return
  await native.deleteFile()
}

/**
 * Fires when NSMetadataQuery observes a modification to the sync file that is
 * strictly newer than the last write/read this device performed — typically
 * meaning another device pushed an update.
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
