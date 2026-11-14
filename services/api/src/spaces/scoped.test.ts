import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHarness, randomId, type Harness } from '../test/buddies'
import {
  SpaceMember,
  joinSecret,
  openLink,
  scopeId,
  spacesError,
  uuid,
} from '../test/spaces'
import { resetAccountStatusCache } from '../accounts/auth'
import { SPACES_LIMITS, classifyScopedRecord } from './contracts'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: DurableObjectState
    env: unknown
    constructor(ctx: DurableObjectState, env: unknown) {
      this.ctx = ctx
      this.env = env
    }
  },
}))

/**
 * Scoped spaces (Territories, witness-work ADR 0047,
 * `docs/territories-protocol.md`): the mode, the record id grammar, who
 * reads and writes which records, scoped invites and joins, hand-offs and
 * their ending, `member/scopes`, guest links as members manage them, and
 * the owner who never changes. Guests' own ops are in guest.test.ts. Spaces
 * without a mode are spaces.test.ts, records.test.ts, and live.test.ts,
 * unchanged.
 */

const START = Date.UTC(2026, 10, 11, 12)
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

let h: Harness

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
  resetAccountStatusCache()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)

/** An owner who made a territory's space. */
const territory = async (): Promise<SpaceMember> => {
  const owner = await SpaceMember.open(h.env)
  const created = await owner.create(undefined, { mode: 'scoped' })
  expect(created.body).toEqual({ ok: true, seq: 1, joinedAt: Date.now() })
  return owner
}

/** Someone who joins through `inviter`'s invite with `extra` (`scopes`, `handoff`). */
const joined = async (
  inviter: SpaceMember,
  extra: Record<string, unknown> = {}
): Promise<SpaceMember> => {
  advance(1_000)
  const member = await inviter.other()
  await member.joinVia(inviter, extra)
  return member
}

const recordIds = async (member: SpaceMember): Promise<string[]> => {
  const synced = await member.sync()
  expect(synced.status).toBe(200)
  return synced.body.records.map((record: { recordId: string }) => record.recordId).sort()
}

const putOne = async (member: SpaceMember, recordId: string) =>
  (await member.put([{ recordId }])).status

/**
 * A territory with every role: the owner O; W on the whole territory; P on
 * street S1; H holding S2 (through a hand-off invite); Q, whom H shared S2
 * with. S3 is shared with nobody. The owner seeded a record of every kind
 * first, and H made an invite and a link of their own, as did the owner.
 */
const everyRole = async () => {
  const [S1, S2, S3] = [scopeId(), scopeId(), scopeId()]
  const O = await territory()
  const ids = {
    h: 'h',
    s1: `s.${S1}`,
    s1w: `s.${S1}.w`,
    s1door: `s.${S1}.${uuid()}`,
    s2: `s.${S2}`,
    s2door: `s.${S2}.${uuid()}`,
    s3: `s.${S3}`,
    s3door: `s.${S3}.${uuid()}`,
    d: `d.${uuid()}`,
    k: 'k.2',
  }
  expect(
    (await O.put(Object.values(ids).map((recordId) => ({ recordId })))).status
  ).toBe(200)
  const W = await joined(O)
  const P = await joined(O, { scopes: [S1] })
  const H = await joined(O, { scopes: [S2], handoff: true })
  const Q = await joined(H, { scopes: [S2] })
  const ownerInvite = await O.invite({}, { scopes: [S3] })
  const holderInvite = await H.invite({}, { scopes: [S2] })
  const ownerLink = await openLink(O, [S1])
  const holderLink = await openLink(H, [S2])
  const extra = {
    iO: `i.${ownerInvite.inviteId}`,
    iH: `i.${holderInvite.inviteId}`,
    gO: `g.${ownerLink.linkId}`,
    gH: `g.${holderLink.linkId}`,
  }
  expect((await O.put([{ recordId: extra.iO }, { recordId: extra.gO }])).status).toBe(200)
  expect((await H.put([{ recordId: extra.iH }, { recordId: extra.gH }])).status).toBe(200)
  for (const member of [O, W, P, H, Q])
    expect((await member.put([{ recordId: `m.${member.memberId}` }])).status).toBe(200)
  return {
    S1,
    S2,
    S3,
    O,
    W,
    P,
    H,
    Q,
    ids: { ...ids, ...extra },
    ownerInvite,
    holderInvite,
    ownerLink,
    holderLink,
  }
}

describe('create', () => {
  it('makes a scoped space whose sync names its mode, members’ streets, holders, and links', async () => {
    const owner = await territory()
    expect((await owner.sync()).body).toEqual({
      ok: true,
      seq: 1,
      epoch: 1,
      wrap: expect.any(String),
      ownerId: owner.memberId,
      members: [
        {
          memberId: owner.memberId,
          dhPub: owner.dhPub,
          joinedAt: START,
          scopes: null,
          invitedBy: null,
        },
      ],
      invites: [],
      rekeyNeeded: false,
      records: [],
      more: false,
      mode: 'scoped',
      holders: [],
      links: [],
    })
  })

  it('takes the mode as part of an identical retry, and refuses an unknown one', async () => {
    const owner = await territory()
    expect((await owner.create(undefined, { mode: 'scoped' })).body).toEqual({
      ok: true,
      seq: 1,
      joinedAt: START,
    })
    expect((await owner.create()).body).toEqual(spacesError('conflict'))
    const other = await SpaceMember.open(h.env)
    expect((await other.create(undefined, { mode: 'streets' })).body).toEqual(
      spacesError('bad_request')
    )
    // And a car's space retried as a territory is a conflict too.
    const car = await SpaceMember.open(h.env)
    expect((await car.create()).status).toBe(200)
    expect((await car.create(undefined, { mode: 'scoped' })).body).toEqual(
      spacesError('conflict')
    )
  })
})

