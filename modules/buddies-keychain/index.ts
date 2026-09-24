import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

interface BuddiesKeychainNative {
  buddiesKeychainVersion?: number
  /** Null means only that the Keychain item was not found; errors throw. */
  peekRootSeed(): string | null
  /**
   * Returns the synced seed, creating one (32 random bytes, base64url) if
   * absent.
   */
  getOrCreateRootSeed(): string
  /** Deletes the seed on this device and, through iCloud Keychain, everywhere. */
  deleteRootSeed(): void
}

const native =
  requireOptionalNativeModule<BuddiesKeychainNative>('BuddiesKeychain')

/**
 * Whether this binary contains the Buddies Keychain module. OTA updates can run
 * against older binaries without it; Buddies stays hidden there.
 */
export function isAvailable(): boolean {
  return (
    Platform.OS === 'ios' &&
    native !== null &&
    (native.buddiesKeychainVersion ?? 0) >= 1
  )
}

export function peekRootSeed(): string | null {
  if (!isAvailable()) return null
  return native!.peekRootSeed()
}

export function getOrCreateRootSeed(): string {
  if (!isAvailable()) {
    throw new Error('Buddies Keychain requires a newer native binary')
  }
  return native!.getOrCreateRootSeed()
}

export function deleteRootSeed(): void {
  if (!isAvailable()) return
  native!.deleteRootSeed()
}
