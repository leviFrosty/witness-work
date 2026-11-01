import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes, toB64u, utf8 } from '@/lib/bytes'
import { curve25519 } from '@/lib/curve25519'

const SIGNING_CONTEXT = 'ww-account/v1\n'

export type AccountSigningKey = {
  seed: Uint8Array

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
