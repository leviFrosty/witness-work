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
  /**
   * The same three off the JS thread. Absent from binaries built before them;
   * the wrappers below fall back to the blocking versions there.
   */
  peekRootSeedAsync?(): Promise<string | null>
  getOrCreateRootSeedAsync?(): Promise<string>
  deleteRootSeedAsync?(): Promise<void>
  /** Android only. */
  rootSeedBackup?(): RootSeedBackup
  /**
   * Version 2, on iOS: stores the named-alert snapshot (JSON) where the
   * Notification Service Extension reads it; null deletes it.
   */
  setAlertContext?(json: string | null): void
  /**
   * Version 2, on iOS: how the extension's Buddies alerts turned out since the
   * last call (counts by outcome), then forgets them.
   */
  takeAlertOutcomes?(): Record<string, number>
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

/**
 * The seed, or null when there is none. Off the JS thread: on Android a first
 * read can wait on Block Store for up to 10 seconds.
 */
export async function peekRootSeed(): Promise<string | null> {
  if (!isAvailable()) return null
  return native!.peekRootSeedAsync
    ? native!.peekRootSeedAsync()
    : native!.peekRootSeed()
}

/** The seed, created (32 random bytes, base64url) if absent. Off the JS thread. */
export async function getOrCreateRootSeed(): Promise<string> {
  if (!isAvailable()) {
    throw new Error('Buddies Keychain requires a newer native binary')
  }
  return native!.getOrCreateRootSeedAsync
    ? native!.getOrCreateRootSeedAsync()
    : native!.getOrCreateRootSeed()
}

export async function deleteRootSeed(): Promise<void> {
  if (!isAvailable()) return
  if (native!.deleteRootSeedAsync) await native!.deleteRootSeedAsync()
  else native!.deleteRootSeed()
}

/**
 * Android: whether the seed is backed up through Block Store, and how. Null on
 * iOS, where iCloud Keychain handles it.
 */
export function rootSeedBackup(): RootSeedBackup | null {
  if (!isAvailable() || !native!.rootSeedBackup) return null
  return native!.rootSeedBackup()
}

/**
 * Whether this binary can hand Buddies alert keys to its Notification Service
 * Extension (iOS builds with version 2 of the module).
 */
export function isAlertContextAvailable(): boolean {
  return (
    isAvailable() &&
    Platform.OS === 'ios' &&
    (native!.buddiesKeychainVersion ?? 0) >= 2 &&
    native!.setAlertContext !== undefined
  )
}

/**
 * On iOS, the snapshot the Notification Service Extension words Buddies alerts
 * from (see `src/app/buddies/buddiesAlertContext.ts`); null deletes it. It's
 * kept in a Keychain item shared only with the extension, readable after the
 * first unlock and never synced or backed up.
 */
export function setAlertContext(json: string | null): void {
  if (!isAlertContextAvailable()) return
  native!.setAlertContext!(json)
}

/** On iOS, the extension's alert outcomes since the last call, cleared. */
export function takeAlertOutcomes(): Record<string, number> {
  if (!isAlertContextAvailable() || !native!.takeAlertOutcomes) return {}
  return native!.takeAlertOutcomes()
}