describe('spaces without a mode', () => {
  it('refuse scopes, hand-offs, and the territory ops with bad_request', async () => {
    const owner = await SpaceMember.open(h.env)
    await owner.create()
    const member = await owner.other()
    await member.joinVia(owner)
    const S = scopeId()
    expect((await owner.invite({}, { scopes: [S] })).response.body).toEqual(
      spacesError('bad_request')
    )
    expect((await owner.invite({}, { handoff: false })).response.body).toEqual(
      spacesError('bad_request')
    )
    for (const [op, body] of [
      ['member/scopes', { target: member.memberId, scopes: [S] }],
      ['handoff/create', { scopeId: S, target: member.memberId }],
      ['handoff/end', { scopeId: S }],
      ['link/end', { linkId: randomId() }],
      ['link/expiry', { linkId: randomId(), expiresAt: Date.now() + DAY }],
    ] as const)
      expect((await owner.send(op, { ...owner.fields, ...body })).body, op).toEqual(
        spacesError('bad_request')
      )
    expect((await openLink(owner, [S])).response.body).toEqual(spacesError('bad_request'))
    // Their record ids stay free-form, and the owner still passes on.
    expect((await owner.put([{ recordId: 'trip-1' }])).status).toBe(200)
    expect((await owner.leave()).status).toBe(200)
    expect((await member.sync()).body.ownerId).toBe(member.memberId)
  })
})

describe('record ids', () => {
  it('classifies the grammar', () => {
    const S = scopeId()
    const id = uuid()
    expect(classifyScopedRecord('h')).toEqual({ kind: 'header' })
    expect(classifyScopedRecord(`s.${S}`)).toEqual({ kind: 'street', scope: S })
    expect(classifyScopedRecord(`s.${S}.w`)).toEqual({ kind: 'inScope', scope: S })
    expect(classifyScopedRecord(`s.${S}.${id}`)).toEqual({ kind: 'inScope', scope: S })
    expect(classifyScopedRecord(`d.${id}`)).toEqual({ kind: 'territory' })
    expect(classifyScopedRecord(`m.${S}`)).toEqual({ kind: 'member', id: S })
    expect(classifyScopedRecord(`i.${S}`)).toEqual({ kind: 'invite', id: S })
    expect(classifyScopedRecord(`g.${S}`)).toEqual({ kind: 'linkKeys', id: S })
    expect(classifyScopedRecord('k.12')).toEqual({ kind: 'keys' })
    for (const bad of [
      'trip-1',
      'x',
      'hh',
      `s.${S}.x`,
      `s.${S.slice(1)}`,
      `s.${S}.${id.toUpperCase()}`,
      `d.${S}`,
      'k.0',
      'k.01',
      `m.${S}.w`,
      `t.${S}`,
    ])
      expect(classifyScopedRecord(bad), bad).toBeNull()
  })

  it('refuses a put naming any id outside the grammar, storing nothing', async () => {
    const owner = await territory()
    const put = await owner.put([{ recordId: 'h' }, { recordId: 'trip-1' }])
    expect(put).toMatchObject({ status: 400, body: spacesError('bad_request') })
    expect(await recordIds(owner)).toEqual([])
  })
})

describe('who writes which records', () => {
  it('follows the protocol’s table, cell by cell', async () => {
    const t = await everyRole()
    const { O, W, P, H, Q, ids } = t
    const others = (member: SpaceMember) => [O, W, P, H, Q].find((m) => m !== member)!
    const table: Record<string, [string, boolean, boolean, boolean, boolean, boolean]> = {
      // id, then           O      W      P      H      Q
      header: [ids.h, true, false, false, false, false],
      'unheld street S1, P’s': [ids.s1, true, true, true, false, false],
      'a record in S1': [ids.s1w, true, true, true, false, false],
      'held street S2': [ids.s2, false, false, false, true, true],
      'a door in S2': [ids.s2door, false, false, false, true, true],
      'unshared street S3': [ids.s3door, true, true, false, false, false],
      'territory-wide do-not-call': [ids.d, true, true, false, false, false],
      'key chain': [ids.k, true, false, false, false, false],
      'the owner’s invite': [ids.iO, true, false, false, false, false],
      'the holder’s invite': [ids.iH, true, false, false, true, false],
      'the owner’s link': [ids.gO, true, false, false, false, false],
      'the holder’s link': [ids.gH, false, false, false, true, false],
    }
    for (const [cell, [recordId, ...allowed]] of Object.entries(table))
      for (const [index, member] of [O, W, P, H, Q].entries())
        expect(await putOne(member, recordId), `${cell} by ${'OWPHQ'[index]}`).toBe(
          allowed[index] ? 200 : 403
        )
    // Each writes their own member record, and no one else’s.
    for (const member of [O, W, P, H, Q]) {
      expect(await putOne(member, `m.${member.memberId}`)).toBe(200)
      expect(await putOne(member, `m.${others(member).memberId}`)).toBe(403)
    }
    // A street nobody shared is still the owner’s and whole members’ to make.
    expect(await putOne(O, `s.${scopeId()}.w`)).toBe(200)
    expect(await putOne(P, `s.${scopeId()}.w`)).toBe(403)
  })

  it('refuses a whole put when any record is forbidden, before stale_key', async () => {
    const { P, ids } = await everyRole()
    const put = await P.put([
      { recordId: ids.s1w },
      { recordId: ids.s2door, epoch: 9 },
    ])
    expect(put).toMatchObject({ status: 403, body: spacesError('forbidden') })
    expect((await P.put([{ recordId: ids.s1w, epoch: 9 }])).body).toEqual(
      spacesError('stale_key')
    )
  })
})

