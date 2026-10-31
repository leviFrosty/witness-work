import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import {
  concatBytes,
  fromB64u,
  RELAY_ID_PATTERN,
  toB64u,
  utf8,
} from '@/lib/bytes'
import { curve25519 } from '@/lib/curve25519'

/**
 * Shared Spaces' client cryptography (docs/shared-cars-protocol.md, "Client
 * cryptography"): HKDF-SHA256, X25519, SHA-256 and XChaCha20-Poly1305, the
 * primitives of Buddies and the backup. ww-api never sees any of it: it holds
 * sealed records, a hash of each member's token, and each member's wrap of the
 * space key. Pure; callers supply randomness, so the known-answer vectors
 * (`testing/spaceVectors.json`) stay deterministic. Labels are wire-stable.
 */

const EMPTY = new Uint8Array(0)
const KEY_LENGTH = 32
const NONCE_LENGTH = 24
const TAG_LENGTH = 16
/** The sealed formats' version byte (`0x01`). */
const SEALED_VERSION = 1

/** `spaceId`, `memberId` and `inviteId`: `b64u` of 16 bytes. */
export const SPACE_ID_PATTERN = RELAY_ID_PATTERN
/** A record's id; mileage records use their UUIDs. */
export const RECORD_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

/** Why something sealed didn't open. */
export type SpaceOpenProblem =
  /** Not a version-1 wrap or blob, or too short to be one. */
  | 'format'
  /** Wrong key, another space's, epoch's, record's or member's, or tampered. */
  | 'decrypt'
  /** Opened, but isn't what it should hold. */
  | 'contents'
  /**
   * A low-order X25519 public key: every private key would agree on the same
   * (all-zero) secret with it, so nothing sealed to it would be private.
   */
  | 'key'
  /** A record plaintext from a newer app version. */
  | 'newer'

export class SpaceOpenError extends Error {
  constructor(readonly problem: SpaceOpenProblem) {
    super(`Shared Spaces: unreadable (${problem})`)
    this.name = 'SpaceOpenError'
  }
}

const derive = (ikm: Uint8Array, info: string, length: number) =>
  hkdf(sha256, ikm, EMPTY, utf8(info), length)

/** A new space's id: 16 random bytes, `b64u`. */
export const newSpaceId = (randomBytes: (length: number) => Uint8Array) =>
  toB64u(randomBytes(16))

/** A new space key `K_e`: 32 random bytes, for one key epoch. */
export const newSpaceKey = (randomBytes: (length: number) => Uint8Array) =>
  randomBytes(KEY_LENGTH)

/** `b64u(SHA-256(bytes))`: a member token's `tokenHash`, an invite's verifier. */
export const sha256B64u = (bytes: Uint8Array) => toB64u(sha256(bytes))

/**
 * The `memberId` that commits to `dhPub` on `spaceId`: `b64u(SHA-256(
 * "ww-spaces/v1/member-id|" + spaceId + "|" + b64u(dhPub))[0..16])`. ww-api
 * checks it on `create` and `join`, and every device checks it before wrapping
 * a key to a member, so nobody can swap in a key of their own.
 */
export const memberIdFor = (spaceId: string, dhPub: string) =>
  toB64u(
    sha256(utf8(`ww-spaces/v1/member-id|${spaceId}|${dhPub}`)).subarray(0, 16)
  )

/**
 * Whether `dhPub` is a 32-byte key that `memberId` commits to on `spaceId`
 * (`memberIdFor`): the only key a device wraps a space key to for them.
 */
export function memberOwnsKey(
  spaceId: string,
  memberId: string,
  dhPub: string
): boolean {
  try {
    if (fromB64u(dhPub).length !== 32) return false
  } catch {
    return false
  }
  return memberIdFor(spaceId, dhPub) === memberId
}

