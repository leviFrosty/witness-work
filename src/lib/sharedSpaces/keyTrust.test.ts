import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { toB64u } from '@/lib/bytes'
import { deriveSpaceMember, memberCheck } from '@/lib/sharedSpaces/crypto'
import {
  checkMatches,
  type EpochKey,
  linkedKey,
  openLink,
  ownRecordVouches,
  type SealedRecord,
  verifyCandidate,
} from '@/lib/sharedSpaces/keyTrust'
import {
  keysRecordData,
  keysRecordId,
  memberRecordId,
  sealRecord,
} from '@/lib/sharedSpaces/records'

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

const spaceId = toB64u(random(16))
const me = deriveSpaceMember(random(32), spaceId)
const someoneElse = deriveSpaceMember(random(32), spaceId)
const keys = [random(32), random(32), random(32), random(32)]

const K = (epoch: number) => keys[epoch]

function link(
  x: number,
  prev: Uint8Array,
  epoch: number,
  key: Uint8Array
): SealedRecord {
  const recordId = keysRecordId(x)
  const stamp = 1000 + x
  return {
    recordId,
    epoch,
    stamp,
    deleted: false,
    blob: sealRecord(
      key,
      { spaceId, epoch, recordId, deleted: false, stamp },
      { kind: 'keys', data: keysRecordData(prev) },
      random(24)
    ),
  }
}

const profile = {
  name: 'Zoë',
  tag: 'yVJgzGqGp1IFlzDmP8y-tg',
  joinedAt: 1_790_000_000_000,
}

function memberRecord(
  member: { memberId: string },
  epoch: number,
  key: Uint8Array,
  data: Record<string, unknown>
): SealedRecord {
  const recordId = memberRecordId(member.memberId)
  const stamp = 2000
  return {
    recordId,
    epoch,
    stamp,
    deleted: false,
    blob: sealRecord(
      key,
      { spaceId, epoch, recordId, deleted: false, stamp },
      { kind: 'member', data },
      random(24)
    ),
  }
}

const ownRecord = (epoch: number, key: Uint8Array) =>
  memberRecord(me, epoch, key, {
    ...profile,
    check: memberCheck(me.checkKey, {
      spaceId,
      epoch,
      spaceKey: key,
      ...profile,
    }),
  })

const trustedOnly =
  (...held: EpochKey[]) =>
  (epoch: number) =>
    held.find((k) => k.epoch === epoch)?.key ?? null

describe('key chain links', () => {
  it('count only when live and sealed under their own epoch or later', () => {
    const prev = K(1)
    const data = keysRecordData(prev)
    expect(
      linkedKey({ recordId: 'k.2', epoch: 2, deleted: false }, data)
    ).toEqual({ epoch: 1, key: prev })
    expect(
      linkedKey({ recordId: 'k.2', epoch: 3, deleted: false }, data)
    ).toEqual({ epoch: 1, key: prev })
    expect(
      linkedKey({ recordId: 'k.2', epoch: 1, deleted: false }, data)
    ).toBeNull()
    expect(
      linkedKey({ recordId: 'k.2', epoch: 2, deleted: true }, data)
    ).toBeNull()
    expect(
      linkedKey({ recordId: 'trip', epoch: 2, deleted: false }, data)
    ).toBeNull()
  })

  it('open only under their sealing key, and only as keys', () => {
    expect(openLink(spaceId, link(2, K(1), 2, K(2)), K(2))).toEqual({
      epoch: 1,
      key: K(1),
    })
    expect(openLink(spaceId, link(2, K(1), 2, K(2)), K(3))).toBeNull()
    const notKeys = memberRecord(me, 2, K(2), profile)
    expect(openLink(spaceId, { ...notKeys, recordId: 'k.2' }, K(2))).toBeNull()
  })
})