describe('who reads which records', () => {
  it('follows the protocol’s table, cell by cell', async () => {
    const t = await everyRole()
    const { O, W, P, H, Q, ids } = t
    const members = [O, W, P, H, Q].map((m) => `m.${m.memberId}`)
    const everything = Object.values(ids).concat(members).sort()
    expect(await recordIds(O)).toEqual(everything)
    expect(await recordIds(W)).toEqual(everything)
    expect(await recordIds(P)).toEqual(
      [ids.h, ids.s1, ids.s1w, ids.s1door, ids.k, ...members].sort()
    )
    expect(await recordIds(H)).toEqual(
      [ids.h, ids.s2, ids.s2door, ids.k, ids.iH, ids.gH, ...members].sort()
    )
    expect(await recordIds(Q)).toEqual(
      [ids.h, ids.s2, ids.s2door, ids.k, ...members].sort()
    )
  })

  it('pages by records returned, and ends at the head past unread ones', async () => {
    const S1 = scopeId()
    const S2 = scopeId()
    const O = await territory()
    // Interleave: P reads every other record.
    for (let i = 0; i < 6; i++)
      await O.put([{ recordId: `s.${S1}.${uuid()}` }, { recordId: `s.${S2}.${uuid()}` }])
    const P = await joined(O, { scopes: [S1] })
    const first = await P.sync(0, { limit: 4 })
    expect(first.body.records).toHaveLength(4)
    expect(first.body.more).toBe(true)
    expect(first.body.seq).toBe(first.body.records[3].seq)
    const second = await P.sync(first.body.seq, { limit: 4 })
    expect(second.body.records).toHaveLength(2)
    expect(second.body.more).toBe(false)
    expect(second.body.seq).toBe((await O.sync()).body.seq)
    for (const record of [...first.body.records, ...second.body.records])
      expect(record.recordId.startsWith(`s.${S1}.`)).toBe(true)
  })

  it('lists invites and links whole for the owner and whole members, and only their own for others', async () => {
    const t = await everyRole()
    const { O, W, P, H, Q } = t
    const listed = async (member: SpaceMember) => {
      const body = (await member.sync()).body
      return {
        invites: body.invites.map((invite: { inviteId: string }) => invite.inviteId).sort(),
        links: body.links.map((link: { linkId: string }) => link.linkId).sort(),
        holders: body.holders,
        members: body.members.length,
      }
    }
    const allInvites = [t.ownerInvite.inviteId, t.holderInvite.inviteId].sort()
    const allLinks = [t.ownerLink.linkId, t.holderLink.linkId].sort()
    const holders = [{ scopeId: t.S2, memberId: H.memberId, inviteId: null, since: expect.any(Number) }]
    for (const member of [O, W])
      expect(await listed(member)).toEqual({ invites: allInvites, links: allLinks, holders, members: 5 })
    expect(await listed(P)).toEqual({ invites: [], links: [], holders, members: 5 })
    expect(await listed(H)).toEqual({
      invites: [t.holderInvite.inviteId],
      links: [t.holderLink.linkId],
      holders,
      members: 5,
    })
    expect(await listed(Q)).toEqual({ invites: [], links: [], holders, members: 5 })
    const body = (await O.sync()).body
    expect(body.members.find((m: { memberId: string }) => m.memberId === Q.memberId)).toMatchObject({
      scopes: [t.S2],
      invitedBy: H.memberId,
    })
    expect(body.invites.find((i: { inviteId: string }) => i.inviteId === t.ownerInvite.inviteId)).toMatchObject({
      scopes: [t.S3],
      handoff: false,
    })
    expect(body.links.find((l: { linkId: string }) => l.linkId === t.holderLink.linkId)).toEqual({
      linkId: t.holderLink.linkId,
      createdBy: H.memberId,
      scopes: [t.S2],
      createdAt: expect.any(Number),
      expiresAt: t.holderLink.expiresAt,
      endedAt: null,
    })
  })
})

describe('invites and joins', () => {
  it('lets only the owner and holders invite, holders only to streets they hold', async () => {
    const t = await everyRole()
    const { O, W, P, H, Q, S1, S2, S3 } = t
    for (const member of [W, P, Q]) {
      expect((await member.invite()).response.body).toEqual(spacesError('forbidden'))
      expect((await member.invite({}, { scopes: [S1] })).response.body).toEqual(
        spacesError('forbidden')
      )
    }
    expect((await H.invite()).response.body).toEqual(spacesError('forbidden'))
    expect((await H.invite({}, { scopes: [S1] })).response.body).toEqual(spacesError('forbidden'))
    expect((await H.invite({}, { scopes: [S2, S3] })).response.body).toEqual(
      spacesError('forbidden')
    )
    // Forbidden comes before stale_key.
    expect((await W.invite({ epoch: 5 })).response.body).toEqual(spacesError('forbidden'))
    expect((await O.invite({ epoch: 5 })).response.body).toEqual(spacesError('stale_key'))
    // The owner shares unheld streets, never a held one.
    expect((await O.invite({}, { scopes: [S1, S3] })).response.status).toBe(200)
    expect((await O.invite({}, { scopes: [S1, S2] })).response.body).toEqual(
      spacesError('forbidden')
    )
  })

  it('takes an identical retry, scopes and hand-off included, and refuses any other reuse', async () => {
    const owner = await territory()
    const S = scopeId()
    const invite = await owner.invite({}, { scopes: [S], handoff: true })
    expect(invite.response.status).toBe(200)
    expect((await owner.invite(invite, { scopes: [S], handoff: true })).response.status).toBe(200)
    expect((await owner.invite(invite, { scopes: [S] })).response.body).toEqual(
      spacesError('conflict')
    )
    expect((await owner.invite(invite, { scopes: [scopeId()], handoff: true })).response.body).toEqual(
      spacesError('conflict')
    )
  })

  it('checks scopes and hand-off fields', async () => {
    const owner = await territory()
    const S = scopeId()
    for (const extra of [
      { scopes: [] },
      { scopes: [S, S] },
      { scopes: ['short'] },
      { scopes: Array.from({ length: SPACES_LIMITS.scopesPerGrant + 1 }, () => scopeId()) },
      { handoff: true },
      { scopes: [S, scopeId()], handoff: true },
      { handoff: 'yes' },
    ])
      expect((await owner.invite({}, extra)).response.body, JSON.stringify(extra).slice(0, 40)).toEqual(
        spacesError('bad_request')
      )
    const hundred = Array.from({ length: SPACES_LIMITS.scopesPerGrant }, () => scopeId())
    expect((await owner.invite({}, { scopes: hundred })).response.status).toBe(200)
  })

  it('gives the member who joins the invite’s streets and inviter', async () => {
    const owner = await territory()
    const S = scopeId()
    const P = await joined(owner, { scopes: [S] })
    const W = await joined(owner)
    const members = (await owner.sync()).body.members
    expect(members.slice(1)).toEqual([
      { memberId: P.memberId, dhPub: P.dhPub, joinedAt: expect.any(Number), scopes: [S], invitedBy: owner.memberId },
      { memberId: W.memberId, dhPub: W.dhPub, joinedAt: expect.any(Number), scopes: null, invitedBy: owner.memberId },
    ])
  })

  it('holds members, open invites, and holders’ onward members to the cap together', async () => {
    await h.kv.put('spaces:maxMembers', '4')
    const owner = await territory()
    const S = scopeId()
    const H = await joined(owner, { scopes: [S], handoff: true })
    await joined(H, { scopes: [S] })
    expect((await H.invite({}, { scopes: [S] })).response.status).toBe(200)
    expect((await owner.invite()).response.body).toEqual(spacesError('limit'))
    expect((await H.invite({}, { scopes: [S] })).response.body).toEqual(spacesError('limit'))
  })
})

