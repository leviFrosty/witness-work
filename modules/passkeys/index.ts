import { Platform, requireOptionalNativeModule } from 'expo-modules-core'
import {
  NativePasskeyError,
  fromNativeError,
  type PasskeyErrorCode,
} from './errorCodes'
import { normalizeResponseJson } from './normalize'

export type PasskeySupport = {
  passkeys: boolean
  /** `unknown` where only a ceremony can tell (Android). */
  prf: 'yes' | 'no' | 'unknown'
}

interface PasskeysNative {
  passkeysVersion?: number
  getSupport(): Promise<PasskeySupport>
  create(optionsJson: string): Promise<string>
  get(optionsJson: string): Promise<string>
}

const native = requireOptionalNativeModule<PasskeysNative>('Passkeys')

export { NativePasskeyError, type PasskeyErrorCode }

/**
 * Whether this binary has the module. OTA updates can run against older
 * binaries without it.
 */
export function isAvailable(): boolean {
  return (
    (Platform.OS === 'ios' || Platform.OS === 'android') &&
    native !== null &&
    (native.passkeysVersion ?? 0) >= 1
  )
}

/**
 * Passkeys from iOS 16, PRF from iOS 18. On Android, passkeys from API 28 with
 * a Credential Manager provider; PRF is `unknown` until a ceremony runs.
 */
export async function getSupport(): Promise<PasskeySupport> {
  if (!isAvailable()) return { passkeys: false, prf: 'no' }
  return native!.getSupport()
}

const invoke = async (operation: () => Promise<string>): Promise<string> => {
  if (!isAvailable()) throw new NativePasskeyError('not_supported')
  try {
    return normalizeResponseJson(await operation())
  } catch (error) {
    throw fromNativeError(error)
  }
}

/**
 * Creates a passkey. Takes `PublicKeyCredentialCreationOptionsJSON` and returns
 * `RegistrationResponseJSON`, base64url throughout, with
 * `clientExtensionResults.prf` as `{ enabled?, results?: { first } }`. Rejects
 * with a `NativePasskeyError`.
 */
export function create(optionsJson: string): Promise<string> {
  return invoke(() => native!.create(optionsJson))
}

/**
 * Signs in with a passkey. Takes `PublicKeyCredentialRequestOptionsJSON` and
 * returns `AuthenticationResponseJSON`, with PRF as `create` returns it.
 */
export function get(optionsJson: string): Promise<string> {
  return invoke(() => native!.get(optionsJson))
}
