import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes, fromB64u, toB64u, utf8 } from '@/lib/bytes'
import { PRF_SALT } from '@/lib/passkeys/prf'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

/**
 * Passkeys of the server account (ADR 0038, docs/passkeys-protocol.md): the PRF
 * salt every ceremony evaluates, the tag that names an account's passkeys, and
 * the wraps that seal the account key under a passkey's PRF output. Pure:
 * callers supply randomness. The server never sees a PRF output or the account
 * key; a wrap is ciphertext only the passkey can open.
 */

/** `UTF-8("ww-account/v1/passkey-prf")`, evaluated as `prf.eval.first`. */
export const PASSKEY_PRF_SALT = PRF_SALT
/** The salt as Android Credential Manager's request JSON carries it. */
export const PASSKEY_PRF_SALT_B64U = toB64u(PASSKEY_PRF_SALT)

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TAG_LABEL = 'ww-account/v1/passkey-tag\n'
const WRAP_LABEL = 'ww-account/v1/passkey-wrap\n'
const WRAP_VERSION = 1
const NONCE_BYTES = 24
const KEY_BYTES = 32
const TAG_BYTES = 16
/** `0x01 ‖ nonce[24] ‖ ciphertext[32] ‖ tag[16]`, 73 bytes: 98 characters. */
export const PASSKEY_WRAP_CHARS = 98
/** How many wraps one credential keeps on the server. */
export const PASSKEY_WRAPS_MAX = 4

/**
 * The four characters that tell an account's passkeys apart in a password
 * manager: the first 20 bits of `SHA-256("…/passkey-tag\n" ‖ handle)` in
 * Crockford base32. `userHandle` is b64u, as the server sends it.
 */
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

/** `WitnessWork <tag>`: ASCII, never localized. */
export const passkeyName = (userHandle: string) =>
  `WitnessWork ${passkeyTag(userHandle)}`

/** What a wrap is bound to: the account, the credential, and the key epoch. */
export type PasskeyWrapAddress = {
  accountId: string
  /** B64u, as on the wire. */
  credentialId: string
  keyEpoch: number
}

/** `HKDF-SHA256(prfOutput, "", "…/passkey-wrap\n" + credentialId, 32)`. */
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

/**
 * `b64u(0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(wrapKey, nonce, accountKey,
 * aad))`. Callers supply the nonce, so vectors stay fixed.
 */
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

/**
 * The account key a wrap holds. Throws when it's malformed, from another
 * account, credential or epoch, or under another PRF output. Check what it
 * opens to with `openPasskeyWraps` before trusting it.
 */
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

/** A new wrap's id: 16 random bytes, b64u, made once per wrap. */
export const newPasskeyWrapId = (randomBytes: (length: number) => Uint8Array) =>
  toB64u(randomBytes(16))

export type PasskeyWrap = { wrapId: string; wrap: string; keyEpoch: number }

/** Why a passkey signed in but can't unlock. */
export type PasskeyUnlockProblem =
  /** The credential has no wraps: a sign-in-only passkey. */
  | 'noWraps'
  /** This platform gave no PRF output. */
  | 'noPrf'
  /** None opened: another device's PRF output, or damaged. */
  | 'noneOpened'
  /** One opened, but not to the account's key. Never trusted. */
  | 'wrongKey'

export type PasskeyUnlock =
  | { ok: true; accountKey: Uint8Array; wrapId: string; keyEpoch: number }
  | { ok: false; reason: PasskeyUnlockProblem }

/**
 * Tries every wrap of the credential for the account's `keyEpoch` and keeps the
 * first whose key derives the `accountPub` the server sent. A wrap for another
 * epoch is skipped: it holds a replaced key. Anything else is "can't unlock",
 * never the account: a device saves its own wrap only then.
 */
export function openPasskeyWraps(input: {
  prfOutput: Uint8Array | null
  accountId: string
  accountPub: string
  credentialId: string
  /** The account's key epoch, from the same answer as `wraps`. */
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

/**
 * `clientExtensionResults.prf.results.first`, 32 bytes: b64u from the native
 * modules, an `ArrayBuffer` from a browser. Null when there's none.
 */
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

/**
 * The response without `clientExtensionResults.prf`, as every request posts it:
 * the server never sees a PRF output.
 */
export function withoutPrfResults<T extends WithExtensions>(response: T): T {
  const results = response.clientExtensionResults
  if (typeof results !== 'object' || results === null || !('prf' in results))
    return response
  const { prf: _, ...rest } = results as Record<string, unknown>
  return { ...response, clientExtensionResults: rest }
}
