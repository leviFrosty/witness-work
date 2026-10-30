import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes, toB64u, utf8 } from '@/lib/bytes'
import { curve25519 } from '@/lib/curve25519'

/**
 * Keys of the server account (ADR 0024, docs/accounts-protocol.md). The account
 * key is the User's one secret: today the Buddies root seed. Every other key
 * derives from it with its own HKDF label, so the server can't tell that the
 * account's public key and a feature's keys belong together.
 */

const SIGNING_CONTEXT = 'ww-account/v1\n'

export type AccountSigningKey = {
  /** Ed25519 seed. Never leaves the device. */
  seed: Uint8Array
  /** B64u public key: the server's `account_pub`. */
  publicKey: string
}

export function deriveAccountSigningKey(
  accountKey: Uint8Array
): AccountSigningKey {
  if (accountKey.length !== 32) throw new Error('Account key must be 32 bytes')
  const seed = hkdf(
    sha256,
    accountKey,
    new Uint8Array(0),
    utf8('ww-account/v1/sign'),
    32
  )
  return { seed, publicKey: toB64u(curve25519().ed25519.getPublicKey(seed)) }
}

/** The account key's `accountPub`. */
export const accountPubOf = (accountKey: Uint8Array): string =>
  deriveAccountSigningKey(accountKey).publicKey

/** The signature over an account op's payload bytes, b64u. */
export function signAccountRequest(
  op: string,
  payload: Uint8Array,
  key: AccountSigningKey
): string {
  return toB64u(
    curve25519().ed25519.sign(
      concatBytes(utf8(`${SIGNING_CONTEXT}${op}\n`), payload),
      key.seed
    )
  )
}

/**
 * The account's claim on a Buddies inbox, b64u. `inbox/register` carries it in
 * a payload the inbox's owner key signs, so linking takes both keys.
 */
export function signInboxLink(
  key: AccountSigningKey,
  accountId: string,
  inboxId: string,
  ownerPub: string
): string {
  return toB64u(
    curve25519().ed25519.sign(
      utf8(
        `${SIGNING_CONTEXT}inbox/link\n${accountId}\n${inboxId}\n${ownerPub}`
      ),
      key.seed
    )
  )
}
