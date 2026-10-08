import * as ICloudBridge from '../../../modules/icloud-bridge'
import type { SyncTransport } from '@/lib/syncTransport/types'

/**
 * The app's private iCloud Drive ubiquity container on iOS, through
 * `modules/icloud-bridge`. Every method forwards to the bridge when called, so
 * the bridge's own platform and binary-version fallbacks apply unchanged.
 */
export const iCloudTransport: SyncTransport = {
  kind: 'icloud',
  writeConfirmsUpload: false,
  isAvailable: () => ICloudBridge.isAvailable(),
  identityToken: () => ICloudBridge.identityToken(),
  identityTokenMatches: (stored) => ICloudBridge.identityTokenMatches(stored),
  waitForInitialScan: (...args) => ICloudBridge.waitForInitialScan(...args),
  readFiles: (include) => ICloudBridge.readFiles(include),
  write: (filename, json) => ICloudBridge.write(filename, json),
  supportsUploadStatus: () => ICloudBridge.supportsUploadStatus(),
  uploadStatus: (filename) => ICloudBridge.uploadStatus(filename),
  deleteFile: (filename) => ICloudBridge.deleteFile(filename),
  deleteAll: () => ICloudBridge.deleteAll(),
  writeBinary: (filename, sourcePath) =>
    ICloudBridge.writeBinary(filename, sourcePath),
  readBinary: (filename, destinationPath) =>
    ICloudBridge.readBinary(filename, destinationPath),
  listBinaryFiles: () => ICloudBridge.listBinaryFiles(),
  deleteBinaryFile: (filename) => ICloudBridge.deleteBinaryFile(filename),
  deleteAllBinaries: () => ICloudBridge.deleteAllBinaries(),
  addRemoteChangeListener: (listener) =>
    ICloudBridge.addRemoteChangeListener(listener),
  addAvailabilityChangeListener: (listener) =>
    ICloudBridge.addAvailabilityChangeListener(listener),
}
