import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { fromUtf8, toB64u, utf8 } from '@/lib/bytes'
import {
  copyRecordId,
  deriveRecordKey,
  deriveSpaceMember,
  inviteEventId,
  joinVerifier,
  memberCheck,
  memberOwnsKey,
  memberTag,
  SpaceOpenError,
  unwrapSpaceKey,
  wrapAad,
  wrapSpaceKey,
} from '@/lib/sharedSpaces/crypto'
import {
  encodePlaintext,
  keysRecordData,
  keysRecordId,
  openRecord,
  readKeysData,
  recordAad,
  sealRecord,
} from '@/lib/sharedSpaces/records'
import expected from '@/lib/sharedSpaces/testing/spaceVectors.json'

/**
 * Known-answer vectors for every byte Shared Spaces depends on
 * (docs/shared-cars-protocol.md, "Client cryptography"): XChaCha20-Poly1305
 * against its draft's test vector, the member derivations (a `memberId` is a
 * hash of the member's key), the record key, a wrap, sealed records (live and
 * deleted, with their AADs), the key chain, the join verifier, a member tag,
 * the User's key check (its key, what it covers, and the check with and without
 * an avatar), a personal copy's id, and an invitation's event id. The negative
 * vectors say what opening each sealed value under the wrong AAD gives: it must
 * fail. `spaceVectors.json` holds the expected values; vitest checks them under
 * Node, and the dev harness (`__WW_DEV__.checkSharedSpacesCryptoVectors()`)
 * checks them in Hermes on iOS and Android, so all of them produce identical
 * bytes. ww-api's tests and any other client must match the same file.
 */

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

const fromHex = (text: string): Uint8Array =>
  new Uint8Array((text.match(/../g) ?? []).map((pair) => parseInt(pair, 16)))

/** 0, 1, 2, … as bytes, from `start`. */
const counting = (length: number, start = 0): Uint8Array =>
  Uint8Array.from({ length }, (_, index) => (start + index) & 0xff)

/** What opening something gave: `opened`, or the `SpaceOpenError` problem. */
function outcome(open: () => unknown): string {
  try {
    open()
  } catch (error) {
    return error instanceof SpaceOpenError ? error.problem : 'error'
  }
  return 'opened'
}

export type SpaceVectors = Record<string, string>

