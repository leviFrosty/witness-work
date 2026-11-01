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

const EMPTY = new Uint8Array(0)
const KEY_LENGTH = 32
const NONCE_LENGTH = 24
const TAG_LENGTH = 16

const SEALED_VERSION = 1

export const SPACE_ID_PATTERN = RELAY_ID_PATTERN

export const RECORD_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

export type SpaceOpenProblem =
  | 'format'
  | 'decrypt'
  | 'contents'
  | 'key'
  | 'newer'

export class SpaceOpenError extends Error {
  constructor(readonly problem: SpaceOpenProblem) {
    super(`Shared Spaces: unreadable (${problem})`)
    this.name = 'SpaceOpenError'
  }
}

const derive = (ikm: Uint8Array, info: string, length: number) =>
  hkdf(sha256, ikm, EMPTY, utf8(info), length)

export const newSpaceId = (randomBytes: (length: number) => Uint8Array) =>
  toB64u(randomBytes(16))

export const newSpaceKey = (randomBytes: (length: number) => Uint8Array) =>
  randomBytes(KEY_LENGTH)

export const sha256B64u = (bytes: Uint8Array) => toB64u(sha256(bytes))

export const memberIdFor = (spaceId: string, dhPub: string) =>
  toB64u(
    sha256(utf8(`ww-spaces/v1/member-id|${spaceId}|${dhPub}`)).subarray(0, 16)
  )

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

export type SpaceMemberKeys = {
  spaceId: string

  memberId: string

  token: string

  tokenHash: string

  dhPrivate: Uint8Array

  dhPub: string

  checkKey: Uint8Array
}

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

export type MemberCheckFields = {
  spaceId: string

  epoch: number

  spaceKey: Uint8Array
  name: string
  avatar?: string
  tag: string
  joinedAt: number
}

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

export const joinVerifier = (joinSecret: Uint8Array) => sha256B64u(joinSecret)

export function deriveRecordKey(spaceKey: Uint8Array): Uint8Array {
  if (spaceKey.length !== KEY_LENGTH)
    throw new Error('Space key must be 32 bytes')
  return derive(spaceKey, 'ww-spaces/v1/record', 32)
}

export type WrapAddress = { spaceId: string; epoch: number; memberId: string }

export const wrapAad = ({ spaceId, epoch, memberId }: WrapAddress) =>
  utf8(`ww-spaces/v1/wrap\n${spaceId}\n${epoch}\n${memberId}`)

const isZero = (bytes: Uint8Array) => bytes.every((byte) => byte === 0)

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

export const sealedLength = (plaintextLength: number) =>
  1 + NONCE_LENGTH + plaintextLength + TAG_LENGTH

export const memberTag = (spaceId: string, inboxId: string) =>
  toB64u(
    sha256(utf8(`ww-spaces/v1/member-tag|${spaceId}|${inboxId}`)).subarray(
      0,
      16
    )
  )

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

export function uuidFromHash(hash: Uint8Array): string {
  if (hash.length < 16) throw new Error('Hash must be at least 16 bytes')
  const bytes = hash.slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const text = hex(bytes)
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`
}

export const copyRecordId = (spaceId: string, joinedAt: number, id: string) =>
  uuidFromHash(sha256(utf8(`ww-spaces/v1/copy|${spaceId}|${joinedAt}|${id}`)))

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