describe('hand-offs', () => {
  it('holds the street by the invite until it’s answered: nobody writes it, the owner’s links stop', async () => {
    const owner = await territory()
    const S = scopeId()
    expect(await putOne(owner, `s.${S}`)).toBe(200)
    const invite = await owner.invite({}, { scopes: [S], handoff: true })
    expect((await owner.sync()).body.holders).toEqual([
      { scopeId: S, memberId: null, inviteId: invite.inviteId, since: START },
    ])
    expect(await putOne(owner, `s.${S}.w`)).toBe(403)
    expect((await openLink(owner, [S])).response.body).toEqual(spacesError('forbidden'))
    // A second hand-off of it, or another invite naming it.
    expect((await owner.invite({}, { scopes: [S], handoff: true })).response.body).toEqual(
      spacesError('conflict')
    )
    expect((await owner.invite({}, { scopes: [S] })).response.body).toEqual(spacesError('forbidden'))
    // Joining makes the holder, with just that street.
    const joe = await owner.other()
    expect((await joe.join(invite)).status).toBe(200)
    const body = (await owner.sync()).body
    expect(body.holders).toEqual([
      { scopeId: S, memberId: joe.memberId, inviteId: null, since: START },
    ])
    expect(body.members.find((m: { memberId: string }) => m.memberId === joe.memberId)).toMatchObject({
      scopes: [S],
      invitedBy: owner.memberId,
    })
    expect(await putOne(joe, `s.${S}.w`)).toBe(200)
    expect(await putOne(owner, `s.${S}.w`)).toBe(403)
    // The owner still reads it.
    expect(await recordIds(owner)).toContain(`s.${S}.w`)
  })

  it('clears a pending hold when its invite is deleted, expires, burns, or a rekey closes it', async () => {
    const owner = await territory()
    const S = scopeId()
    const holders = async () => (await owner.sync()).body.holders

    const deleted = await owner.invite({}, { scopes: [S], handoff: true })
    expect((await owner.deleteInvite(deleted.inviteId)).status).toBe(200)
    expect(await holders()).toEqual([])

    const expiring = await owner.invite({ expiresAt: Date.now() + HOUR }, { scopes: [S], handoff: true })
    const before = (await owner.sync()).body.seq
    advance(HOUR)
    const after = (await owner.sync()).body
    expect(after.holders).toEqual([])
    expect(after.seq).toBe(before + 1)
    expect((await (await owner.other()).join(expiring)).body).toEqual(spacesError('not_found'))

    const burned = await owner.invite({}, { scopes: [S], handoff: true })
    const stranger = await owner.other()
    for (let i = 0; i < SPACES_LIMITS.badJoins; i++)
      expect(
        (await stranger.join({ ...burned, joinSecret: (await joinSecret()).joinSecret })).status
      ).toBe(403)
    expect(await holders()).toEqual([])

    await owner.invite({}, { scopes: [S], handoff: true })
    expect(await holders()).toHaveLength(1)
    expect((await owner.rekey(2, [owner])).status).toBe(200)
    expect(await holders()).toEqual([])
    expect(await putOne(owner, `s.${S}.w`)).toBe(200)
  })

  it('hands a street to someone already on it; a street member gains it', async () => {
    const owner = await territory()
    const [S1, S2] = [scopeId(), scopeId()]
    const P = await joined(owner, { scopes: [S1] })
    const W = await joined(owner)
    const handoff = (scope: string, target: string, by = owner) =>
      by.send('handoff/create', { ...by.fields, scopeId: scope, target })
    expect((await handoff(S2, P.memberId)).body).toEqual({ ok: true, seq: expect.any(Number) })
    expect((await handoff(S1, W.memberId)).status).toBe(200)
    const body = (await owner.sync()).body
    expect(body.members.find((m: { memberId: string }) => m.memberId === P.memberId).scopes).toEqual([S1, S2])
    expect(body.members.find((m: { memberId: string }) => m.memberId === W.memberId).scopes).toBeNull()
    expect(body.holders.map((hold: { scopeId: string; memberId: string }) => [hold.scopeId, hold.memberId]).sort()).toEqual(
      [[S1, W.memberId], [S2, P.memberId]].sort()
    )
    // P no longer writes S1 (W holds it), and writes S2.
    expect(await putOne(P, `s.${S1}.w`)).toBe(403)
    expect(await putOne(P, `s.${S2}.w`)).toBe(200)
    // Already held, to the owner, to nobody on the space.
    expect((await handoff(S2, W.memberId)).body).toEqual(spacesError('conflict'))
    expect((await handoff(scopeId(), owner.memberId)).body).toEqual(spacesError('bad_request'))
    expect((await handoff(scopeId(), randomId())).body).toEqual(spacesError('conflict'))
  })

  it('never lets a holder hand a street on, whichever way they try', async () => {
    const owner = await territory()
    const [S, T] = [scopeId(), scopeId()]
    const H = await joined(owner, { scopes: [S], handoff: true })
    const Q = await joined(H, { scopes: [S] })
    // As a hand-off invite …
    expect((await H.invite({}, { scopes: [S], handoff: true })).response.body).toEqual(
      spacesError('forbidden')
    )
    expect((await H.invite({}, { scopes: [T], handoff: true })).response.body).toEqual(
      spacesError('forbidden')
    )
    // … or to someone on the territory, their own onward member included.
    for (const [scope, target] of [
      [S, Q.memberId],
      [T, Q.memberId],
      [S, owner.memberId],
    ])
      expect(
        (await H.send('handoff/create', { ...H.fields, scopeId: scope, target })).body
      ).toEqual(spacesError('forbidden'))
    // Nor through anyone else they could get the street to.
    expect(
      (await Q.send('handoff/create', { ...Q.fields, scopeId: S, target: H.memberId })).body
    ).toEqual(spacesError('forbidden'))
    expect((await Q.invite({}, { scopes: [S], handoff: true })).response.body).toEqual(
      spacesError('forbidden')
    )
    expect((await owner.sync()).body.holders).toEqual([
      { scopeId: S, memberId: H.memberId, inviteId: null, since: expect.any(Number) },
    ])
  })

  it('lets the holder share onward and make links on their streets only', async () => {
    const owner = await territory()
    const [S, T] = [scopeId(), scopeId()]
    const H = await joined(owner, { scopes: [S], handoff: true })
    expect((await H.invite({}, { scopes: [S] })).response.status).toBe(200)
    expect((await openLink(H, [S])).response.status).toBe(200)
    expect((await openLink(H, [S, T])).response.body).toEqual(spacesError('forbidden'))
    expect((await openLink(H, [T])).response.body).toEqual(spacesError('forbidden'))
  })
})

