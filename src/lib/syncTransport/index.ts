import { Platform } from 'react-native'
import { iCloudTransport } from '@/lib/syncTransport/iCloudTransport'
import { registeredAndroidTransport } from '@/lib/syncTransport/registry'
import type { SyncTransport } from '@/lib/syncTransport/types'

export * from '@/lib/syncTransport/types'
export { hasSyncTransport } from '@/lib/syncTransport/platform'
export {
  registerAndroidSyncTransport,
  usesGoogleDriveSync,
} from '@/lib/syncTransport/registry'

const noSubscription = { remove: () => {} }

const unavailableTransport: SyncTransport = {
  kind: 'icloud',
  writeConfirmsUpload: false,
  isAvailable: () => false,
  identityToken: () => null,
  identityTokenMatches: () => null,
  waitForInitialScan: async () => true,
  readFiles: async () => ({ files: [], pending: [] }),
  write: async () => {
    throw new Error('Cloud sync is not available on this platform')
  },
  supportsUploadStatus: () => false,
  uploadStatus: async () => null,
  deleteFile: async () => {},
  deleteAll: async () => {},
  writeBinary: async () => {
    throw new Error('Cloud sync is not available on this platform')
  },
  readBinary: async () => {
    throw new Error('Cloud sync is not available on this platform')
  },
  listBinaryFiles: async () => [],
  deleteBinaryFile: async () => {},
  deleteAllBinaries: async () => {},
  addRemoteChangeListener: () => noSubscription,
  addAvailabilityChangeListener: () => noSubscription,
}

export function syncTransport(): SyncTransport {
  if (Platform.OS === 'ios') return iCloudTransport
  if (Platform.OS === 'android')
    return registeredAndroidTransport() ?? unavailableTransport
  return unavailableTransport
}
