import { chacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hkdf as nobleHkdf } from '@noble/hashes/hkdf.js'
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'
import {
  concatBytes,
  fromB64u,
  fromUtf8,
  toB64u,
  utf8,
} from '@/features/buddies/lib/bytes'
import {
  ed25519PublicKey,
  ed25519Sign,
  ed25519Verify,
  open,
  seal,
  sha256,
  x25519PublicKey,
  x25519SharedSecret,
} from '@/features/buddies/lib/crypto'
import {
  deriveDirection,
  deriveIdentity,
  deriveInvite,
  derivePairSecret,
} from '@/features/buddies/lib/keys'
import expected from '@/features/buddies/lib/testing/cryptoVectors.json'

/**
 * Known-answer vectors for every byte the Buddies wire depends on: base64url,
 * UTF-8, the RFC primitives (SHA-256, HKDF, X25519, Ed25519,
 * ChaCha20-Poly1305), the key schedule, a signed envelope, and a sealed blob.
 * `cryptoVectors.json` holds the expected values; vitest checks them under
 * Node, and the dev harness (`__WW_DEV__.checkBuddiesCryptoVectors()`) checks
 * them in Hermes on iOS and Android, so all three produce identical bytes. A
 * native implementation (e.g. a Notification Service Extension) must match the
 * same file.
 */

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

const fromHex = (text: string): Uint8Array =>
  new Uint8Array((text.match(/../g) ?? []).map((pair) => parseInt(pair, 16)))

/** 0, 1, 2, … as bytes, from `start`. */
const counting = (length: number, start = 0): Uint8Array =>
  Uint8Array.from({ length }, (_, index) => (start + index) & 0xff)

const EMPTY = new Uint8Array(0)

export type CryptoVectors = Record<string, string>

