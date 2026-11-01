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

export type SyncRead = {
  files: SyncFile[]

  pending: string[] | null
}

export type UploadStatus = {
  uploaded: boolean
  uploading: boolean
  error: { domain: string; code: number } | null
}

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

  identityToken?(): string | null
  identityTokenMatches?(stored: string): boolean | null
  getContainerPath(): string | null
  waitForInitialScan(timeoutMs: number): Promise<boolean>
  readAll(): Promise<SyncFile[]>

  listFiles?(): Promise<string[]>
  readFiles?(filenames: string[]): Promise<SyncRead>
  uploadStatus?(filename: string): Promise<UploadStatus | null>
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

export function identityToken(): string | null {
  if (Platform.OS !== 'ios' || !native?.identityToken) return null
  return native.identityToken()
}

export function identityTokenMatches(stored: string): boolean | null {
  if (Platform.OS !== 'ios' || !native?.identityTokenMatches) return null
  return native.identityTokenMatches(stored)
}

export function getContainerPath(): string | null {
  if (Platform.OS !== 'ios' || !native) return null
  return native.getContainerPath()
}

export async function waitForInitialScan(timeoutMs = 5000): Promise<boolean> {
  if (Platform.OS !== 'ios' || !native) return true
  return native.waitForInitialScan(timeoutMs)
}

export async function readFiles(
  include: (filename: string) => boolean
): Promise<SyncRead> {
  if (Platform.OS !== 'ios' || !native) return { files: [], pending: [] }

  if (!native.listFiles || !native.readFiles) {
    const files = await native.readAll()
    return { files: files.filter((f) => include(f.filename)), pending: null }
  }
  const filenames = (await native.listFiles()).filter(include)
  if (filenames.length === 0) return { files: [], pending: [] }
  return native.readFiles(filenames)
}

export async function write(filename: string, json: string): Promise<number> {
  if (Platform.OS !== 'ios' || !native) {
    throw new Error('iCloud bridge is not available on this platform')
  }
  return native.write(filename, json)
}

export function supportsUploadStatus(): boolean {
  return Platform.OS === 'ios' && !!native?.uploadStatus
}

export async function uploadStatus(
  filename: string
): Promise<UploadStatus | null> {
  if (Platform.OS !== 'ios' || !native?.uploadStatus) return null
  return native.uploadStatus(filename)
}

export async function deleteFile(filename: string): Promise<void> {
  if (Platform.OS !== 'ios' || !native) return
  await native.deleteFile(filename)
}

export async function deleteAll(): Promise<void> {
  if (Platform.OS !== 'ios' || !native) return
  await native.deleteAll()
}

export async function writeBinary(
  filename: string,
  sourcePath: string
): Promise<number> {
  if (Platform.OS !== 'ios' || !native) {
    throw new Error('iCloud bridge is not available on this platform')
  }
  return native.writeBinary(filename, sourcePath)
}

export async function readBinary(
  filename: string,
  destinationPath: string
): Promise<number> {
  if (Platform.OS !== 'ios' || !native) {
    throw new Error('iCloud bridge is not available on this platform')
  }
  return native.readBinary(filename, destinationPath)
}

export async function listBinaryFiles(): Promise<BinaryFileInfo[]> {
  if (Platform.OS !== 'ios' || !native) return []
  return native.listBinaryFiles()
}

export async function deleteBinaryFile(filename: string): Promise<void> {
  if (Platform.OS !== 'ios' || !native) return
  await native.deleteBinaryFile(filename)
}

export async function deleteAllBinaries(): Promise<void> {
  if (Platform.OS !== 'ios' || !native) return
  await native.deleteAllBinaries()
}

export function addRemoteChangeListener(
  listener: ICloudBridgeEvents['onRemoteChange']
): EventSubscription {
  if (!native) {
    return { remove: () => {} }
  }
  return native.addListener('onRemoteChange', listener)
}

export function addAvailabilityChangeListener(
  listener: ICloudBridgeEvents['onAvailabilityChange']
): EventSubscription {
  if (!native) {
    return { remove: () => {} }
  }
  return native.addListener('onAvailabilityChange', listener)
}
