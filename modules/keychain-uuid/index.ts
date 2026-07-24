import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

interface KeychainUuidNative {
  /** Version 2 adds App Attest key, recovery, and enrollment storage. */
  appAttestStorageVersion?: number
  /** Returns the stored UUID, generating + persisting one on first call. */
  getOrCreate(): string
  /** Returns the stored UUID without creating one, or null if none exists. */
  peek(): string | null
  /** Null means only that the Keychain item was not found; errors throw. */
  readAppAttestKeyId?(): string | null
  writeAppAttestKeyId?(keyId: string): void
  /** Null means only that the Keychain item was not found; errors throw. */
  readAppAttestRecoveryToken?(): string | null
  /** Generates and stores an independent random 256-bit token when absent. */
  getOrCreateAppAttestRecoveryToken?(): string
  /** Opaque key-id + token-hash marker for acknowledged recovery enrollment. */
  readAppAttestRecoveryEnrollmentKeyId?(): string | null
  writeAppAttestRecoveryEnrollmentKeyId?(marker: string): void
  /** Device-only key for encrypting the transient lifecycle journal. */
  getOrCreateAppAttestJournalKey?(): string
}

const native = requireOptionalNativeModule<KeychainUuidNative>('KeychainUuid')

/**
 * Whether this binary contains the reinstall-recovery Keychain interface. OTA
 * updates can run against older binaries where the UUID-only module exists but
 * these methods do not; callers must keep those binaries on protocol v1.
 */
export function supportsAppAttestRecoveryStorage(): boolean {
  return (
    Platform.OS === 'ios' &&
    native !== null &&
    (native.appAttestStorageVersion ?? 0) >= 2 &&
    typeof native.readAppAttestKeyId === 'function' &&
    typeof native.writeAppAttestKeyId === 'function' &&
    typeof native.readAppAttestRecoveryToken === 'function' &&
    typeof native.getOrCreateAppAttestRecoveryToken === 'function' &&
    typeof native.readAppAttestRecoveryEnrollmentKeyId === 'function' &&
    typeof native.writeAppAttestRecoveryEnrollmentKeyId === 'function' &&
    typeof native.getOrCreateAppAttestJournalKey === 'function'
  )
}

/**
 * The stable per-install UUID from the iOS Keychain, created on first call.
 * Returns `null` off-iOS or when the native module isn't linked (the caller
 * falls back to non-Keychain storage). Native Keychain errors are not converted
 * to not-found; they throw.
 */
export function getOrCreate(): string | null {
  if (Platform.OS !== 'ios' || !native) return null
  return native.getOrCreate()
}

/** The stored UUID without creating one, or null when it was not found. */
export function peek(): string | null {
  if (Platform.OS !== 'ios' || !native) return null
  return native.peek()
}

/** Secure active App Attest key id, or null only when absent/unavailable. */
export function readAppAttestKeyId(): string | null {
  if (!supportsAppAttestRecoveryStorage()) return null
  return native!.readAppAttestKeyId!()
}

/** Stores the active App Attest key id in this-device-only Keychain storage. */
export function writeAppAttestKeyId(keyId: string): void {
  if (!supportsAppAttestRecoveryStorage()) {
    throw new Error(
      'App Attest recovery storage requires a newer native binary'
    )
  }
  native!.writeAppAttestKeyId!(keyId)
}

/** Secure recovery token, or null only when absent/unavailable. */
export function readAppAttestRecoveryToken(): string | null {
  if (!supportsAppAttestRecoveryStorage()) return null
  return native!.readAppAttestRecoveryToken!()
}

/** Returns a stable, independently generated random 256-bit recovery token. */
export function getOrCreateAppAttestRecoveryToken(): string {
  if (!supportsAppAttestRecoveryStorage()) {
    throw new Error(
      'App Attest recovery storage requires a newer native binary'
    )
  }
  return native!.getOrCreateAppAttestRecoveryToken!()
}

/** Opaque marker tying server recovery enrollment to a key and token hash. */
export function readAppAttestRecoveryEnrollmentKeyId(): string | null {
  if (!supportsAppAttestRecoveryStorage()) return null
  return native!.readAppAttestRecoveryEnrollmentKeyId!()
}

/** Records ww-api's acknowledged key-id + token-hash enrollment marker. */
export function writeAppAttestRecoveryEnrollmentKeyId(marker: string): void {
  if (!supportsAppAttestRecoveryStorage()) {
    throw new Error(
      'App Attest recovery storage requires a newer native binary'
    )
  }
  native!.writeAppAttestRecoveryEnrollmentKeyId!(marker)
}

/** Device-only encryption key for the transient App Attest lifecycle journal. */
export function getOrCreateAppAttestJournalKey(): string {
  if (!supportsAppAttestRecoveryStorage()) {
    throw new Error(
      'App Attest recovery storage requires a newer native binary'
    )
  }
  return native!.getOrCreateAppAttestJournalKey!()
}
