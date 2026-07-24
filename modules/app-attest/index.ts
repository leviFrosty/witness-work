import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

interface AppAttestNative {
  isSupported(): boolean
  generateKey(): Promise<string>
  attestKey(keyId: string, clientDataHashBase64: string): Promise<string>
  generateAssertion(
    keyId: string,
    clientDataHashBase64: string
  ): Promise<string>
}

export type AppAttestErrorCode =
  | 'unsupported'
  | 'invalidInput'
  | 'invalidKey'
  | 'serverUnavailable'
  | 'systemFailure'
  | 'unknown'

export class AppAttestError extends Error {
  readonly code: AppAttestErrorCode

  constructor(code: AppAttestErrorCode) {
    super(`App Attest operation failed (${code})`)
    this.name = 'AppAttestError'
    this.code = code
  }
}

const native = requireOptionalNativeModule<AppAttestNative>('AppAttest')

const codeFromNativeError = (error: unknown): AppAttestErrorCode => {
  if (error instanceof AppAttestError) return error.code
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined
  switch (code) {
    case 'APP_ATTEST_UNSUPPORTED':
      return 'unsupported'
    case 'APP_ATTEST_INVALID_INPUT':
      return 'invalidInput'
    case 'APP_ATTEST_INVALID_KEY':
      return 'invalidKey'
    case 'APP_ATTEST_SERVER_UNAVAILABLE':
      return 'serverUnavailable'
    case 'APP_ATTEST_SYSTEM_FAILURE':
      return 'systemFailure'
    case 'APP_ATTEST_UNKNOWN':
    default:
      return 'unknown'
  }
}

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

/** Stable taxonomy for lifecycle decisions; never inspects localized messages. */
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
