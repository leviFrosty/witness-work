import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

interface KeychainUuidNative {
  /** Returns the stored UUID, generating + persisting one on first call. */
  getOrCreate(): string
  /** Returns the stored UUID without creating one, or null if none exists. */
  peek(): string | null
}

const native = requireOptionalNativeModule<KeychainUuidNative>('KeychainUuid')

/**
 * The stable per-install UUID from the iOS Keychain, created on first call.
 * Returns `null` off-iOS or when the native module isn't linked (the caller
 * falls back to non-Keychain storage).
 */
export function getOrCreate(): string | null {
  if (Platform.OS !== 'ios' || !native) return null
  return native.getOrCreate()
}

/** The stored UUID without creating one, or null. */
export function peek(): string | null {
  if (Platform.OS !== 'ios' || !native) return null
  return native.peek()
}
