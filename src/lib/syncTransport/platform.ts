import { hasCapability } from '@/lib/platformCapabilities'

/**
 * Whether this platform has a cloud sync transport: iCloud on iOS, Google Drive
 * on Android. Free of the transports' imports, for code that only gates on the
 * platform.
 */
export function hasSyncTransport(): boolean {
  return hasCapability('iCloudSync') || hasCapability('googleDriveSync')
}