/** What a member is on one space, derived from their root seed. */
export type SpaceMemberKeys = {
  spaceId: string
  /** `memberIdFor(spaceId, dhPub)`: the id commits to the member's key. */
  memberId: string
  /** The member token (32 bytes), `b64u`: member ops carry it. */
  token: string
  /** `b64u(SHA-256(token))`, which the server keeps. */
  tokenHash: string
  /** The member's X25519 private key for this space. Never leaves the device. */
  dhPrivate: Uint8Array
  /** Its public key, `b64u`: `create` and `join` send it, `sync` lists it. */
  dhPub: string
  /**
   * The key of the User's key check on this space (`memberCheck`). Only their
   * devices hold it. Never leaves the device.
   */
  checkKey: Uint8Array
}

/**
 * A member's id, token, DH key and check key on `spaceId`, from the User's root
 * seed (the account key). Every device of the User derives the same values, and
 * two spaces' values can't be linked.
 */
export function deriveSpaceMember(
  rootSeed: Uint8Array,
  spaceId: string
): SpaceMemberKeys {
  if (rootSeed.length !== 32) throw new Error('Root seed must be 32 bytes')
  if (!SPACE_ID_PATTERN.test(spaceId)) throw new Error('Invalid space id')
  const token = derive(rootSeed, `ww-spaces/v1/member-token|${spaceId}`, 32)
  const dhPrivate = derive(rootSeed, `ww-spaces/v1/member-dh|${spaceId}`, 32)
  const dhPub = toB64u(curve25519().x25519.getPublicKey(dhPrivate))
  return {
    spaceId,
    memberId: memberIdFor(spaceId, dhPub),
    token: toB64u(token),
    tokenHash: sha256B64u(token),
    dhPrivate,
    dhPub,
    checkKey: derive(rootSeed, `ww-spaces/v1/member-check|${spaceId}`, 32),
  }
}

/**
 * What the User's key check covers: their `member` record's own contents, and
 * the epoch and key it's sealed under.
 */
export type MemberCheckFields = {
  spaceId: string
  /** The epoch the record is sealed under. */
  epoch: number
  /** That epoch's space key. */
  spaceKey: Uint8Array
  name: string
  avatar?: string
  tag: string
  joinedAt: number
}

/**
 * The key check in the User's own `member` record: `b64u(HMAC-SHA256(checkKey,
 * UTF-8(JSON.stringify(["ww-spaces/v1/member-check", spaceId, x, b64u(K_x),
 * name, avatar ?? null, tag, joinedAt])))[0..16])`. Only the User's devices
 * hold the check key, so a record whose check matches is one of theirs, sealed
 * under a key they trusted: how a device that trusts none of a space's keys yet
 * tells the real one from a planted one.
 */
export function memberCheck(
  checkKey: Uint8Array,
  fields: MemberCheckFields
): string {
  if (checkKey.length !== 32) throw new Error('Check key must be 32 bytes')
  if (fields.spaceKey.length !== KEY_LENGTH)
    throw new Error('Space key must be 32 bytes')
  const covered = JSON.stringify([
    'ww-spaces/v1/member-check',
    fields.spaceId,
    fields.epoch,
    toB64u(fields.spaceKey),
    fields.name,
    fields.avatar ?? null,
    fields.tag,
    fields.joinedAt,
  ])
  return toB64u(hmac(sha256, checkKey, utf8(covered)).subarray(0, 16))
}

/** An invite's `joinVerifier`: `b64u(SHA-256(joinSecret))`. */
export const joinVerifier = (joinSecret: Uint8Array) => sha256B64u(joinSecret)

/** Epoch `e`'s record key: `HKDF(K_e, "", "ww-spaces/v1/record", 32)`. */
export function deriveRecordKey(spaceKey: Uint8Array): Uint8Array {
  if (spaceKey.length !== KEY_LENGTH)
    throw new Error('Space key must be 32 bytes')
  return derive(spaceKey, 'ww-spaces/v1/record', 32)
}