describe('handoff/end', () => {
  /**
   * H holds S and T (a hand-off invite, then `handoff/create`); Q1 has S,
   * Q2 has S and T, both from H; H has a link on S, one on T, and an open
   * invite naming S; the owner has an open invite of their own.
   */
  const handedOff = async () => {
    const owner = await territory()
    const [S, T] = [scopeId(), scopeId()]
    const H = await joined(owner, { scopes: [S], handoff: true })
    expect(
      (await owner.send('handoff/create', { ...owner.fields, scopeId: T, target: H.memberId })).status
    ).toBe(200)
    const Q1 = await joined(H, { scopes: [S] })
    const Q2 = await joined(H, { scopes: [S, T] })
    const linkS = await openLink(H, [S])
    const linkT = await openLink(H, [T])
    const holderInvite = await H.invite({}, { scopes: [S] })
    const ownerInvite = await owner.invite()
    return { owner, S, T, H, Q1, Q2, linkS, linkT, holderInvite, ownerInvite }
  }

  it('takes a street back in one step, with each of its effects', async () => {
    const t = await handedOff()
    const { owner, S, T, H, Q1, Q2 } = t
    const ended = await owner.send('handoff/end', { ...owner.fields, scopeId: S })
    expect(ended.body).toEqual({ ok: true, seq: expect.any(Number) })
    const body = (await owner.sync()).body
    // 1. The hold clears.
    expect(body.holders.map((hold: { scopeId: string }) => hold.scopeId)).toEqual([T])
    // 2. S leaves the holder and their people; Q1 had only S and is removed.
    const scopesOf = (id: string) =>
      body.members.find((m: { memberId: string }) => m.memberId === id)?.scopes
    expect(scopesOf(H.memberId)).toEqual([T])
    expect(scopesOf(Q2.memberId)).toEqual([T])
    expect(scopesOf(Q1.memberId)).toBeUndefined()
    expect((await Q1.sync()).body).toEqual(spacesError('gone'))
    // 3. The holder’s links on S end; the one on T doesn’t.
    const link = (id: string) => body.links.find((l: { linkId: string }) => l.linkId === id)
    expect(link(t.linkS.linkId).endedAt).toBe(Date.now())
    expect(link(t.linkT.linkId).endedAt).toBeNull()
    // 4. Someone was removed: every open invite closed, and a rekey is due.
    expect(body.invites).toEqual([])
    expect(body.rekeyNeeded).toBe(true)
    expect((await (await owner.other()).join(t.holderInvite)).body).toEqual(spacesError('not_found'))
    // The owner writes S again; the holder and Q2 don’t.
    expect(await putOne(owner, `s.${S}.w`)).toBe(200)
    expect(await putOne(H, `s.${S}.w`)).toBe(403)
    expect(await putOne(Q2, `s.${S}.w`)).toBe(403)
    expect(await putOne(Q2, `s.${T}.w`)).toBe(200)
  })

  it('closes the holder’s invites naming the street even when nobody is removed', async () => {
    const owner = await territory()
    const [S, T] = [scopeId(), scopeId()]
    const H = await joined(owner, { scopes: [S, T] })
    for (const scope of [S, T])
      await owner.send('handoff/create', { ...owner.fields, scopeId: scope, target: H.memberId })
    const onS = await H.invite({}, { scopes: [S] })
    const onT = await H.invite({}, { scopes: [T] })
    expect((await H.send('handoff/end', { ...H.fields, scopeId: S })).status).toBe(200)
    const body = (await owner.sync()).body
    expect(body.invites.map((i: { inviteId: string }) => i.inviteId)).toEqual([onT.inviteId])
    expect(body.rekeyNeeded).toBe(false)
    expect((await (await owner.other()).join(onS)).body).toEqual(spacesError('not_found'))
  })

  it('removes a holder who gives back their only street', async () => {
    const owner = await territory()
    const S = scopeId()
    const H = await joined(owner, { scopes: [S], handoff: true })
    expect((await H.send('handoff/end', { ...H.fields, scopeId: S })).status).toBe(200)
    expect((await H.sync()).body).toEqual(spacesError('gone'))
    expect((await owner.sync()).body).toMatchObject({ holders: [], rekeyNeeded: true })
  })

  it('keeps a whole member who held a street', async () => {
    const owner = await territory()
    const S = scopeId()
    const W = await joined(owner)
    await owner.send('handoff/create', { ...owner.fields, scopeId: S, target: W.memberId })
    expect((await W.send('handoff/end', { ...W.fields, scopeId: S })).status).toBe(200)
    expect((await W.sync()).body).toMatchObject({ holders: [], rekeyNeeded: false })
    expect(await putOne(W, `s.${S}.w`)).toBe(200)
  })

  it('takes back a pending hand-off: the invite closes', async () => {
    const owner = await territory()
    const S = scopeId()
    const invite = await owner.invite({}, { scopes: [S], handoff: true })
    expect((await owner.send('handoff/end', { ...owner.fields, scopeId: S })).status).toBe(200)
    expect((await owner.sync()).body).toMatchObject({ holders: [], invites: [] })
    expect((await (await owner.other()).join(invite)).body).toEqual(spacesError('not_found'))
  })

  it('is ok on a street nobody holds, for any member, and changes nothing', async () => {
    const owner = await territory()
    const P = await joined(owner, { scopes: [scopeId()] })
    const seq = (await owner.sync()).body.seq
    for (const member of [owner, P])
      expect((await member.send('handoff/end', { ...member.fields, scopeId: scopeId() })).body).toEqual({
        ok: true,
        seq,
      })
  })

  it('is the owner’s or the holder’s alone', async () => {
    const t = await handedOff()
    for (const member of [t.Q1, t.Q2])
      expect((await member.send('handoff/end', { ...member.fields, scopeId: t.S })).body).toEqual(
        spacesError('forbidden')
      )
    const W = await joined(t.owner)
    expect((await W.send('handoff/end', { ...W.fields, scopeId: t.S })).body).toEqual(
      spacesError('forbidden')
    )
  })

  it('runs for every street of a holder who leaves or is removed', async () => {
    const t = await handedOff()
    expect((await t.H.leave()).status).toBe(200)
    const body = (await t.owner.sync()).body
    expect(body.holders).toEqual([])
    expect(body.members.map((m: { memberId: string }) => m.memberId)).toEqual([t.owner.memberId])
    expect(body.links.every((l: { endedAt: number | null }) => l.endedAt != null)).toBe(true)
    for (const member of [t.H, t.Q1, t.Q2]) expect((await member.sync()).status).toBe(410)

    const u = await handedOff()
    expect((await u.owner.remove(u.H)).status).toBe(200)
    const after = (await u.owner.sync()).body
    expect(after.holders).toEqual([])
    expect(after.members).toHaveLength(1)
  })
})