export function computeCryptoVectors(): CryptoVectors {
  const out: CryptoVectors = {}

  // base64url: every padding length, and the two URL-safe characters.
  for (let length = 0; length <= 5; length++)
    out[`b64u.counting${length}`] = toB64u(counting(length, 0xf8))
  out['b64u.urlSafe'] = toB64u(fromHex('fbefbeffff'))
  out['b64u.roundTrip'] = hex(fromB64u('-_-_AAECAw'))

  // UTF-8 for names and AAD: accents, CJK, and an astral-plane emoji.
  out['utf8.mixed'] = hex(utf8('Zoë 王 🙂'))
  out['utf8.decoded'] = fromUtf8(fromHex('5a6fc3ab20e78e8b20f09f9982'))

  // RFC 6234 / FIPS 180-2: SHA-256("abc").
  out['rfc.sha256Abc'] = hex(sha256(utf8('abc')))

  // RFC 5869 A.1: HKDF-SHA256 (binary info, so straight to the primitive).
  out['rfc.hkdfCase1'] = hex(
    nobleHkdf(
      nobleSha256,
      fromHex('0b'.repeat(22)),
      fromHex('000102030405060708090a0b0c'),
      fromHex('f0f1f2f3f4f5f6f7f8f9'),
      42
    )
  )

  // RFC 7748 6.1: X25519.
  const alice = fromHex(
    '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a'
  )
  const bob = fromHex(
    '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb'
  )
  out['rfc.x25519AlicePub'] = hex(x25519PublicKey(alice))
  out['rfc.x25519BobPub'] = hex(x25519PublicKey(bob))
  out['rfc.x25519Shared'] = hex(x25519SharedSecret(alice, x25519PublicKey(bob)))

  // RFC 8032 7.1 TEST 1 and TEST 2: Ed25519.
  const test1 = fromHex(
    '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'
  )
  out['rfc.ed25519Test1Pub'] = hex(ed25519PublicKey(test1))
  out['rfc.ed25519Test1Sig'] = hex(ed25519Sign(EMPTY, test1))
  const test2 = fromHex(
    '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb'
  )
  out['rfc.ed25519Test2Pub'] = hex(ed25519PublicKey(test2))
  out['rfc.ed25519Test2Sig'] = hex(ed25519Sign(fromHex('72'), test2))

  // RFC 8439 2.8.2: ChaCha20-Poly1305 (binary AAD, so the primitive).
  out['rfc.aead'] = hex(
    chacha20poly1305(
      counting(32, 0x80),
      fromHex('070000004041424344454647'),
      fromHex('50515253c0c1c2c3c4c5c6c7')
    ).encrypt(
      utf8(
        "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it."
      )
    )
  )

  // The Buddies key schedule (docs/buddies-protocol.md).
  const me = deriveIdentity(counting(32, 0x00))
  const them = deriveIdentity(counting(32, 0x20))
  out['identity.ownerPub'] = me.ownerPub
  out['identity.ownerSeed'] = hex(me.ownerSeed)
  out['identity.dhPub'] = me.dhPub
  out['identity.inboxId'] = me.inboxId
  out['identity.rosterKey'] = hex(me.rosterKey)
  out['identity.otherInboxId'] = them.inboxId

  const inviteSecret = counting(16, 0xa0)
  const invite = deriveInvite(inviteSecret)
  out['invite.inviteId'] = invite.inviteId
  out['invite.inviteKey'] = hex(invite.inviteKey)
  out['invite.claimSecret'] = invite.claimSecret
  out['invite.claimVerifier'] = invite.claimVerifier

  const pairSecret = derivePairSecret(
    me.dhPrivate,
    fromB64u(them.dhPub),
    inviteSecret,
    me.inboxId,
    them.inboxId
  )
  const theirPairSecret = derivePairSecret(
    them.dhPrivate,
    fromB64u(me.dhPub),
    inviteSecret,
    them.inboxId,
    me.inboxId
  )
  out['pair.secret'] = hex(pairSecret)
  out['pair.symmetric'] = String(hex(pairSecret) === hex(theirPairSecret))
  const toMe = deriveDirection(pairSecret, me.inboxId)
  out['pair.toMeSlotId'] = toMe.slotId
  out['pair.toMeWriterPub'] = toMe.writerPub
  out['pair.toMeContentKey'] = hex(toMe.contentKey)
  const toThem = deriveDirection(pairSecret, them.inboxId)
  out['pair.toThemSlotId'] = toThem.slotId
  out['pair.toThemWriterPub'] = toThem.writerPub

  // A signed owner envelope over fixed payload bytes, verified back.
  const payload = utf8(
    `{"inboxId":"${me.inboxId}","since":0,"ts":1790000000000,"nonce":"AAAAAAAAAAAAAAAAAAAAAA"}`
  )
  const signed = concatBytes(utf8('ww-buddies/v1\ninbox/sync\n'), payload)
  const signature = ed25519Sign(signed, me.ownerSeed)
  out['envelope.p'] = toB64u(payload)
  out['envelope.s'] = toB64u(signature)
  out['envelope.verifies'] = String(
    ed25519Verify(signature, signed, fromB64u(me.ownerPub))
  )

  // A sealed Buddy Card with a fixed nonce, opened back.
  const aad = `ww-buddies/v1/card|${them.inboxId}|${toThem.slotId}`
  const blob = seal(
    toThem.contentKey,
    utf8('{"v":1,"name":"Zoë 🙂"}'),
    aad,
    counting(12, 0x00)
  )
  out['seal.key'] = hex(toThem.contentKey)
  out['seal.aad'] = aad
  out['seal.blob'] = blob
  out['seal.opened'] = fromUtf8(open(toThem.contentKey, blob, aad))

  return out
}

/** Every vector that doesn't match, by name; empty means all match. */
export function checkCryptoVectors(): {
  ok: boolean
  checked: number
  mismatches: string[]
} {
  const actual = computeCryptoVectors()
  const names = new Set([...Object.keys(expected), ...Object.keys(actual)])
  const mismatches = [...names].filter(
    (name) => (expected as CryptoVectors)[name] !== actual[name]
  )
  return { ok: mismatches.length === 0, checked: names.size, mismatches }
}
