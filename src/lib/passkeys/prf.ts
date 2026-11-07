import { fromB64u, utf8 } from '@/lib/bytes'
import type {
  AuthenticationResponseJSON,
  CreatedPasskey,
  PasskeyAssertion,
  RegistrationResponseJSON,
} from '@/lib/passkeys/types'

export const PRF_SALT = utf8('ww-account/v1/passkey-prf')

const PRF_OUTPUT_BYTES = 32

export function withPrfSalt<T extends { extensions?: object }>(
  options: T,
  first: string | ArrayBuffer
): T {
  return {
    ...options,
    extensions: { ...options.extensions, prf: { eval: { first } } },
  } as T
}

export function splitPrf<
  R extends { clientExtensionResults?: Record<string, unknown> | object },
>(raw: R): { response: R; prf: unknown } {
  const { prf, ...rest } = (raw.clientExtensionResults ?? {}) as Record<
    string,
    unknown
  >
  return { response: { ...raw, clientExtensionResults: rest }, prf }
}

export function prfEnabled(prf: unknown): boolean | null {
  if (typeof prf !== 'object' || prf === null) return null
  const { enabled } = prf as { enabled?: unknown }
  return typeof enabled === 'boolean' ? enabled : null
}

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

export function toCreatedPasskey(
  raw: RegistrationResponseJSON
): CreatedPasskey {
  const { response, prf } = splitPrf(raw)
  return { response, prf: { enabled: prfEnabled(prf), first: prfFirst(prf) } }
}

export function toPasskeyAssertion(
  raw: AuthenticationResponseJSON
): PasskeyAssertion {
  const { response, prf } = splitPrf(raw)
  return { response, prf: prfFirst(prf) }
}
