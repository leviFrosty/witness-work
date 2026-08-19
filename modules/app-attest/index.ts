import { Platform, requireOptionalNativeModule } from 'expo-modules-core'
import {
  AppAttestError,
  codeFromNativeError,
  type AppAttestErrorCode,
} from './errorCodes'

interface AppAttestNative {
  isSupported(): boolean
  generateKey(): Promise<string>
  attestKey(keyId: string, clientDataHashBase64: string): Promise<string>
  generateAssertion(
    keyId: string,
    clientDataHashBase64: string
  ): Promise<string>
}

const native = requireOptionalNativeModule<AppAttestNative>('AppAttest')

export { AppAttestError, type AppAttestErrorCode }

/** Whether this device + build support App Attest (real iOS 14+ device only). */
export function isSupported(): boolean {
  if (Platform.OS !== 'ios' || !native) return false
  return native.isSupported()
}

const required = (): AppAttestNative => {
  if (Platform.OS !== 'ios' || !native) {
    throw new AppAttestError('unsupported')
  }
  return native
}

const invoke = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof AppAttestError) throw error
    throw new AppAttestError(codeFromNativeError(error))
  }
}

/**
 * Stable taxonomy for lifecycle decisions; see `./errorCodes` for how a native
 * rejection is classified. Never inspects localized text.
 */
export function classifyError(error: unknown): AppAttestErrorCode | null {
  return error instanceof AppAttestError ? error.code : null
}

/** Generates a new Secure-Enclave key, returning its base64 key identifier. */
export function generateKey(): Promise<string> {
  return invoke(() => required().generateKey())
}

/**
 * Produces the attestation for `keyId`. `clientDataHashBase64` must decode to
 * exactly 32 bytes. Returns base64 of the CBOR attestation object.
 */
export function attestKey(
  keyId: string,
  clientDataHashBase64: string
): Promise<string> {
  return invoke(() => required().attestKey(keyId, clientDataHashBase64))
}

/**
 * Signs a per-request assertion with `keyId`. `clientDataHashBase64` must
 * decode to exactly 32 bytes. Returns base64 of the CBOR assertion.
 */
export function generateAssertion(
  keyId: string,
  clientDataHashBase64: string
): Promise<string> {
  return invoke(() => required().generateAssertion(keyId, clientDataHashBase64))
}
