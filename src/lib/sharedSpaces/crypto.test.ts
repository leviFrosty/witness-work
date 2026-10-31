import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { fromB64u, toB64u, utf8 } from '@/lib/bytes'
import {
  copyRecordId,
  deriveRecordKey,
  deriveSpaceMember,
  joinVerifier,
  memberIdFor,
  memberOwnsKey,
  memberTag,
  newSpaceId,
  sealXChaCha,
  SpaceOpenError,
  unwrapSpaceKey,
  wrapSpaceKey,
} from '@/lib/sharedSpaces/crypto'
import {
  keysRecordData,
  openRecord,
  readKeysData,
  RECORD_PLAINTEXT_MAX_BYTES,
  recordAad,
  sealRecord,
  type SpaceRecordAddress,
} from '@/lib/sharedSpaces/records'

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const sha256 = (bytes: Uint8Array) =>
  new Uint8Array(createHash('sha256').update(bytes).digest())

const seed = new Uint8Array(32).fill(7)
const spaceId = toB64u(new Uint8Array(16).fill(1))

function problem(run: () => unknown) {
  try {
    run()
  } catch (error) {
    return error instanceof SpaceOpenError ? error.problem : 'other'
  }
  return 'opened'
}

describe('member values', () => {
  it('are the same on every device of the User, and unlinkable across spaces', () => {
    const here = deriveSpaceMember(seed, spaceId)
    expect(deriveSpaceMember(new Uint8Array(seed), spaceId)).toEqual(here)
    const other = deriveSpaceMember(seed, newSpaceId(random))
    expect(other.memberId).not.toBe(here.memberId)
    expect(other.token).not.toBe(here.token)
    expect(other.dhPub).not.toBe(here.dhPub)
  })

  it('send only the token hash, which is the SHA-256 of its bytes', () => {
    const member = deriveSpaceMember(seed, spaceId)
    expect(member.tokenHash).toBe(toB64u(sha256(fromB64u(member.token))))
    expect(fromB64u(member.memberId)).toHaveLength(16)
    expect(fromB64u(member.token)).toHaveLength(32)
  })

  it('commit the member id to the member’s key', () => {
    const member = deriveSpaceMember(seed, spaceId)
    expect(member.memberId).toBe(
      toB64u(
        sha256(
          new TextEncoder().encode(
            `ww-spaces/v1/member-id|${spaceId}|${member.dhPub}`
          )
        ).subarray(0, 16)
      )
    )
    expect(memberIdFor(spaceId, member.dhPub)).toBe(member.memberId)
    expect(memberOwnsKey(spaceId, member.memberId, member.dhPub)).toBe(true)
    // Someone else's key under this member's id, or this key on another space.
    const someone = deriveSpaceMember(random(32), spaceId)
    expect(memberOwnsKey(spaceId, member.memberId, someone.dhPub)).toBe(false)
    expect(
      memberOwnsKey(newSpaceId(random), member.memberId, member.dhPub)
    ).toBe(false)
    expect(memberOwnsKey(spaceId, member.memberId, 'not a key')).toBe(false)
  })

  it('make an invite verifier from the secret bytes', () => {
    const secret = random(32)
    expect(joinVerifier(secret)).toBe(toB64u(sha256(secret)))
  })

  it('tag a person by space, so a tag means nothing elsewhere', () => {
    expect(memberTag(spaceId, 'inbox')).not.toBe(
      memberTag(newSpaceId(random), 'inbox')
    )
    expect(fromB64u(memberTag(spaceId, 'inbox'))).toHaveLength(16)
  })
})

