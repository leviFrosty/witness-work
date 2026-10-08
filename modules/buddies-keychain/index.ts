import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

/** Where the seed is backed up on Android; see `rootSeedBackup`. */
export type RootSeedBackup =
  | 'cloud'
  | 'device'
  | 'restored'
  | 'pending'
  | 'unavailable'

interface BuddiesKeychainNative {
  buddiesKeychainVersion?: number
  /**
   * Null means only that there is no seed (on Android, none in Block Store
   * either); errors throw.
   */
  peekRootSeed(): string | null
  /** Returns the seed, creating one (32 random bytes, base64url) if absent. */
  getOrCreateRootSeed(): string
  /**
   * Deletes the seed on this device and its copies: through iCloud Keychain on
   * iOS, from Block Store (and its backup) on Android.
   */
  deleteRootSeed(): void
  /** Android only. */
  rootSeedBackup?(): RootSeedBackup
}

const native =
  requireOptionalNativeModule<BuddiesKeychainNative>('BuddiesKeychain')

/**
 * Whether this binary contains the Buddies Keychain module. OTA updates can run
 * against older binaries without it; Buddies stays hidden there.
 */
export function isAvailable(): boolean {
  return (
    (Platform.OS === 'ios' || Platform.OS === 'android') &&
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

/**
 * Android: whether the seed is backed up through Block Store, and how. Null on
 * iOS, where iCloud Keychain handles it.
 */
export function rootSeedBackup(): RootSeedBackup | null {
  if (!isAvailable() || !native!.rootSeedBackup) return null
  return native!.rootSeedBackup()
}
