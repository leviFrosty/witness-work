import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes, fromB64u, toB64u, utf8 } from '@/lib/bytes'
import { PRF_SALT } from '@/lib/passkeys/prf'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

export const PASSKEY_PRF_SALT = PRF_SALT

export const PASSKEY_PRF_SALT_B64U = toB64u(PASSKEY_PRF_SALT)

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TAG_LABEL = 'ww-account/v1/passkey-tag\n'
const WRAP_LABEL = 'ww-account/v1/passkey-wrap\n'
const WRAP_VERSION = 1
const NONCE_BYTES = 24
const KEY_BYTES = 32
const TAG_BYTES = 16

export const PASSKEY_WRAP_CHARS = 98

export const PASSKEY_WRAPS_MAX = 4

export function passkeyTag(userHandle: string): string {
  const handle = fromB64u(userHandle)
  if (handle.length === 0) throw new Error('Empty user handle')
  const digest = sha256(concatBytes(utf8(TAG_LABEL), handle))
  const bits = (digest[0] << 12) | (digest[1] << 4) | (digest[2] >> 4)
  let tag = ''
  for (let shift = 15; shift >= 0; shift -= 5)
    tag += CROCKFORD[(bits >> shift) & 31]
  return tag
}

export const passkeyName = (userHandle: string) =>
  `WitnessWork ${passkeyTag(userHandle)}`

export type PasskeyWrapAddress = {
  accountId: string

  credentialId: string
  keyEpoch: number
}

export function derivePasskeyWrapKey(
  prfOutput: Uint8Array,
  credentialId: string
): Uint8Array {
  if (prfOutput.length !== KEY_BYTES)
    throw new Error('PRF output must be 32 bytes')
  return hkdf(
    sha256,
    prfOutput,
    new Uint8Array(0),
    utf8(`${WRAP_LABEL}${credentialId}`),
    KEY_BYTES
  )
}

function wrapAad({ accountId, credentialId, keyEpoch }: PasskeyWrapAddress) {
  if (!Number.isSafeInteger(keyEpoch) || keyEpoch < 0)
    throw new Error('Malformed key epoch')
  return utf8(`${WRAP_LABEL}${accountId}\n${credentialId}\n${keyEpoch}`)
}

export function wrapAccountKey(
  input: PasskeyWrapAddress & { prfOutput: Uint8Array; accountKey: Uint8Array },
  nonce: Uint8Array
): string {
  if (input.accountKey.length !== KEY_BYTES)
    throw new Error('Account key must be 32 bytes')
  if (nonce.length !== NONCE_BYTES) throw new Error('Nonce must be 24 bytes')
  const aad = wrapAad(input)
  const key = derivePasskeyWrapKey(input.prfOutput, input.credentialId)
  return toB64u(
    concatBytes(
      new Uint8Array([WRAP_VERSION]),
      nonce,
      xchacha20poly1305(key, nonce, aad).encrypt(input.accountKey)
    )
  )
}

export function unwrapAccountKey(
  input: PasskeyWrapAddress & { prfOutput: Uint8Array; wrap: string }
): Uint8Array {
  const raw = fromB64u(input.wrap)
  if (
    raw.length !== 1 + NONCE_BYTES + KEY_BYTES + TAG_BYTES ||
    raw[0] !== WRAP_VERSION
  )
    throw new Error('Unsupported passkey wrap')
  const key = derivePasskeyWrapKey(input.prfOutput, input.credentialId)
  return xchacha20poly1305(
    key,
    raw.subarray(1, 1 + NONCE_BYTES),
    wrapAad(input)
  ).decrypt(raw.subarray(1 + NONCE_BYTES))
}

export const newPasskeyWrapId = (randomBytes: (length: number) => Uint8Array) =>
  toB64u(randomBytes(16))

export type PasskeyWrap = { wrapId: string; wrap: string; keyEpoch: number }

export type PasskeyUnlockProblem =
  | 'noWraps'
  | 'noPrf'
  | 'noneOpened'
  | 'wrongKey'

export type PasskeyUnlock =
  | { ok: true; accountKey: Uint8Array; wrapId: string; keyEpoch: number }
  | { ok: false; reason: PasskeyUnlockProblem }

export function openPasskeyWraps(input: {
  prfOutput: Uint8Array | null
  accountId: string
  accountPub: string
  credentialId: string

  keyEpoch: number
  wraps: readonly PasskeyWrap[]
}): PasskeyUnlock {
  const wraps = input.wraps.filter((wrap) => wrap.keyEpoch === input.keyEpoch)
  if (wraps.length === 0) return { ok: false, reason: 'noWraps' }
  if (!input.prfOutput || input.prfOutput.length !== KEY_BYTES)
    return { ok: false, reason: 'noPrf' }
  let openedOther = false
  for (const { wrapId, wrap, keyEpoch } of wraps) {
    let accountKey: Uint8Array
    try {
      accountKey = unwrapAccountKey({
        prfOutput: input.prfOutput,
        accountId: input.accountId,
        credentialId: input.credentialId,
        keyEpoch,
        wrap,
      })
    } catch {
      continue
    }
    if (deriveAccountSigningKey(accountKey).publicKey === input.accountPub)
      return { ok: true, accountKey, wrapId, keyEpoch }
    openedOther = true
  }
  return { ok: false, reason: openedOther ? 'wrongKey' : 'noneOpened' }
}

type WithExtensions = { clientExtensionResults?: unknown }

export function prfOutputOf(response: WithExtensions): Uint8Array | null {
  const prf = (response.clientExtensionResults as { prf?: unknown } | undefined)
    ?.prf as { results?: { first?: unknown } } | undefined
  const first = prf?.results?.first
  let output: Uint8Array | null = null
  try {
    if (typeof first === 'string') output = fromB64u(first)
    else if (first instanceof Uint8Array) output = first
    else if (first instanceof ArrayBuffer) output = new Uint8Array(first)
  } catch {
    return null
  }
  return output?.length === KEY_BYTES ? output : null
}

export function withoutPrfResults<T extends WithExtensions>(response: T): T {
  const results = response.clientExtensionResults
  if (typeof results !== 'object' || results === null || !('prf' in results))
    return response
  const { prf: _, ...rest } = results as Record<string, unknown>
  return { ...response, clientExtensionResults: rest }
}
