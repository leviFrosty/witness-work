import { describe, expect, it } from 'vitest'
import { toB64u } from '@/lib/bytes'
import { deriveRecordKey } from '@/lib/sharedSpaces/crypto'
import {
  checkHandoffCreate,
  checkHandoffEnd,
  checkInviteDelete,
  checkLeave,
  checkLinkCreate,
  checkLinkEnd,
  checkMemberRemove,
  checkMemberScopes,
  checkShare,
  guestKeysRecordId,
  HEADER_RECORD_ID,
  inScopeRecordId,
  isScopedRecordId,
  mayReadRecord,
  mayWriteRecord,
  openRecordWithKey,
  parseScopedRecordId,
  type ScopedActor,
  type ScopedLink,
  type ScopedSpaceView,
  scopedRecordKey,
  scopedRoleOf,
  scopeOfRecordId,
  sealRecordWithKey,
  streetRecordId,
  territoryWideRecordId,
  workedRecordId,
} from '@/lib/sharedSpaces/records'
import { deriveScopeKey } from '@/lib/sharedSpaces/scopes'

const id = (n: number) => toB64u(Uint8Array.from({ length: 16 }, () => n))
const uuid = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a'

const [O, W, P, H, Q, X] = [1, 2, 3, 4, 5, 6].map(id)
const [S1, S2, S3, S4] = [11, 12, 13, 14].map(id)
const [I1, I2] = [21, 22].map(id)
const NOW = 1_800_000_000_000

const link = (
  linkId: string,
  createdBy: string,
  scopes: string[]
): ScopedLink => ({
  linkId,
  createdBy,
  scopes,
  expiresAt: NOW + 1000,
  endedAt: null,
})
const LO = link(id(31), O, [S1])
const LH = link(id(32), H, [S2])
const LOH = link(id(33), O, [S2])

const view: ScopedSpaceView = {
  ownerId: O,
  members: [
    { memberId: O, scopes: null, invitedBy: null },
    { memberId: W, scopes: null, invitedBy: O },
    { memberId: P, scopes: [S1], invitedBy: O },
    { memberId: H, scopes: [S2], invitedBy: O },
    { memberId: Q, scopes: [S2], invitedBy: H },
  ],
  invites: [
    { inviteId: I1, invitedBy: O, scopes: [S3], handoff: true },
    { inviteId: I2, invitedBy: H, scopes: [S2], handoff: false },
  ],
  holders: [
    { scopeId: S2, memberId: H, inviteId: null },
    { scopeId: S3, memberId: null, inviteId: I1 },
  ],
  links: [LO, LH, LOH],
}

const access = (actor: ScopedActor, recordId: string) =>
  (mayReadRecord(view, actor, recordId) ? 'r' : '') +
  (mayWriteRecord(view, actor, recordId) ? 'w' : '')

function table(recordId: string) {
  return {
    O: access({ memberId: O }, recordId),
    W: access({ memberId: W }, recordId),
    P: access({ memberId: P }, recordId),
    H: access({ memberId: H }, recordId),
    Q: access({ memberId: Q }, recordId),
    X: access({ memberId: X }, recordId),
    LO: access({ guest: LO }, recordId),
    LH: access({ guest: LH }, recordId),
    LOH: access({ guest: LOH }, recordId),
  }
}

