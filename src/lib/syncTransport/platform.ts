import { Platform } from 'react-native'
import { hasCapability } from '@/lib/platformCapabilities'

/**
 * Whether this platform has a cloud sync transport: iCloud on iOS, Google Drive
 * on Android. Free of the transports' imports, for code that only gates on the
 * platform.
 */
export function hasSyncTransport(): boolean {
  return hasCapability('iCloudSync') || hasCapability('googleDriveSync')
}

/**
 * Whether this platform syncs through Cloud Sync and nothing else: the web (ADR
 * 0037 §2). It has no iCloud or Drive, so Cloud Sync is always its option, its
 * data lives in the account's slots, and there's no Apple or Google Account to
 * check: signing in as another account wipes the browser first.
 */
export function cloudSyncOnly(): boolean {
  return Platform.OS === 'web'
}

/** Whether the sync engine runs here at all, on either kind of platform. */
export function hasSyncEngine(): boolean {
  return hasSyncTransport() || cloudSyncOnly()
}