/** Whose wrap of which epoch's key: bound into its AAD. */
export type WrapAddress = { spaceId: string; epoch: number; memberId: string }

export const wrapAad = ({ spaceId, epoch, memberId }: WrapAddress) =>
  utf8(`ww-spaces/v1/wrap\n${spaceId}\n${epoch}\n${memberId}`)

const isZero = (bytes: Uint8Array) => bytes.every((byte) => byte === 0)

/**
 * X25519 of `privateKey` and `publicKey`. A low-order public key would give
 * every private key the same (all-zero) secret: `@noble/curves` refuses it, and
 * so does this, as `SpaceOpenError('key')`.
 */
function agree(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  let shared: Uint8Array
  try {
    shared = curve25519().x25519.getSharedSecret(privateKey, publicKey)
  } catch {
    throw new SpaceOpenError('key')
  }
  if (isZero(shared)) throw new SpaceOpenError('key')
  return shared
}

const wrapKeyFor = (
  shared: Uint8Array,
  ephPub: Uint8Array,
  memberPub: Uint8Array
): Uint8Array =>
  derive(shared, `ww-spaces/v1/wrap|${toB64u(ephPub)}|${toB64u(memberPub)}`, 32)

/**
 * Wraps the space key `K_e` to one member's X25519 key: `b64u(ephPub[32] ‖ 0x01
 * ‖ nonce[24] ‖ XChaCha20-Poly1305(wrapKey, nonce, K_e, aad))`. `ephemeral` is
 * 32 random bytes (the one-time X25519 private key) and `nonce` 24.
 */
export function wrapSpaceKey(
  spaceKey: Uint8Array,
  memberPub: string,
  address: WrapAddress,
  random: { ephemeral: Uint8Array; nonce: Uint8Array }
): string {
  if (spaceKey.length !== KEY_LENGTH)
    throw new Error('Space key must be 32 bytes')
  if (random.ephemeral.length !== 32)
    throw new Error('Ephemeral key must be 32 bytes')
  if (random.nonce.length !== NONCE_LENGTH)
    throw new Error('Nonce must be 24 bytes')
  const { x25519 } = curve25519()
  const memberPubBytes = fromB64u(memberPub)
  if (memberPubBytes.length !== 32)
    throw new Error('Member key must be 32 bytes')
  const ephPub = x25519.getPublicKey(random.ephemeral)
  const wrapKey = wrapKeyFor(
    agree(random.ephemeral, memberPubBytes),
    ephPub,
    memberPubBytes
  )
  const sealed = xchacha20poly1305(
    wrapKey,
    random.nonce,
    wrapAad(address)
  ).encrypt(spaceKey)
  return toB64u(
    concatBytes(ephPub, new Uint8Array([SEALED_VERSION]), random.nonce, sealed)
  )
}

/**
 * Opens a wrap with the member's own derived DH key. Throws `SpaceOpenError`:
 * `key` for a low-order ephemeral key, `decrypt` for anything else that won't
 * open.
 */
export function unwrapSpaceKey(
  wrap: string,
  member: Pick<SpaceMemberKeys, 'dhPrivate' | 'dhPub'>,
  address: WrapAddress
): Uint8Array {
  let bytes: Uint8Array
  try {
    bytes = fromB64u(wrap)
  } catch {
    throw new SpaceOpenError('format')
  }
  if (
    bytes.length !== 32 + 1 + NONCE_LENGTH + KEY_LENGTH + TAG_LENGTH ||
    bytes[32] !== SEALED_VERSION
  )
    throw new SpaceOpenError('format')
  const ephPub = bytes.subarray(0, 32)
  const nonce = bytes.subarray(33, 33 + NONCE_LENGTH)
  const wrapKey = wrapKeyFor(
    agree(member.dhPrivate, ephPub),
    ephPub,
    fromB64u(member.dhPub)
  )
  try {
    return xchacha20poly1305(wrapKey, nonce, wrapAad(address)).decrypt(
      bytes.subarray(33 + NONCE_LENGTH)
    )
  } catch {
    throw new SpaceOpenError('decrypt')
  }
}