describe('the owner never changes', () => {
  it('refuses the owner’s leave and self-removal, and keeps the owner through every change', async () => {
    const t = await everyRole()
    expect((await t.O.leave()).body).toEqual(spacesError('bad_request'))
    expect((await t.O.remove(t.O)).body).toEqual(spacesError('bad_request'))
    expect((await t.H.leave()).status).toBe(200)
    expect((await t.W.leave()).status).toBe(200)
    expect((await t.O.remove(t.P)).status).toBe(200)
    const body = (await t.O.sync()).body
    expect(body.ownerId).toBe(t.O.memberId)
    expect(body.members.map((m: { memberId: string }) => m.memberId)).toEqual([t.O.memberId])
    // Nobody else can rekey or delete it.
    expect((await t.O.deleteSpace()).status).toBe(200)
  })

  it('keeps owner-only ops the owner’s, the holder’s included', async () => {
    const t = await everyRole()
    for (const member of [t.W, t.P, t.H, t.Q]) {
      expect((await member.rekey(2, [t.O, t.W, t.P, t.H, t.Q])).body).toEqual(spacesError('forbidden'))
      expect((await member.deleteSpace()).body).toEqual(spacesError('forbidden'))
      expect(
        (await member.send('member/scopes', { ...member.fields, target: t.P.memberId, scopes: null })).body
      ).toEqual(spacesError('forbidden'))
    }
  })
})

describe('member/remove', () => {
  it('lets a holder remove only the members they invited, and takes an unknown id from anyone', async () => {
    const t = await everyRole()
    expect((await t.H.remove(t.P)).body).toEqual(spacesError('forbidden'))
    expect((await t.H.remove(t.W)).body).toEqual(spacesError('forbidden'))
    expect((await t.W.remove(t.P)).body).toEqual(spacesError('forbidden'))
    expect((await t.Q.remove(t.H)).body).toEqual(spacesError('forbidden'))
    expect((await t.H.remove(randomId())).status).toBe(200)
    expect((await t.P.remove(randomId())).status).toBe(200)
    expect((await t.P.remove(t.P)).body).toEqual(spacesError('bad_request'))
    expect((await t.H.remove(t.Q)).status).toBe(200)
    const body = (await t.O.sync()).body
    expect(body.members).toHaveLength(4)
    expect(body.rekeyNeeded).toBe(true)
    expect(body.invites).toEqual([])
  })
})