describe('scoped record ids', () => {
  it('build and read every kind in the grammar', () => {
    expect(parseScopedRecordId(HEADER_RECORD_ID)).toEqual({ class: 'header' })
    expect(parseScopedRecordId(streetRecordId(S1))).toEqual({
      class: 'street',
      scopeId: S1,
    })
    expect(parseScopedRecordId(workedRecordId(S1))).toEqual({
      class: 'worked',
      scopeId: S1,
    })
    expect(parseScopedRecordId(inScopeRecordId(S1, uuid))).toEqual({
      class: 'inScope',
      scopeId: S1,
      id: uuid,
    })
    expect(parseScopedRecordId(territoryWideRecordId(uuid))).toEqual({
      class: 'territoryWide',
      id: uuid,
    })
    expect(parseScopedRecordId(`m.${O}`)).toEqual({
      class: 'member',
      memberId: O,
    })
    expect(parseScopedRecordId(`i.${I1}`)).toEqual({
      class: 'invite',
      inviteId: I1,
    })
    expect(parseScopedRecordId('k.12')).toEqual({ class: 'keys', epoch: 12 })
    expect(parseScopedRecordId(guestKeysRecordId(LO.linkId))).toEqual({
      class: 'linkKeys',
      linkId: LO.linkId,
    })
    expect(inScopeRecordId(S1, uuid)).toHaveLength(61)
  })

  it('refuse ids outside the grammar', () => {
    for (const recordId of [
      '',
      'trip-1',
      `s.${S1}.x`,
      `s.${S1}.${uuid.toUpperCase()}`,
      `s.${S1}.${uuid}.w`,
      `d.${S1}`,
      'k.0',
      'k.1234567890',
      `m.${O}x`,
      `x.${O}`,
      'hh',
    ])
      expect(isScopedRecordId(recordId), recordId).toBe(false)
    expect(() => inScopeRecordId(S1, uuid.toUpperCase())).toThrow()
    expect(() => streetRecordId('bad')).toThrow()
    expect(() => guestKeysRecordId('bad')).toThrow()
  })

  it('name the scope a record lives in', () => {
    expect(scopeOfRecordId(inScopeRecordId(S2, uuid))).toBe(S2)
    expect(scopeOfRecordId(streetRecordId(S2))).toBe(S2)
    expect(scopeOfRecordId(HEADER_RECORD_ID)).toBeNull()
    expect(scopeOfRecordId(territoryWideRecordId(uuid))).toBeNull()
  })

  it('seal street records under the scope key and the rest under the record key', () => {
    const spaceKey = Uint8Array.from({ length: 32 }, (_, i) => i)
    expect(scopedRecordKey(spaceKey, workedRecordId(S1))).toBe(
      deriveScopeKey(spaceKey, S1)
    )
    expect(toB64u(scopedRecordKey(spaceKey, HEADER_RECORD_ID))).toBe(
      toB64u(deriveRecordKey(spaceKey))
    )
    expect(() =>
      scopedRecordKey(spaceKey, guestKeysRecordId(LO.linkId))
    ).toThrow()

    const address = {
      spaceId: id(40),
      epoch: 1,
      recordId: workedRecordId(S1),
      deleted: false,
      stamp: NOW,
    }
    const key = scopedRecordKey(spaceKey, address.recordId)
    const blob = sealRecordWithKey(
      key,
      address,
      { kind: 'worked', data: { at: NOW, by: O } },
      new Uint8Array(24)
    )
    expect(openRecordWithKey(key, address, blob).data).toEqual({
      at: NOW,
      by: O,
    })
    expect(() =>
      sealRecordWithKey(
        key,
        address,
        { kind: 'door', data: { label: 'x'.repeat(5000) } },
        new Uint8Array(24),
        4096
      )
    ).toThrow('Record too large')
  })
})

