import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

interface KeychainUuidNative {
  appAttestStorageVersion?: number

  getOrCreate(): string

  peek(): string | null

  readAppAttestKeyId?(): string | null
  writeAppAttestKeyId?(keyId: string): void

  readAppAttestRecoveryToken?(): string | null

  getOrCreateAppAttestRecoveryToken?(): string

  readAppAttestRecoveryEnrollmentKeyId?(): string | null
  writeAppAttestRecoveryEnrollmentKeyId?(marker: string): void

  getOrCreateAppAttestJournalKey?(): string
}

const native = requireOptionalNativeModule<KeychainUuidNative>('KeychainUuid')

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

export function getOrCreate(): string | null {
  if (Platform.OS !== 'ios' || !native) return null
  return native.getOrCreate()
}

export function peek(): string | null {
  if (Platform.OS !== 'ios' || !native) return null
  return native.peek()
}

export function readAppAttestKeyId(): string | null {
  if (!supportsAppAttestRecoveryStorage()) return null
  return native!.readAppAttestKeyId!()
}

export function writeAppAttestKeyId(keyId: string): void {
  if (!supportsAppAttestRecoveryStorage()) {
    throw new Error(
      'App Attest recovery storage requires a newer native binary'
    )
  }
  native!.writeAppAttestKeyId!(keyId)
}

export function readAppAttestRecoveryToken(): string | null {
  if (!supportsAppAttestRecoveryStorage()) return null
  return native!.readAppAttestRecoveryToken!()
}

export function getOrCreateAppAttestRecoveryToken(): string {
  if (!supportsAppAttestRecoveryStorage()) {
    throw new Error(
      'App Attest recovery storage requires a newer native binary'
    )
  }
  return native!.getOrCreateAppAttestRecoveryToken!()
}

export function readAppAttestRecoveryEnrollmentKeyId(): string | null {
  if (!supportsAppAttestRecoveryStorage()) return null
  return native!.readAppAttestRecoveryEnrollmentKeyId!()
}

export function writeAppAttestRecoveryEnrollmentKeyId(marker: string): void {
  if (!supportsAppAttestRecoveryStorage()) {
    throw new Error(
      'App Attest recovery storage requires a newer native binary'
    )
  }
  native!.writeAppAttestRecoveryEnrollmentKeyId!(marker)
}

export function getOrCreateAppAttestJournalKey(): string {
  if (!supportsAppAttestRecoveryStorage()) {
    throw new Error(
      'App Attest recovery storage requires a newer native binary'
    )
  }
  return native!.getOrCreateAppAttestJournalKey!()
}
