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
 * Cloud Sync's answers for copy (ADR 0030), set when its transport registers
 * (`@/lib/syncTransport/provider`), so copy can name it without loading the
 * stores.
 */
let cloudSyncCopy = {
  offered: () => false,
  used: () => false,
}

export function registerCloudSyncCopy(answers: typeof cloudSyncCopy): void {
  cloudSyncCopy = answers
}

/** Whether Cloud Sync is offered to this device. */
export const cloudSyncOfferedForCopy = (): boolean => cloudSyncCopy.offered()

/** Whether this device syncs through Cloud Sync. */
export const usesCloudSyncForCopy = (): boolean => cloudSyncCopy.used()

/**
 * Whether this device syncs through Google Drive, so sync copy should name
 * Google Drive rather than iCloud. Doesn't read the platform: only Android
 * registers the Drive transport.
 */
export const usesGoogleDriveSync = (): boolean =>
  androidTransport?.kind === 'google-drive'