describe('who reads and writes which records', () => {
  it('the header: everyone reads, the owner writes, guests never', () => {
    expect(table(HEADER_RECORD_ID)).toEqual({
      O: 'rw',
      W: 'r',
      P: 'r',
      H: 'r',
      Q: 'r',
      X: '',
      LO: '',
      LH: '',
      LOH: '',
    })
  })

  it('an unheld street: the owner, whole and its street members; its links read and write all but the bare street', () => {
    expect(table(workedRecordId(S1))).toEqual({
      O: 'rw',
      W: 'rw',
      P: 'rw',
      H: '',
      Q: '',
      X: '',
      LO: 'rw',
      LH: '',
      LOH: '',
    })
    expect(table(streetRecordId(S1)).LO).toBe('r')
    expect(table(inScopeRecordId(S1, uuid)).LO).toBe('rw')
  })

  it('a held street: the holder and their onward people write; the owner, whole members and the owner’s links read or lose it', () => {
    expect(table(inScopeRecordId(S2, uuid))).toEqual({
      O: 'r',
      W: 'r',
      P: '',
      H: 'rw',
      Q: 'rw',
      X: '',
      LO: '',
      LH: 'rw',
      LOH: '',
    })
  })

  it('a street waiting on a hand-off invite: nobody writes', () => {
    expect(table(workedRecordId(S3))).toEqual({
      O: 'r',
      W: 'r',
      P: '',
      H: '',
      Q: '',
      X: '',
      LO: '',
      LH: '',
      LOH: '',
    })
  })

  it('territory-wide do-not-calls: the owner and whole members', () => {
    expect(table(territoryWideRecordId(uuid))).toEqual({
      O: 'rw',
      W: 'rw',
      P: '',
      H: '',
      Q: '',
      X: '',
      LO: '',
      LH: '',
      LOH: '',
    })
  })

  it('member records: everyone reads, each writes their own', () => {
    expect(table(`m.${Q}`)).toEqual({
      O: 'r',
      W: 'r',
      P: 'r',
      H: 'r',
      Q: 'rw',
      X: '',
      LO: '',
      LH: '',
      LOH: '',
    })
  })

  it('invite records: the owner all, whole members read, holders their own', () => {
    expect(table(`i.${I1}`)).toMatchObject({
      O: 'rw',
      W: 'r',
      P: '',
      H: '',
      Q: '',
      LO: '',
    })
    expect(table(`i.${I2}`)).toMatchObject({
      O: 'rw',
      W: 'r',
      P: '',
      H: 'rw',
      Q: '',
    })
  })

  it('an invite record the view no longer lists is written only by the owner', () => {
    expect(table(`i.${id(29)}`)).toMatchObject({
      O: 'rw',
      W: 'r',
      P: '',
      H: '',
      Q: '',
    })
  })

  it('the key chain: everyone reads, the owner writes', () => {
    expect(table('k.2')).toMatchObject({
      O: 'rw',
      W: 'r',
      P: 'r',
      H: 'r',
      Q: 'r',
      LO: '',
    })
  })

  it('link keys: the creator writes, the owner and whole members read, its guest reads', () => {
    expect(table(`g.${LO.linkId}`)).toEqual({
      O: 'rw',
      W: 'r',
      P: '',
      H: '',
      Q: '',
      X: '',
      LO: 'r',
      LH: '',
      LOH: '',
    })
    expect(table(`g.${LH.linkId}`)).toMatchObject({
      O: 'r',
      W: 'r',
      H: 'rw',
      Q: '',
      LH: 'r',
    })
  })

  it('nothing outside the grammar', () => {
    expect(table('trip-1')).toMatchObject({ O: '', LO: '' })
  })
})