describe('key wraps', () => {
  const member = deriveSpaceMember(seed, spaceId)
  const address = { spaceId, epoch: 3, memberId: member.memberId }
  const key = random(32)
  const wrap = () =>
    wrapSpaceKey(key, member.dhPub, address, {
      ephemeral: random(32),
      nonce: random(24),
    })

  it('open for the member they were made for', () => {
    expect(unwrapSpaceKey(wrap(), member, address)).toEqual(key)
  })

  it('open for no one else, and at no other epoch or member id', () => {
    const someone = deriveSpaceMember(random(32), spaceId)
    expect(problem(() => unwrapSpaceKey(wrap(), someone, address))).toBe(
      'decrypt'
    )
    expect(
      problem(() => unwrapSpaceKey(wrap(), member, { ...address, epoch: 4 }))
    ).toBe('decrypt')
    expect(
      problem(() =>
        unwrapSpaceKey(wrap(), member, {
          ...address,
          memberId: someone.memberId,
        })
      )
    ).toBe('decrypt')
  })

  it("don't open once a byte changed, or from another version", () => {
    const bytes = fromB64u(wrap())
    const tampered = new Uint8Array(bytes)
    tampered[bytes.length - 1] ^= 1
    expect(
      problem(() => unwrapSpaceKey(toB64u(tampered), member, address))
    ).toBe('decrypt')
    const newer = new Uint8Array(bytes)
    newer[32] = 2
    expect(problem(() => unwrapSpaceKey(toB64u(newer), member, address))).toBe(
      'format'
    )
    expect(problem(() => unwrapSpaceKey('AAAA', member, address))).toBe(
      'format'
    )
  })

  it('refuse a low-order public key, as a key problem', () => {
    expect(
      problem(() =>
        wrapSpaceKey(key, toB64u(new Uint8Array(32)), address, {
          ephemeral: random(32),
          nonce: random(24),
        })
      )
    ).toBe('key')
    // A wrap whose ephemeral key is low order doesn't open, the same way.
    const bytes = fromB64u(wrap())
    bytes.set(new Uint8Array(32), 0)
    expect(problem(() => unwrapSpaceKey(toB64u(bytes), member, address))).toBe(
      'key'
    )
  })
})

describe('records', () => {
  const key = random(32)
  const address: SpaceRecordAddress = {
    spaceId,
    epoch: 2,
    recordId: 'trip-1',
    deleted: false,
    stamp: 1_700_000_000_000,
  }
  const seal = (at = address, data: Record<string, unknown> = { miles: 3 }) =>
    sealRecord(
      key,
      at,
      { kind: 'trip', data: at.deleted ? undefined : data },
      random(24)
    )

  it('open to their kind and data', () => {
    expect(openRecord(key, address, seal())).toEqual({
      v: 1,
      kind: 'trip',
      data: { miles: 3 },
    })
  })

  it('carry no data when deleted', () => {
    const deletion = { ...address, deleted: true }
    expect(openRecord(key, deletion, seal(deletion))).toEqual({
      v: 1,
      kind: 'trip',
    })
  })

  it('refuse a deletion that carries data', () => {
    const deletion = { ...address, deleted: true }
    const blob = sealXChaCha(
      deriveRecordKey(key),
      utf8(JSON.stringify({ v: 1, kind: 'trip', data: { miles: 3 } })),
      recordAad(deletion),
      random(24)
    )
    expect(problem(() => openRecord(key, deletion, blob))).toBe('contents')
  })

  it("can't be moved, restamped, undeleted, or opened with another key", () => {
    const blob = seal()
    for (const moved of [
      { ...address, stamp: address.stamp + 1 },
      { ...address, deleted: true },
      { ...address, recordId: 'trip-2' },
      { ...address, epoch: 3 },
      { ...address, spaceId: newSpaceId(random) },
    ])
      expect(problem(() => openRecord(key, moved, blob))).toBe('decrypt')
    expect(problem(() => openRecord(random(32), address, blob))).toBe('decrypt')
  })

  it('refuse plaintext past the 16 KB cap', () => {
    const note = 'x'.repeat(RECORD_PLAINTEXT_MAX_BYTES)
    expect(() => seal(address, { note })).toThrow()
  })

  it('carry the previous key in the key chain', () => {
    const previous = random(32)
    expect(readKeysData(keysRecordData(previous))).toEqual(previous)
    expect(readKeysData({ prev: 'short' })).toBeNull()
  })
})

describe('personal copy ids', () => {
  it('are version 8 UUIDs from the space, the join time, and the id', () => {
    const id = copyRecordId(spaceId, 1000, 'trip-1')
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(copyRecordId(spaceId, 1000, 'trip-1')).toBe(id)
    expect(copyRecordId(spaceId, 1001, 'trip-1')).not.toBe(id)
    expect(copyRecordId(spaceId, 1000, 'trip-2')).not.toBe(id)
  })
})