describe('the key check', () => {
  it('matches only the User’s own record, as written, under that key and epoch', () => {
    const check = memberCheck(me.checkKey, {
      spaceId,
      epoch: 2,
      spaceKey: K(2),
      ...profile,
    })
    const data = { ...profile, check }
    expect(checkMatches(spaceId, 2, K(2), data, me.checkKey)).toBe(true)

    expect(
      checkMatches(spaceId, 2, K(2), { ...data, name: 'Eve' }, me.checkKey)
    ).toBe(false)
    expect(
      checkMatches(spaceId, 2, K(2), { ...data, avatar: '🚗' }, me.checkKey)
    ).toBe(false)

    expect(checkMatches(spaceId, 3, K(2), data, me.checkKey)).toBe(false)
    expect(checkMatches(spaceId, 2, K(3), data, me.checkKey)).toBe(false)

    expect(checkMatches(spaceId, 2, K(2), data, someoneElse.checkKey)).toBe(
      false
    )
    expect(checkMatches(spaceId, 2, K(2), { ...profile }, me.checkKey)).toBe(
      false
    )
  })

  it('vouches through the User’s own record only', () => {
    expect(ownRecordVouches(spaceId, ownRecord(2, K(2)), K(2), me)).toBe(true)
    expect(ownRecordVouches(spaceId, ownRecord(2, K(2)), K(3), me)).toBe(false)

    const theirs = memberRecord(someoneElse, 2, K(2), {
      ...profile,
      check: memberCheck(someoneElse.checkKey, {
        spaceId,
        epoch: 2,
        spaceKey: K(2),
        ...profile,
      }),
    })
    expect(ownRecordVouches(spaceId, theirs, K(2), me)).toBe(false)
    expect(ownRecordVouches(spaceId, theirs, K(2), someoneElse)).toBe(true)
  })
})

describe('verifying a candidate key', () => {
  const chain = [link(2, K(1), 2, K(2)), link(3, K(2), 3, K(3))]

  it('trusts it, and every key on the way, through links back to a trusted key', () => {
    expect(
      verifyCandidate({
        spaceId,
        candidate: { epoch: 3, key: K(3) },
        trusted: trustedOnly({ epoch: 1, key: K(1) }),
        links: chain,
        own: [],
        member: me,
      })
    ).toEqual({
      status: 'trusted',
      keys: [
        { epoch: 3, key: K(3) },
        { epoch: 2, key: K(2) },
      ],
    })
  })

  it('trusts it through the User’s key check when no key is trusted yet', () => {
    expect(
      verifyCandidate({
        spaceId,
        candidate: { epoch: 3, key: K(3) },
        trusted: trustedOnly(),
        links: chain,
        own: [ownRecord(2, K(2))],
        member: me,
      })
    ).toEqual({
      status: 'trusted',
      keys: [
        { epoch: 3, key: K(3) },
        { epoch: 2, key: K(2) },
      ],
    })
    expect(
      verifyCandidate({
        spaceId,
        candidate: { epoch: 2, key: K(2) },
        trusted: trustedOnly(),
        links: [],
        own: [ownRecord(2, K(2))],
        member: me,
      })
    ).toEqual({ status: 'trusted', keys: [{ epoch: 2, key: K(2) }] })
  })

  it('finds a planted key that leads to another key than the trusted one, at the epoch where they differ', () => {
    const planted = random(32)
    expect(
      verifyCandidate({
        spaceId,
        candidate: { epoch: 2, key: planted },
        trusted: trustedOnly({ epoch: 1, key: K(1) }),
        links: [link(2, random(32), 2, planted)],
        own: [],
        member: me,
      })
    ).toEqual({ status: 'mismatch', epoch: 1 })
  })

  it('vouches through the last version of the User’s record that matched when the newest doesn’t', () => {
    const newest = { ...ownRecord(2, K(2)), stamp: 9, blob: 'AQ' }
    expect(
      verifyCandidate({
        spaceId,
        candidate: { epoch: 2, key: K(2) },
        trusted: trustedOnly(),
        links: [],
        own: [newest, ownRecord(2, K(2))],
        member: me,
      })
    ).toEqual({ status: 'trusted', keys: [{ epoch: 2, key: K(2) }] })
  })

  it('leaves a key nothing vouches for unverified', () => {
    const planted = random(32)
    const earlier = random(32)

    const forged = [
      link(2, earlier, 2, planted),
      link(3, planted, 3, random(32)),
    ]
    const verdict = verifyCandidate({
      spaceId,
      candidate: { epoch: 2, key: planted },
      trusted: trustedOnly(),
      links: forged,
      own: [
        memberRecord(me, 1, earlier, {
          ...profile,
          check: memberCheck(random(32), {
            spaceId,
            epoch: 1,
            spaceKey: earlier,
            ...profile,
          }),
        }),
      ],
      member: me,
    })
    expect(verdict).toEqual({ status: 'unverified' })

    expect(
      verifyCandidate({
        spaceId,
        candidate: { epoch: 3, key: K(3) },
        trusted: trustedOnly({ epoch: 1, key: K(1) }),
        links: [],
        own: [],
        member: me,
      })
    ).toEqual({ status: 'unverified' })

    expect(
      verifyCandidate({
        spaceId,
        candidate: { epoch: 2, key: K(2) },
        trusted: trustedOnly({ epoch: 1, key: K(1) }),
        links: [{ ...link(3, K(1), 2, K(2)) }],
        own: [],
        member: me,
      })
    ).toEqual({ status: 'unverified' })
  })
})