describe('member/scopes', () => {
  const setScopes = (owner: SpaceMember, target: string, scopes: string[] | null) =>
    owner.send('member/scopes', { ...owner.fields, target, scopes })

  it('sets a member’s streets, asking for a rekey only when it narrows them', async () => {
    const owner = await territory()
    const [S1, S2] = [scopeId(), scopeId()]
    const P = await joined(owner, { scopes: [S1] })
    expect((await setScopes(owner, P.memberId, [S1, S2])).body).toEqual({ ok: true })
    expect((await owner.sync()).body).toMatchObject({ rekeyNeeded: false })
    expect(await putOne(P, `s.${S2}.w`)).toBe(200)
    expect((await setScopes(owner, P.memberId, null)).status).toBe(200)
    expect(await putOne(P, `d.${uuid()}`)).toBe(200)
    expect((await owner.sync()).body).toMatchObject({ rekeyNeeded: false })
    expect((await setScopes(owner, P.memberId, [S2])).status).toBe(200)
    const body = (await owner.sync()).body
    expect(body.rekeyNeeded).toBe(true)
    expect(body.members[1].scopes).toEqual([S2])
    expect(await recordIds(P)).not.toContain(`s.${S1}.w`)
  })

  it('keeps what the target holds, takes nothing someone else holds, and only for the owner’s own invitees', async () => {
    const t = await everyRole()
    const { O, P, H, Q, S1, S2, S3 } = t
    expect((await setScopes(O, H.memberId, [S1])).body).toEqual(spacesError('conflict'))
    expect((await setScopes(O, H.memberId, [S2, S1])).status).toBe(200)
    expect((await setScopes(O, P.memberId, [S1, S2])).body).toEqual(spacesError('conflict'))
    expect((await setScopes(O, P.memberId, [S1, S3])).status).toBe(200)
    // A pending hand-off holds its street too.
    const S4 = scopeId()
    await O.invite({}, { scopes: [S4], handoff: true })
    expect((await setScopes(O, P.memberId, [S1, S4])).body).toEqual(spacesError('conflict'))
    expect((await setScopes(O, Q.memberId, [S2])).body).toEqual(spacesError('forbidden'))
    expect((await setScopes(O, randomId(), [S1])).body).toEqual(spacesError('conflict'))
    expect((await setScopes(O, O.memberId, [S1])).body).toEqual(spacesError('bad_request'))
    expect((await O.send('member/scopes', { ...O.fields, target: P.memberId, scopes: [] })).body).toEqual(
      spacesError('bad_request')
    )
  })

  it('keeps a street the target already had though someone holds it now', async () => {
    const owner = await territory()
    const [S1, S2] = [scopeId(), scopeId()]
    const P = await joined(owner, { scopes: [S1] })
    const W = await joined(owner)
    await owner.send('handoff/create', { ...owner.fields, scopeId: S1, target: W.memberId })
    expect((await setScopes(owner, P.memberId, [S1, S2])).status).toBe(200)
    expect(await putOne(P, `s.${S1}.w`)).toBe(403)
  })
})

describe('links, as members manage them', () => {
  it('opens the owner’s on unheld streets and a holder’s on theirs, nobody else’s', async () => {
    const t = await everyRole()
    expect((await openLink(t.O, [t.S1, t.S3])).response.body).toEqual({ ok: true, seq: expect.any(Number) })
    expect((await openLink(t.O, [t.S2])).response.body).toEqual(spacesError('forbidden'))
    for (const member of [t.W, t.P, t.Q])
      expect((await openLink(member, [t.S1])).response.body).toEqual(spacesError('forbidden'))
  })

  it('checks the expiry and epoch, takes an identical retry, and never reuses an id', async () => {
    const owner = await territory()
    const S = scopeId()
    for (const expiresAt of [Date.now(), Date.now() + 30 * DAY + 5 * MINUTE + 1])
      expect((await openLink(owner, [S], { expiresAt })).response.body).toEqual(spacesError('bad_request'))
    expect((await openLink(owner, [S], { expiresAt: Date.now() + 30 * DAY + 5 * MINUTE })).response.status).toBe(200)
    expect((await openLink(owner, [S], { epoch: 2 })).response.body).toEqual(spacesError('stale_key'))
    expect((await openLink(owner, Array.from({ length: 31 }, () => scopeId()))).response.body).toEqual(
      spacesError('bad_request')
    )
    const link = await openLink(owner, [S])
    const again = await owner.send('link/create', {
      ...owner.fields,
      linkId: link.linkId,
      verifier: link.verifier,
      scopes: [S],
      expiresAt: link.expiresAt,
      epoch: 1,
    })
    expect(again.body).toEqual({ ok: true, seq: link.response.body.seq })
    expect((await openLink(owner, [S], { linkId: link.linkId })).response.body).toEqual(
      spacesError('conflict')
    )
    // Ended, it still can't be opened again.
    await owner.send('link/end', { ...owner.fields, linkId: link.linkId })
    expect((await owner.send('link/create', { ...owner.fields, linkId: link.linkId, verifier: link.verifier, scopes: [scopeId()], expiresAt: link.expiresAt, epoch: 1 })).body).toEqual(
      spacesError('conflict')
    )
  })

  it('holds a space to 10 open links and 30 made a rolling day', async () => {
    const owner = await territory()
    const S = scopeId()
    const links = []
    for (let i = 0; i < SPACES_LIMITS.openLinks; i++) links.push(await openLink(owner, [S]))
    expect((await openLink(owner, [S])).response.body).toEqual(spacesError('limit'))
    let made = SPACES_LIMITS.openLinks
    for (const link of links) await owner.send('link/end', { ...owner.fields, linkId: link.linkId })
    while (made < SPACES_LIMITS.linksPerDay) {
      const link = await openLink(owner, [S])
      expect(link.response.status).toBe(200)
      await owner.send('link/end', { ...owner.fields, linkId: link.linkId })
      made++
    }
    expect((await openLink(owner, [S])).response.body).toEqual(spacesError('limit'))
    advance(DAY + 1)
    expect((await openLink(owner, [S])).response.status).toBe(200)
  })

  it('ends a link by its creator or the owner, idempotently, and lists it a day past expiry', async () => {
    const t = await everyRole()
    const end = (member: SpaceMember, linkId: string) =>
      member.send('link/end', { ...member.fields, linkId })
    expect((await end(t.W, t.ownerLink.linkId)).body).toEqual(spacesError('forbidden'))
    expect((await end(t.Q, t.holderLink.linkId)).body).toEqual(spacesError('forbidden'))
    expect((await end(t.H, t.ownerLink.linkId)).body).toEqual(spacesError('forbidden'))
    expect((await end(t.O, t.holderLink.linkId)).body).toEqual({ ok: true, seq: expect.any(Number) })
    expect((await end(t.H, t.holderLink.linkId)).status).toBe(200)
    expect((await end(t.W, randomId())).status).toBe(200)
    advance(DAY)
    expect((await t.O.sync()).body.links).toHaveLength(2)
    advance(DAY)
    expect((await t.O.sync()).body.links).toEqual([])
  })

  it('moves a live link’s expiry for its creator or the owner, and the guest sees it', async () => {
    const t = await everyRole()
    const move = (member: SpaceMember, linkId: string, expiresAt: number) =>
      member.send('link/expiry', { ...member.fields, linkId, expiresAt })
    const week = Date.now() + 7 * DAY
    expect((await move(t.W, t.ownerLink.linkId, week)).body).toEqual(spacesError('forbidden'))
    expect((await move(t.H, t.ownerLink.linkId, week)).body).toEqual(spacesError('forbidden'))
    for (const expiresAt of [Date.now(), Date.now() + 30 * DAY + 5 * MINUTE + 1])
      expect((await move(t.O, t.ownerLink.linkId, expiresAt)).body).toEqual(spacesError('bad_request'))
    expect((await move(t.O, t.ownerLink.linkId, week)).body).toEqual({ ok: true, seq: expect.any(Number) })
    expect((await move(t.O, t.ownerLink.linkId, week)).status).toBe(200)
    expect((await t.ownerLink.guest.sync()).body).toMatchObject({ ok: true, expiresAt: week })
    expect((await move(t.H, t.holderLink.linkId, week)).status).toBe(200)
    expect((await move(t.O, t.holderLink.linkId, Date.now() + HOUR)).status).toBe(200)
    advance(2 * DAY)
    expect((await t.ownerLink.guest.sync()).status).toBe(200)
    expect((await move(t.O, t.holderLink.linkId, Date.now() + DAY)).body).toEqual(spacesError('not_found'))
    expect((await move(t.O, randomId(), Date.now() + DAY)).body).toEqual(spacesError('not_found'))
    await t.O.send('link/end', { ...t.O.fields, linkId: t.ownerLink.linkId })
    expect((await move(t.O, t.ownerLink.linkId, Date.now() + DAY)).body).toEqual(spacesError('not_found'))
  })
})

