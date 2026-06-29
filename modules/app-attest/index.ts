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

const native = requireOptionalNativeModule<AppAttestNative>('AppAttest')

/** Whether this device + build support App Attest (real iOS 14+ device only). */
export function isSupported(): boolean {
  if (Platform.OS !== 'ios' || !native) return false
  return native.isSupported()
}

const required = (): AppAttestNative => {
  if (Platform.OS !== 'ios' || !native) {
    throw new Error('App Attest is unavailable on this device/build')
  }
  return native
}

/** Generates a new Secure-Enclave key, returning its base64 key identifier. */
export function generateKey(): Promise<string> {
  return required().generateKey()
}

/**
 * Produces the attestation for `keyId`. `clientDataHashBase64` must be
 * `base64(SHA256(challenge))` — the proxy recomputes the same hash to verify.
 * Returns base64 of the CBOR attestation object.
 */
export function attestKey(
  keyId: string,
  clientDataHashBase64: string
): Promise<string> {
  return required().attestKey(keyId, clientDataHashBase64)
}

/**
 * Signs a per-request assertion with `keyId`. `clientDataHashBase64` must be
 * `base64(SHA256(clientData))` where clientData is the canonical
 * `<challenge>|<uuid>|<contentHash>`. Returns base64 of the CBOR assertion.
 */
export function generateAssertion(
  keyId: string,
  clientDataHashBase64: string
): Promise<string> {
  return required().generateAssertion(keyId, clientDataHashBase64)
}