describe('who may run which op', () => {
  it('names each role', () => {
    expect([O, W, P, H, Q, X].map((m) => scopedRoleOf(view, m))).toEqual([
      'owner',
      'whole',
      'street',
      'street',
      'onward',
      null,
    ])
  })

  it('shares: the owner the whole or unheld streets, a holder only their streets', () => {
    const share = (memberId: string, scopes: string[] | null) =>
      checkShare(view, memberId, { scopes })
    expect(share(O, null)).toBe('ok')
    expect(share(O, [S1, S4])).toBe('ok')
    expect(share(O, [S1, S2])).toBe('forbidden')
    expect(share(O, [S3])).toBe('forbidden')
    expect(share(H, [S2])).toBe('ok')
    expect(share(H, null)).toBe('forbidden')
    expect(share(H, [S1])).toBe('forbidden')
    for (const memberId of [W, P, Q, X])
      expect(share(memberId, [S1])).toBe('forbidden')
    expect(share(O, [])).toBe('bad_request')
    expect(share(O, [S1, S1])).toBe('bad_request')
    expect(share(O, ['bad'])).toBe('bad_request')
  })

  it('hand-off invites: only the owner, one unheld street; never a holder', () => {
    const handoff = (memberId: string, scopes: string[] | null) =>
      checkShare(view, memberId, { scopes, handoff: true })
    expect(handoff(O, [S1])).toBe('ok')
    expect(handoff(O, [S2])).toBe('conflict')
    expect(handoff(O, [S3])).toBe('conflict')
    expect(handoff(H, [S2])).toBe('forbidden')
    expect(handoff(W, [S1])).toBe('forbidden')
    expect(handoff(O, [S1, S4])).toBe('bad_request')
    expect(handoff(O, null)).toBe('bad_request')
  })

  it('hand-off to a member: only the owner, an unheld street, a member who isn’t the owner', () => {
    expect(checkHandoffCreate(view, O, { scopeId: S1, target: P })).toBe('ok')
    expect(checkHandoffCreate(view, O, { scopeId: S4, target: W })).toBe('ok')
    expect(checkHandoffCreate(view, O, { scopeId: S2, target: P })).toBe(
      'conflict'
    )
    expect(checkHandoffCreate(view, O, { scopeId: S3, target: P })).toBe(
      'conflict'
    )
    expect(checkHandoffCreate(view, H, { scopeId: S2, target: Q })).toBe(
      'forbidden'
    )
    expect(checkHandoffCreate(view, O, { scopeId: S1, target: O })).toBe(
      'bad_request'
    )
    expect(checkHandoffCreate(view, O, { scopeId: S1, target: X })).toBe(
      'conflict'
    )
  })

  it('take back and give back: the owner or the holder; an unheld street is always ok', () => {
    expect(checkHandoffEnd(view, O, S2)).toBe('ok')
    expect(checkHandoffEnd(view, H, S2)).toBe('ok')
    expect(checkHandoffEnd(view, Q, S2)).toBe('forbidden')
    expect(checkHandoffEnd(view, W, S2)).toBe('forbidden')
    expect(checkHandoffEnd(view, O, S3)).toBe('ok')
    expect(checkHandoffEnd(view, W, S3)).toBe('forbidden')
    expect(checkHandoffEnd(view, Q, S1)).toBe('ok')
  })

  it('changing a member’s streets: the owner, for people the owner invited, keeping their holds', () => {
    const scopes = (memberId: string, target: string, to: string[] | null) =>
      checkMemberScopes(view, memberId, { target, scopes: to })
    expect(scopes(O, P, [S1, S4])).toBe('ok')
    expect(scopes(O, P, null)).toBe('ok')
    expect(scopes(O, H, null)).toBe('ok')
    expect(scopes(O, H, [S1])).toBe('conflict')
    expect(scopes(O, P, [S2])).toBe('conflict')
    expect(scopes(O, P, [S3])).toBe('conflict')
    expect(scopes(O, Q, [S2])).toBe('forbidden')
    expect(scopes(O, O, [S1])).toBe('bad_request')
    expect(scopes(O, X, [S1])).toBe('conflict')
    expect(scopes(W, P, [S1])).toBe('forbidden')
    expect(scopes(O, P, [])).toBe('bad_request')
  })

  it('removing: the owner anyone else, a holder their onward people', () => {
    expect(checkMemberRemove(view, O, P)).toBe('ok')
    expect(checkMemberRemove(view, H, Q)).toBe('ok')
    expect(checkMemberRemove(view, H, P)).toBe('forbidden')
    expect(checkMemberRemove(view, W, P)).toBe('forbidden')
    expect(checkMemberRemove(view, O, O)).toBe('bad_request')
    expect(checkMemberRemove(view, H, X)).toBe('ok')
  })

  it('invites are deleted by the owner or their inviter', () => {
    expect(checkInviteDelete(view, O, I2)).toBe('ok')
    expect(checkInviteDelete(view, H, I2)).toBe('ok')
    expect(checkInviteDelete(view, H, I1)).toBe('forbidden')
    expect(checkInviteDelete(view, W, I1)).toBe('forbidden')
  })

  it('links: the owner on unheld streets, a holder on their streets', () => {
    expect(checkLinkCreate(view, O, [S1, S4])).toBe('ok')
    expect(checkLinkCreate(view, O, [S2])).toBe('forbidden')
    expect(checkLinkCreate(view, O, [S3])).toBe('forbidden')
    expect(checkLinkCreate(view, H, [S2])).toBe('ok')
    expect(checkLinkCreate(view, H, [S1])).toBe('forbidden')
    for (const memberId of [W, P, Q])
      expect(checkLinkCreate(view, memberId, [S1])).toBe('forbidden')
    expect(
      checkLinkCreate(
        view,
        O,
        Array.from({ length: 31 }, (_, n) => id(100 + n))
      )
    ).toBe('bad_request')
  })

  it('ending a link: its creator or the owner; unknown, ended or expired is ok', () => {
    expect(checkLinkEnd(view, O, LH.linkId, NOW)).toBe('ok')
    expect(checkLinkEnd(view, H, LH.linkId, NOW)).toBe('ok')
    expect(checkLinkEnd(view, H, LO.linkId, NOW)).toBe('forbidden')
    expect(checkLinkEnd(view, W, LO.linkId, NOW)).toBe('forbidden')
    expect(checkLinkEnd(view, W, id(99), NOW)).toBe('ok')
    expect(checkLinkEnd(view, W, LO.linkId, NOW + 1000)).toBe('ok')
  })

  it('leaving: everyone but the owner', () => {
    expect(checkLeave(view, O)).toBe('bad_request')
    expect(checkLeave(view, H)).toBe('ok')
  })
})
