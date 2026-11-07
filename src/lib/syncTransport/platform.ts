import { Platform } from 'react-native'
import { hasCapability } from '@/lib/platformCapabilities'

export function hasSyncTransport(): boolean {
  return hasCapability('iCloudSync') || hasCapability('googleDriveSync')
}

export function cloudSyncOnly(): boolean {
  return Platform.OS === 'web'
}

export function hasSyncEngine(): boolean {
  return hasSyncTransport() || cloudSyncOnly()
}