describe('older spaces', () => {
  it('gain the new columns and tables when their object starts, and keep their rules', async () => {
    const owner = await SpaceMember.open(h.env)
    await owner.create()
    await owner.put([{ recordId: 'trip-1' }])
    const storage = h.spaces.storage(owner.spaceId)
    // Back to the schema before scoped spaces.
    for (const table of ['holder', 'link', 'invite_author', 'link_request', 'link_record_hour'])
      storage.query(`DROP TABLE ${table}`)
    storage.query('DROP INDEX record_scope')
    for (const [table, column] of [
      ['space', 'mode'],
      ['member', 'scopes'],
      ['member', 'invited_by'],
      ['invite', 'scopes'],
      ['invite', 'handoff'],
      ['record', 'scope'],
    ])
      storage.query(`ALTER TABLE ${table} DROP COLUMN ${column}`)
    h.spaces.restart(owner.spaceId)
    const synced = await owner.sync()
    expect(synced.status).toBe(200)
    expect(synced.body.mode).toBeUndefined()
    expect(synced.body.records.map((r: { recordId: string }) => r.recordId)).toEqual(['trip-1'])
    const joe = await owner.other()
    await joe.joinVia(owner)
    expect((await owner.put([{ recordId: 'trip-2' }])).status).toBe(200)
    expect(storage.tables()).toEqual(expect.arrayContaining(['holder', 'link']))
  })
})

describe('kill switch and suspension', () => {
  it('keeps handoff/end and link/end working while Shared Spaces is off', async () => {
    const t = await everyRole()
    await h.kv.put('spaces:enabled', 'false')
    expect((await t.H.send('handoff/end', { ...t.H.fields, scopeId: t.S2 })).status).toBe(200)
    expect((await t.O.send('link/end', { ...t.O.fields, linkId: t.ownerLink.linkId })).status).toBe(200)
    for (const [op, body] of [
      ['handoff/create', { scopeId: t.S3, target: t.W.memberId }],
      ['member/scopes', { target: t.P.memberId, scopes: null }],
    ] as const)
      expect((await t.O.send(op, { ...t.O.fields, ...body })).body).toMatchObject({ code: 'disabled' })
    expect((await openLink(t.O, [t.S1])).response.body).toMatchObject({ code: 'disabled' })
  })

  it('refuses the ops that grant access to a suspended account', async () => {
    const t = await everyRole()
    await h
      .accountsDb!.prepare("UPDATE accounts SET status = 'suspended' WHERE id = ?")
      .bind(t.O.session.accountId)
      .run()
    resetAccountStatusCache()
    for (const [op, body] of [
      ['handoff/create', { scopeId: t.S3, target: t.W.memberId }],
      ['member/scopes', { target: t.P.memberId, scopes: null }],
    ] as const)
      expect((await t.O.send(op, { ...t.O.fields, ...body })).body).toMatchObject({ code: 'suspended' })
    expect((await openLink(t.O, [t.S1])).response.body).toMatchObject({ code: 'suspended' })
    expect((await t.O.send('link/end', { ...t.O.fields, linkId: t.ownerLink.linkId })).status).toBe(200)
    expect((await t.O.send('handoff/end', { ...t.O.fields, scopeId: t.S2 })).status).toBe(200)
  })
})
