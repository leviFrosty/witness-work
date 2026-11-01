import type { SyncTransport } from '@/lib/syncTransport/types'

let androidTransport: SyncTransport | null = null

export function registerAndroidSyncTransport(transport: SyncTransport): void {
  androidTransport = transport
}

export const registeredAndroidTransport = (): SyncTransport | null =>
  androidTransport

let cloudSyncCopy = {
  offered: () => false,
  used: () => false,
}

export function registerCloudSyncCopy(answers: typeof cloudSyncCopy): void {
  cloudSyncCopy = answers
}

export const cloudSyncOfferedForCopy = (): boolean => cloudSyncCopy.offered()

export const usesCloudSyncForCopy = (): boolean => cloudSyncCopy.used()

export const usesGoogleDriveSync = (): boolean =>
  androidTransport?.kind === 'google-drive'