export function computeSpaceVectors(): SpaceVectors {
  const out: SpaceVectors = {}

  // draft-irtf-cfrg-xchacha-03 A.3.1: XChaCha20-Poly1305 (binary AAD, so the
  // primitive).
  out['rfc.xchacha'] = hex(
    xchacha20poly1305(
      counting(32, 0x80),
      fromHex('404142434445464748494a4b4c4d4e4f5051525354555657'),
      fromHex('50515253c0c1c2c3c4c5c6c7')
    ).encrypt(
      utf8(
        "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it."
      )
    )
  )

  // The member derivations, for two people on one space.
  const spaceId = toB64u(counting(16, 0x10))
  const seed = counting(32, 0x00)
  const me = deriveSpaceMember(seed, spaceId)
  const them = deriveSpaceMember(counting(32, 0x20), spaceId)
  out['space.id'] = spaceId
  out['member.id'] = me.memberId
  out['member.token'] = me.token
  out['member.tokenHash'] = me.tokenHash
  out['member.dhPrivate'] = hex(me.dhPrivate)
  out['member.dhPub'] = me.dhPub
  out['member.idInput'] = `ww-spaces/v1/member-id|${spaceId}|${me.dhPub}`
  out['member.otherId'] = them.memberId
  out['member.otherDhPub'] = them.dhPub
  // An id commits to its key: one member's id doesn't own another's key.
  out['member.forgedKey'] = memberOwnsKey(spaceId, me.memberId, them.dhPub)
    ? 'owned'
    : 'refused'
  // Another space's values can't be linked to these.
  out['member.otherSpaceId'] = deriveSpaceMember(
    seed,
    toB64u(counting(16, 0x30))
  ).memberId

  // The space key for epoch 1 and its record key.
  const spaceKey = counting(32, 0x40)
  out['key.record'] = hex(deriveRecordKey(spaceKey))

  // A wrap of epoch 1's key to the other member, with fixed randomness.
  const wrapAddress = { spaceId, epoch: 1, memberId: them.memberId }
  out['wrap.aad'] = fromUtf8(wrapAad(wrapAddress))
  const wrap = wrapSpaceKey(spaceKey, them.dhPub, wrapAddress, {
    ephemeral: counting(32, 0x50),
    nonce: counting(24, 0x70),
  })
  out['wrap.value'] = wrap
  out['wrap.opened'] = hex(
    unwrapSpaceKey(
      wrap,
      deriveSpaceMember(counting(32, 0x20), spaceId),
      wrapAddress
    )
  )
  // The wrong AAD: another epoch, or another member's id.
  out['wrap.wrongEpoch'] = outcome(() =>
    unwrapSpaceKey(wrap, them, { ...wrapAddress, epoch: 2 })
  )
  out['wrap.wrongMember'] = outcome(() =>
    unwrapSpaceKey(wrap, them, { ...wrapAddress, memberId: me.memberId })
  )

  // A live trip and its deletion, sealed with a fixed nonce, opened back.
  const tripAddress = {
    spaceId,
    epoch: 1,
    recordId: '0b1f5c2e-8a7d-4e6f-9a3b-2c1d0e9f8a7b',
    deleted: false,
    stamp: 1_790_000_000_123,
  }
  const trip = {
    kind: 'trip',
    data: {
      vehicleId: '6f1e2d3c-4b5a-4968-8776-655443322110',
      date: '2026-10-29',
      distanceMiles: 12.5,
      note: 'Zoë 王 🙂',
      loggedBy: me.memberId,
      createdAt: 1_790_000_000_000,
      updatedAt: 1_790_000_000_123,
    },
  }
  out['record.aad'] = fromUtf8(recordAad(tripAddress))
  out['record.plaintext'] = fromUtf8(
    encodePlaintext(trip.kind, trip.data, false)
  )
  const blob = sealRecord(spaceKey, tripAddress, trip, counting(24, 0x90))
  out['record.blob'] = blob
  out['record.opened'] = JSON.stringify(openRecord(spaceKey, tripAddress, blob))
  // The wrong AAD: restamped, deleted, moved to another record or epoch.
  out['record.wrongStamp'] = outcome(() =>
    openRecord(spaceKey, { ...tripAddress, stamp: tripAddress.stamp + 1 }, blob)
  )
  out['record.wrongDeleted'] = outcome(() =>
    openRecord(spaceKey, { ...tripAddress, deleted: true }, blob)
  )
  out['record.wrongId'] = outcome(() =>
    openRecord(spaceKey, { ...tripAddress, recordId: 'another-trip' }, blob)
  )
  out['record.wrongEpoch'] = outcome(() =>
    openRecord(spaceKey, { ...tripAddress, epoch: 2 }, blob)
  )

  const deletion = { ...tripAddress, deleted: true, stamp: 1_790_000_100_000 }
  out['deletion.aad'] = fromUtf8(recordAad(deletion))
  const deleted = sealRecord(
    spaceKey,
    deletion,
    { kind: 'trip' },
    counting(24, 0xa0)
  )
  out['deletion.blob'] = deleted
  out['deletion.opened'] = JSON.stringify(
    openRecord(spaceKey, deletion, deleted)
  )

  // The key chain: `k.2` sealed under epoch 2's key, holding epoch 1's.
  const nextKey = counting(32, 0xc0)
  const chain = {
    spaceId,
    epoch: 2,
    recordId: keysRecordId(2),
    deleted: false,
    stamp: 1_790_000_200_000,
  }
  const chainBlob = sealRecord(
    nextKey,
    chain,
    { kind: 'keys', data: keysRecordData(spaceKey) },
    counting(24, 0xb0)
  )
  out['keys.blob'] = chainBlob
  const opened = openRecord(nextKey, chain, chainBlob)
  out['keys.prev'] = hex(readKeysData(opened.data ?? {}) ?? new Uint8Array())
  // A chain link read as another epoch's link doesn't open.
  out['keys.wrongId'] = outcome(() =>
    openRecord(nextKey, { ...chain, recordId: keysRecordId(3) }, chainBlob)
  )

  // An invitation's verifier, a person's tag, a personal copy's id, and the
  // Buddies event an invitation travels in.
  const joinSecret = counting(32, 0xe0)
  out['invite.joinSecret'] = toB64u(joinSecret)
  out['invite.joinVerifier'] = joinVerifier(joinSecret)
  const inboxId = toB64u(counting(16, 0xf0))
  const otherInboxId = toB64u(counting(16, 0x60))
  out['member.tag'] = memberTag(spaceId, inboxId)

  // The User's key check in their member record, sealed under epoch 1.
  out['member.checkKey'] = hex(me.checkKey)
  const checked = {
    spaceId,
    epoch: 1,
    spaceKey,
    name: 'Zoë 王',
    tag: out['member.tag'],
    joinedAt: 1_790_000_000_000,
  }
  out['member.checkInput'] = JSON.stringify([
    'ww-spaces/v1/member-check',
    spaceId,
    1,
    toB64u(spaceKey),
    checked.name,
    '🚗',
    checked.tag,
    checked.joinedAt,
  ])
  out['member.check'] = memberCheck(me.checkKey, { ...checked, avatar: '🚗' })
  out['member.checkNoAvatar'] = memberCheck(me.checkKey, checked)
  out['copy.id'] = copyRecordId(
    spaceId,
    1_790_000_000_000,
    tripAddress.recordId
  )
  out['event.id'] = inviteEventId(
    'car.invite',
    inboxId,
    otherInboxId,
    toB64u(counting(16, 0x80))
  )

  return out
}

/** Every vector that doesn't match, by name; empty means all match. */
export function checkSpaceVectors(): {
  ok: boolean
  checked: number
  mismatches: string[]
} {
  const actual = computeSpaceVectors()
  const names = new Set([...Object.keys(expected), ...Object.keys(actual)])
  const mismatches = [...names].filter(
    (name) => (expected as SpaceVectors)[name] !== actual[name]
  )
  return { ok: mismatches.length === 0, checked: names.size, mismatches }
}
