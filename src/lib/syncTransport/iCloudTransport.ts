import * as ICloudBridge from '../../../modules/icloud-bridge'
import type { SyncTransport } from '@/lib/syncTransport/types'
import { toICloudTransportError } from '@/lib/syncTransport/iCloudErrors'

const classified = <T>(operation: () => Promise<T>): Promise<T> =>
  operation().catch((error: unknown) => {
    throw toICloudTransportError(error)
  })

export const iCloudTransport: SyncTransport = {
  kind: 'icloud',
  writeConfirmsUpload: false,
  isAvailable: () => ICloudBridge.isAvailable(),
  identityToken: () => ICloudBridge.identityToken(),
  identityTokenMatches: (stored) => ICloudBridge.identityTokenMatches(stored),
  waitForInitialScan: (...args) => ICloudBridge.waitForInitialScan(...args),
  readFiles: (include) => classified(() => ICloudBridge.readFiles(include)),
  write: (filename, json) =>
    classified(() => ICloudBridge.write(filename, json)),
  supportsUploadStatus: () => ICloudBridge.supportsUploadStatus(),
  uploadStatus: (filename) => ICloudBridge.uploadStatus(filename),
  deleteFile: (filename) => classified(() => ICloudBridge.deleteFile(filename)),
  deleteAll: () => classified(() => ICloudBridge.deleteAll()),
  writeBinary: (filename, sourcePath) =>
    classified(() => ICloudBridge.writeBinary(filename, sourcePath)),
  readBinary: (filename, destinationPath) =>
    classified(() => ICloudBridge.readBinary(filename, destinationPath)),
  listBinaryFiles: () => classified(() => ICloudBridge.listBinaryFiles()),
  deleteBinaryFile: (filename) =>
    classified(() => ICloudBridge.deleteBinaryFile(filename)),
  deleteAllBinaries: () => classified(() => ICloudBridge.deleteAllBinaries()),
  addRemoteChangeListener: (listener) =>
    ICloudBridge.addRemoteChangeListener(listener),
  addAvailabilityChangeListener: (listener) =>
    ICloudBridge.addAvailabilityChangeListener(listener),
}