/** `0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(key, nonce, plaintext, aad)`, `b64u`. */
export function sealXChaCha(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
  nonce: Uint8Array
): string {
  if (nonce.length !== NONCE_LENGTH) throw new Error('Nonce must be 24 bytes')
  return toB64u(
    concatBytes(
      new Uint8Array([SEALED_VERSION]),
      nonce,
      xchacha20poly1305(key, nonce, aad).encrypt(plaintext)
    )
  )
}

/** Opens `sealXChaCha`'s blob. Throws `SpaceOpenError`. */
export function openXChaCha(
  key: Uint8Array,
  blob: string,
  aad: Uint8Array
): Uint8Array {
  let bytes: Uint8Array
  try {
    bytes = fromB64u(blob)
  } catch {
    throw new SpaceOpenError('format')
  }
  if (
    bytes.length < 1 + NONCE_LENGTH + TAG_LENGTH ||
    bytes[0] !== SEALED_VERSION
  )
    throw new SpaceOpenError('format')
  try {
    return xchacha20poly1305(
      key,
      bytes.subarray(1, 1 + NONCE_LENGTH),
      aad
    ).decrypt(bytes.subarray(1 + NONCE_LENGTH))
  } catch {
    throw new SpaceOpenError('decrypt')
  }
}

/** A sealed blob's decoded length, for the server's 16 KB cap. */
export const sealedLength = (plaintextLength: number) =>
  1 + NONCE_LENGTH + plaintextLength + TAG_LENGTH

/**
 * A person's tag on a space: `b64u(SHA-256("ww-spaces/v1/member-tag|" + spaceId
 *
 * - "|" + inboxId)[0..16])`, from their Buddies inbox. A device works it out for
 *   each of its own buddies to recognise them; to anyone else it means
 *   nothing.
 */
export const memberTag = (spaceId: string, inboxId: string) =>
  toB64u(
    sha256(utf8(`ww-spaces/v1/member-tag|${spaceId}|${inboxId}`)).subarray(
      0,
      16
    )
  )

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * A UUID made from a hash: its first 16 bytes with the version set to 8 and the
 * RFC 9562 variant, as RFC 9562's name-based SHA-256 example does. Lowercase,
 * like `randomUUID()`'s.
 */
export function uuidFromHash(hash: Uint8Array): string {
  if (hash.length < 16) throw new Error('Hash must be at least 16 bytes')
  const bytes = hash.slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const text = hex(bytes)
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`
}

/**
 * The id a record gets in a member's personal copy when they leave a space:
 * `uuid(SHA-256("ww-spaces/v1/copy|" + spaceId + "|" + joinedAt + "|" + id))`,
 * with `joinedAt` the member's own (the server's `members` list). Every device
 * of the person makes identical records, which personal sync merges into one.
 */
export const copyRecordId = (spaceId: string, joinedAt: number, id: string) =>
  uuidFromHash(sha256(utf8(`ww-spaces/v1/copy|${spaceId}|${joinedAt}|${id}`)))

/**
 * The Buddies `eventId` of an invitation event about a space (`car.invite`,
 * `car.cancel`, `car.reply`): `b64u(SHA-256("ww-spaces/v1/car-event|" + kind +
 * "|" + senderInboxId + "|" + recipientInboxId + "|" + inviteId)[0..16])`, so a
 * resend is the same event.
 */
export const inviteEventId = (
  kind: string,
  senderInboxId: string,
  recipientInboxId: string,
  inviteId: string
) =>
  toB64u(
    sha256(
      utf8(
        `ww-spaces/v1/car-event|${kind}|${senderInboxId}|${recipientInboxId}|${inviteId}`
      )
    ).subarray(0, 16)
  )
