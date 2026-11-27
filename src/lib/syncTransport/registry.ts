import type { SyncTransport } from '@/lib/syncTransport/types'

let androidTransport: SyncTransport | null = null

export function registerAndroidSyncTransport(transport: SyncTransport): void {
  androidTransport = transport
}

export const registeredAndroidTransport = (): SyncTransport | null =>
  androidTransport

let sealer: ((transport: SyncTransport) => SyncTransport) | null = null
const sealed = new WeakMap<SyncTransport, SyncTransport>()

export function registerPlatformSealer(
  wrap: ((transport: SyncTransport) => SyncTransport) | null
): void {
  sealer = wrap
}

export function sealedPlatformTransport(
  transport: SyncTransport
): SyncTransport {
  if (!sealer) return transport
  let wrapped = sealed.get(transport)
  if (!wrapped) {
    wrapped = sealer(transport)
    sealed.set(transport, wrapped)
  }
  return wrapped
}

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
