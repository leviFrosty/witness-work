import { fromB64u, utf8 } from '@/lib/bytes'
import type {
  AuthenticationResponseJSON,
  CreatedPasskey,
  PasskeyAssertion,
  RegistrationResponseJSON,
} from '@/lib/passkeys/types'

/**
 * `UTF-8("ww-account/v1/passkey-prf")`, the one salt every create and get
 * evaluates as `prf.eval.first` (docs/passkeys-protocol.md).
 */
export const PRF_SALT = utf8('ww-account/v1/passkey-prf')

/** WebAuthn PRF output is an HMAC-SHA-256: anything else isn't one. */
const PRF_OUTPUT_BYTES = 32

/**
 * `options` with `extensions.prf.eval.first` set to the salt, in the form the
 * platform takes (base64url for the native module, an `ArrayBuffer` for the
 * browser). Other extensions are kept; any other PRF input is replaced.
 */
export function withPrfSalt<T extends { extensions?: object }>(
  options: T,
  first: string | ArrayBuffer
): T {
  return {
    ...options,
    extensions: { ...options.extensions, prf: { eval: { first } } },
  } as T
}

/**
 * The response without `clientExtensionResults.prf`, which the server must
 * never see, and the PRF output it carried.
 */
export function splitPrf<
  R extends { clientExtensionResults?: Record<string, unknown> | object },
>(raw: R): { response: R; prf: unknown } {
  const { prf, ...rest } = (raw.clientExtensionResults ?? {}) as Record<
    string,
    unknown
  >
  return { response: { ...raw, clientExtensionResults: rest }, prf }
}

/** `prf.enabled`, when the platform reported it. */
export function prfEnabled(prf: unknown): boolean | null {
  if (typeof prf !== 'object' || prf === null) return null
  const { enabled } = prf as { enabled?: unknown }
  return typeof enabled === 'boolean' ? enabled : null
}

/**
 * `prf.results.first` as bytes: base64url from the native module, an
 * `ArrayBuffer` (or a view) from the browser. Null unless it's 32 bytes.
 */
export function prfFirst(prf: unknown): Uint8Array | null {
  if (typeof prf !== 'object' || prf === null) return null
  const { results } = prf as { results?: unknown }
  if (typeof results !== 'object' || results === null) return null
  const { first } = results as { first?: unknown }
  let bytes: Uint8Array | null = null
  if (typeof first === 'string') {
    try {
      bytes = fromB64u(first)
    } catch {
      return null
    }
  } else if (first instanceof ArrayBuffer) {
    bytes = new Uint8Array(first.slice(0))
  } else if (ArrayBuffer.isView(first)) {
    bytes = new Uint8Array(
      first.buffer.slice(first.byteOffset, first.byteOffset + first.byteLength)
    )
  }
  return bytes?.length === PRF_OUTPUT_BYTES ? bytes : null
}

/** A registration for the server, without PRF, and the PRF facts apart. */
export function toCreatedPasskey(
  raw: RegistrationResponseJSON
): CreatedPasskey {
  const { response, prf } = splitPrf(raw)
  return { response, prf: { enabled: prfEnabled(prf), first: prfFirst(prf) } }
}

/** A sign-in for the server, without PRF, and the PRF output apart. */
export function toPasskeyAssertion(
  raw: AuthenticationResponseJSON
): PasskeyAssertion {
  const { response, prf } = splitPrf(raw)
  return { response, prf: prfFirst(prf) }
}
