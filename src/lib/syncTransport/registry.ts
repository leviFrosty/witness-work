import type { SyncTransport } from '@/lib/syncTransport/types'

/**
 * Android's transport (`googleDriveTransport`), registered by `initializeApp`
 * before anything syncs. Kept out of `@/lib/syncTransport`'s imports: the Drive
 * client reads the stores, and shared code and its tests import the transport
 * module without loading them.
 */
let androidTransport: SyncTransport | null = null

export function registerAndroidSyncTransport(transport: SyncTransport): void {
  androidTransport = transport
}

export const registeredAndroidTransport = (): SyncTransport | null =>
  androidTransport

/**
 * Whether this device syncs through Google Drive, so sync copy should name
 * Google Drive rather than iCloud. Doesn't read the platform: only Android
 * registers the Drive transport.
 */
export const usesGoogleDriveSync = (): boolean =>
  androidTransport?.kind === 'google-drive'
