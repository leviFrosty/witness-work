import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { b64u, createHarness, randomBytes, randomId, type Harness } from '../test/buddies'
import { bearer, requestJson } from '../test/accounts'
import { recordSentryEvents } from '../test/sentry'
import {
  SpaceMember,
  fakeLink,
  fakeWrap,
  joinSecret,
  spacesError,
  spacesRoutes,
} from '../test/spaces'
import { resetAccountStatusCache } from '../accounts/auth'
import { SPACES_LIMITS } from './contracts'
import type { SharedSpace } from './spaceDO'

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
 * Shared Spaces (witness-work ADR 0037, `docs/shared-cars-protocol.md`):
 * every op through the real routes and `SharedSpace` on SQLite, for
 * membership, invites, roles, rekeying, deletion, suspension, and the kill
 * switch. Records and paging are in records.test.ts, the live socket and
 * retention in live.test.ts.
 */

const START = Date.UTC(2026, 9, 29, 12)
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

/** An owner who made a space. */
const owned = async (): Promise<SpaceMember> => {
  const owner = await SpaceMember.open(h.env)
  expect((await owner.create()).body).toEqual({ ok: true, seq: 1, joinedAt: Date.now() })
  return owner
}

/** An owner and `count` more members, joined in order a second apart. */
const spaceOf = async (count: number) => {
  const owner = await owned()
  const members: SpaceMember[] = []
  for (let i = 0; i < count; i++) {
    advance(1_000)
    const member = await owner.other()
    await member.joinVia(owner)
    members.push(member)
  }
  return { owner, members }
}

const ids = (list: { memberId?: string; inviteId?: string }[]) =>
  list.map((entry) => entry.memberId ?? entry.inviteId)

const suspend = async (member: SpaceMember) => {
  await h
    .accountsDb!.prepare("UPDATE accounts SET status = 'suspended' WHERE id = ?")
    .bind(member.session.accountId)
    .run()
  resetAccountStatusCache()
}

describe('create', () => {
  it('makes the space at epoch 1 with the caller as its only member and owner', async () => {
    const owner = await SpaceMember.open(h.env)
    const wrap = fakeWrap()
    expect(await owner.create(wrap)).toMatchObject({
      status: 200,
      body: { ok: true, seq: 1, joinedAt: START },
    })
    expect((await owner.sync()).body).toEqual({
      ok: true,
      seq: 1,
      epoch: 1,
      wrap,
      ownerId: owner.memberId,
      members: [{ memberId: owner.memberId, dhPub: owner.dhPub, joinedAt: START }],
      invites: [],
      rekeyNeeded: false,
      records: [],
      more: false,
    })
  })

  it('stores the token hash, public key, and wrap, never the token or the account', async () => {
    const owner = await owned()
    const tables = JSON.stringify(
      h.spaces
        .storage(owner.spaceId)
        .tables()
        .map((table) => h.spaces.storage(owner.spaceId).query(`SELECT * FROM ${table}`))
    )
    expect(tables).toContain(await owner.tokenHash())
    expect(tables).toContain(owner.dhPub)
    for (const secret of [owner.token, owner.session.accountId, owner.session.sessionId])
      expect(tables).not.toContain(secret)
  })

  it('refuses an id that exists, and one that was deleted', async () => {
    const owner = await owned()
    const again = await SpaceMember.open(h.env, owner.spaceId)
    expect(await again.create()).toMatchObject({
      status: 409,
      body: spacesError('conflict'),
    })
    expect((await owner.deleteSpace()).status).toBe(200)
    expect(await again.create()).toMatchObject({
      status: 410,
      body: spacesError('gone'),
    })
    expect(await owner.create()).toMatchObject({ status: 410, body: spacesError('gone') })
  })

  it('leaves nothing behind when its transaction throws, so a later create answers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const owner = await SpaceMember.open(h.env)
    const storage = h.spaces.storage(owner.spaceId)
    const sql = storage.state.storage.sql
    const exec = sql.exec.bind(sql)
    const failing = vi.spyOn(sql, 'exec').mockImplementation(((query: string, ...bindings: unknown[]) => {
      if (query.trim().startsWith('INSERT INTO member')) throw new Error('storage unavailable')
      return exec(query, ...(bindings as never[]))
    }) as typeof sql.exec)
    expect(await owner.create()).toMatchObject({ status: 500, body: spacesError('internal') })
    failing.mockRestore()
    expect(storage.tables()).toEqual([])
    expect(storage.alarm()).toBeNull()
    // The object doesn't take the space for made (its schema isn't ready):
    // a member op is gone, not a failure, and create makes the space.
    expect(await owner.sync()).toMatchObject({ status: 410, body: spacesError('gone') })
    expect((await owner.create()).body).toEqual({ ok: true, seq: 1, joinedAt: START })
    expect((await owner.sync()).body).toMatchObject({ seq: 1, members: [{ memberId: owner.memberId }] })
  })

  it('answers an identical retry the same, until the space changes', async () => {
    const owner = await owned()
    advance(MINUTE)
    // A lost answer: the same body again, from another of the person's sessions too.
    const first = { ok: true, seq: 1, joinedAt: START }
    expect((await owner.create()).body).toEqual(first)
    const otherDevice = await SpaceMember.open(h.env, owner.spaceId)
    expect(
      (await otherDevice.send('create', await owner.createBody())).body
    ).toEqual(first)
    // Anything else is a conflict: another wrap or token, or someone else.
    expect((await owner.create(fakeWrap())).body).toEqual(spacesError('conflict'))
    const otherToken = await (await owner.other()).tokenHash()
    expect((await owner.create(undefined, { tokenHash: otherToken })).body).toEqual(
      spacesError('conflict')
    )
    expect((await (await owner.other()).create()).body).toEqual(spacesError('conflict'))
    // Once anything changed, even the same body is a conflict.
    await owner.invite()
    expect((await owner.create()).body).toEqual(spacesError('conflict'))
    expect((await owner.sync()).body.members).toHaveLength(1)
  })

  it('checks memberId against dhPub', async () => {
    const owner = await SpaceMember.open(h.env)
    const other = await owner.other()
    for (const overrides of [{ dhPub: other.dhPub }, { memberId: other.memberId }])
      expect(await owner.create(undefined, overrides)).toMatchObject({
        status: 400,
        body: spacesError('bad_request'),
      })
    // The same key in another space commits to another id.
    const elsewhere = await SpaceMember.open(h.env)
    expect(
      (await owner.create(undefined, { spaceId: elsewhere.spaceId })).body
    ).toEqual(spacesError('bad_request'))
    expect(h.spaces.storage(owner.spaceId).tables()).toEqual([])
  })

  it('doesn’t count a retried create, or one refused for its id, against the day', async () => {
    const first = await SpaceMember.open(h.env)
    expect((await first.create()).status).toBe(200)
    for (let i = 0; i < 3; i++) expect((await first.create()).status).toBe(200)
    const taken = await SpaceMember.open(h.env, first.spaceId, first.session)
    expect((await taken.create()).status).toBe(409)
    for (let i = 1; i < SPACES_LIMITS.spacesPerDay; i++) {
      const member = await SpaceMember.open(h.env, randomId(), first.session)
      expect((await member.create()).status).toBe(200)
    }
    expect((await first.create()).status).toBe(200)
    const over = await SpaceMember.open(h.env, randomId(), first.session)
    expect((await over.create()).status).toBe(429)
  })

  it('takes 20 spaces per account a rolling day, counted per account', async () => {
    const first = await SpaceMember.open(h.env)
    for (let i = 0; i < SPACES_LIMITS.spacesPerDay; i++) {
      const member = await SpaceMember.open(h.env, randomId(), first.session)
      expect((await member.create()).status).toBe(200)
    }
    const over = await SpaceMember.open(h.env, randomId(), first.session)
    const refused = await over.create()
    expect(refused.status).toBe(429)
    expect(refused.body).toMatchObject({ code: 'rate_limited', retryAfter: expect.any(Number) })
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0)
    // Another account has its own count.
    expect((await (await SpaceMember.open(h.env)).create()).status).toBe(200)
    advance(DAY)
    expect((await over.create()).status).toBe(200)
  })

  it('refuses malformed fields and a missing token', async () => {
    const owner = await SpaceMember.open(h.env)
    const tokenHash = await owner.tokenHash()
    const valid = await owner.createBody()
    for (const body of [
      { ...valid, spaceId: 'short' },
      { ...valid, memberId: undefined },
      { ...valid, dhPub: undefined },
      { ...valid, dhPub: b64u(randomBytes(31)) },
      { ...valid, tokenHash: `${tokenHash.slice(0, 42)}B` },
      { ...valid, wrap: '' },
      { ...valid, wrap: 'a'.repeat(1_000) },
      [valid],
    ])
      expect((await owner.send('create', body)).body).toEqual(spacesError('bad_request'))
    const raw = await spacesRoutes.request(
      '/create',
      { method: 'POST', headers: bearer(owner.session.accessToken), body: '{nope' },
      h.env
    )
    expect(raw.status).toBe(400)
    const anonymous = await requestJson(spacesRoutes as never, h.env, 'POST', '/create', valid)
    expect(anonymous.status).toBe(401)
    expect(anonymous.body).toEqual(spacesError('unauthorized'))
    expect(anonymous.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"')
  })

  it('answers disabled on a worker without sessions, even for the ops the kill switch spares', async () => {
    h = await createHarness({ sessions: false })
    for (const op of ['sync', 'leave', 'member/remove', 'delete']) {
      const response = await requestJson(spacesRoutes as never, h.env, 'POST', `/${op}`, {})
      expect(response.status, op).toBe(503)
      expect(response.body.code, op).toBe('disabled')
    }
  })
})

describe('invites and joining', () => {
  it('lets a member invite, and the invitee join with their own token and wrap', async () => {
    const owner = await owned()
    const invite = await owner.invite()
    expect(invite.response.body).toEqual({ ok: true })
    const listed = await owner.sync()
    expect(listed.body.seq).toBe(2)
    expect(listed.body.invites).toEqual([
      { inviteId: invite.inviteId, invitedBy: owner.memberId, expiresAt: invite.expiresAt },
    ])

    advance(1_000)
    const joe = await owner.other()
    const wrap = fakeWrap()
    expect((await joe.join(invite, { wrap })).body).toEqual({
      ok: true,
      seq: 3,
      epoch: 1,
      joinedAt: START + 1_000,
    })
    const synced = await joe.sync()
    expect(synced.body).toMatchObject({
      seq: 3,
      wrap,
      ownerId: owner.memberId,
      invites: [],
      members: [
        { memberId: owner.memberId, dhPub: owner.dhPub, joinedAt: START },
        { memberId: joe.memberId, dhPub: joe.dhPub, joinedAt: START + 1_000 },
      ],
    })
    // Any member can invite.
    expect((await joe.invite()).response.body).toEqual({ ok: true })
  })

  it('takes the same invite again as a no-op, and refuses its id for another', async () => {
    const owner = await owned()
    const invite = await owner.invite()
    const again = await owner.invite(invite)
    expect(again.response.body).toEqual({ ok: true })
    expect((await owner.sync()).body.seq).toBe(2)
    const changed = await owner.invite({ inviteId: invite.inviteId })
    expect(changed.response).toMatchObject({ status: 409, body: spacesError('conflict') })
  })

  it('opens invites only at the current epoch', async () => {
    const { owner, members } = await spaceOf(1)
    for (const epoch of [2, 0])
      expect((await owner.invite({ epoch })).response.body).toEqual(
        spacesError(epoch === 0 ? 'bad_request' : 'stale_key')
      )
    expect((await owner.sync()).body).toMatchObject({ seq: 3, invites: [] })
    expect((await owner.rekey(2, [owner, members[0]])).status).toBe(200)
    const stale = await members[0].invite({ epoch: 1 })
    expect(stale.response).toMatchObject({ status: 409, body: spacesError('stale_key') })
    expect((await members[0].invite()).response.body).toEqual({ ok: true })
  })

  it('joins only at the space’s current epoch, and takes a retry at any', async () => {
    const { owner, members } = await spaceOf(1)
    const [joe] = members
    const invite = await owner.invite()
    const ann = await owner.other()
    const head = (await owner.sync()).body.seq
    // An invitation for another epoch: nobody joins, and no wrong secret counts.
    for (const epoch of [2, 3])
      expect(await ann.join({ ...invite, epoch })).toMatchObject({
        status: 409,
        body: spacesError('stale_key'),
      })
    expect((await ann.join({ ...invite, epoch: 0 })).body).toEqual(spacesError('bad_request'))
    // The secret is checked first, and a member already on is a conflict.
    const wrong = (await joinSecret()).joinSecret
    expect((await ann.join({ ...invite, epoch: 2, joinSecret: wrong })).body).toEqual(spacesError('forbidden'))
    expect((await joe.join({ ...invite, epoch: 2 })).body).toEqual(spacesError('conflict'))
    expect((await owner.sync()).body).toMatchObject({
      seq: head,
      members: [{}, {}],
      invites: [{ inviteId: invite.inviteId }],
    })
    expect(
      h.spaces
        .storage(owner.spaceId)
        .query('SELECT bad_joins AS n FROM invite WHERE invite_id = ?', invite.inviteId)
    ).toEqual([{ n: 1 }])
    const joined = await ann.join(invite)
    expect(joined.body).toEqual({ ok: true, seq: head + 1, epoch: 1, joinedAt: START + 1_000 })

    // After a rekey, a retry at the invitation's epoch, or any, answers with
    // the current epoch and the original joinedAt.
    advance(MINUTE)
    expect((await owner.rekey(2, [owner, joe, ann])).status).toBe(200)
    const now = (await owner.sync()).body.seq
    for (const epoch of [1, 2, 7])
      expect((await ann.join({ ...invite, epoch })).body, String(epoch)).toEqual({
        ok: true,
        seq: now,
        epoch: 2,
        joinedAt: joined.body.joinedAt,
      })
    // A fresh join at the old epoch is stale.
    const atTwo = await joe.invite()
    const bo = await owner.other()
    expect((await bo.join({ ...atTwo, epoch: 1 })).body).toEqual(spacesError('stale_key'))
    expect((await bo.join(atTwo)).body).toMatchObject({ ok: true, epoch: 2 })
  })

  it('never opens a closed invite again, however it closed', async () => {
    const { owner, members } = await spaceOf(2)
    const [joe, ann] = members
    const conflict = { status: 409, body: spacesError('conflict') }
    const bo = await owner.other()

    const deleted = await joe.invite()
    expect((await joe.deleteInvite(deleted.inviteId)).body).toEqual({ ok: true })
    expect((await joe.invite(deleted)).response).toMatchObject(conflict)

    const burned = await joe.invite()
    const wrong = (await joinSecret()).joinSecret
    for (let i = 0; i < SPACES_LIMITS.badJoins; i++)
      expect((await bo.join({ ...burned, joinSecret: wrong })).status).toBe(403)
    expect((await joe.invite(burned)).response).toMatchObject(conflict)

    const used = await joe.invite()
    expect((await bo.join(used)).status).toBe(200)
    expect((await joe.invite(used)).response).toMatchObject(conflict)

    // A retry landing after a removal closed every open invite.
    const joes = await joe.invite()
    const anns = await ann.invite()
    expect((await owner.remove(bo)).status).toBe(200)
    expect((await joe.invite(joes)).response).toMatchObject(conflict)
    expect((await ann.invite(anns)).response).toMatchObject(conflict)

    // Its inviter left: nobody takes the id for an invite of their own.
    const leavers = await ann.invite()
    expect((await ann.leave()).status).toBe(200)
    expect((await joe.invite({ ...leavers, inviteId: leavers.inviteId })).response).toMatchObject(conflict)

    // A rekey closed it: the same id at the new epoch is a conflict, and at
    // its own a stale key.
    const rekeyed = await joe.invite()
    expect((await owner.rekey(2, [owner, joe])).status).toBe(200)
    expect((await joe.invite({ ...rekeyed, epoch: 2 })).response).toMatchObject(conflict)
    expect((await joe.invite(rekeyed)).response.body).toEqual(spacesError('stale_key'))

    // None of them is open, or lets anyone in.
    expect((await owner.sync()).body.invites).toEqual([])
    const cy = await owner.other()
    for (const invite of [deleted, burned, joes, anns, leavers, rekeyed])
      expect(await cy.join({ ...invite, epoch: 2 })).toMatchObject({
        status: 404,
        body: spacesError('not_found'),
      })
    // Closing one again is still ok and changes nothing.
    const seq = (await owner.sync()).body.seq
    expect((await owner.deleteInvite(deleted.inviteId)).body).toEqual({ ok: true })
    expect((await owner.sync()).body.seq).toBe(seq)
  })

  it('counts no closed invite against the cap and lists none, and keeps each only until it expires', async () => {
    const owner = await owned()
    await h.kv.put('spaces:maxMembers', '3')
    const storage = h.spaces.storage(owner.spaceId)
    const closed = [
      await owner.invite({ expiresAt: Date.now() + HOUR }),
      await owner.invite({ expiresAt: Date.now() + 2 * HOUR }),
    ]
    expect((await owner.invite()).response.body).toEqual(spacesError('limit'))
    for (const invite of closed) await owner.deleteInvite(invite.inviteId)
    const open = [await owner.invite(), await owner.invite()]
    expect(open.map((invite) => invite.response.status)).toEqual([200, 200])
    expect(ids((await owner.sync()).body.invites).sort()).toEqual(ids(open).sort())
    // A join counts open invites only, so it fits.
    expect((await (await owner.other()).join(open[0])).status).toBe(200)
    const kept = () =>
      storage.query('SELECT invite_id AS inviteId FROM closed_invite ORDER BY expires_at').map((row) => row.inviteId)
    expect(kept()).toEqual(ids(closed))
    advance(HOUR)
    await owner.sync()
    expect(kept()).toEqual([closed[1].inviteId])
    advance(HOUR)
    await owner.sync()
    expect(kept()).toEqual([])
  })

  it('checks memberId against dhPub on join', async () => {
    const owner = await owned()
    const invite = await owner.invite()
    const joe = await owner.other()
    const ann = await owner.other()
    expect(await joe.join(invite, { dhPub: ann.dhPub })).toMatchObject({
      status: 400,
      body: spacesError('bad_request'),
    })
    // Refused before the invite is checked: no wrong secret was counted.
    expect((await joe.join(invite)).status).toBe(200)
  })

  it('bounds expiresAt to 7 days and 5 minutes', async () => {
    const owner = await owned()
    const limit = Date.now() + 7 * DAY + 5 * MINUTE
    expect((await owner.invite({ expiresAt: limit })).response.status).toBe(200)
    for (const expiresAt of [limit + 1, Date.now(), Date.now() - 1])
      expect((await owner.invite({ expiresAt })).response.body).toEqual(
        spacesError('bad_request')
      )
  })

  it('burns an invite after five wrong secrets', async () => {
    const owner = await owned()
    const invite = await owner.invite()
    const joe = await owner.other()
    const wrong = (await joinSecret()).joinSecret
    for (let i = 0; i < SPACES_LIMITS.badJoins - 1; i++)
      expect(await joe.join({ ...invite, joinSecret: wrong })).toMatchObject({
        status: 403,
        body: spacesError('forbidden'),
      })
    expect((await owner.sync()).body.invites).toHaveLength(1)
    expect((await joe.join({ ...invite, joinSecret: wrong })).status).toBe(403)
    expect(await joe.join(invite)).toMatchObject({ status: 404, body: spacesError('not_found') })
    const listed = await owner.sync()
    expect(listed.body.invites).toEqual([])
    expect(listed.body.seq).toBe(3)
  })

  it('answers a retried join with its original joinedAt, and only that one', async () => {
    const owner = await owned()
    const invite = await owner.invite()
    const joe = await owner.other()
    const first = await joe.join(invite)
    expect(first.body).toEqual({ ok: true, seq: 3, epoch: 1, joinedAt: START })
    advance(MINUTE)
    expect((await joe.join(invite)).body).toEqual(first.body)
    // After other changes it answers with the head and epoch now.
    await owner.put([{}])
    expect((await joe.join(invite)).body).toEqual({ ok: true, seq: 4, epoch: 1, joinedAt: START })
    // A used invite counts no wrong secrets and serves nobody else; any
    // other join by a member already on is a conflict.
    expect((await joe.join({ ...invite, joinSecret: (await joinSecret()).joinSecret })).status).toBe(404)
    expect(
      await joe.join(invite, { tokenHash: await (await owner.other()).tokenHash() })
    ).toMatchObject({ status: 409, body: spacesError('conflict') })
    expect((await joe.join(await owner.invite())).body).toEqual(spacesError('conflict'))
    expect((await (await owner.other()).join(invite)).status).toBe(404)
    expect((await owner.sync()).body.members).toHaveLength(2)
    // Once they left, the invite doesn't bring them back.
    expect((await joe.leave()).status).toBe(200)
    expect((await joe.join(invite)).status).toBe(404)
  })

  it('closes the invites a member made when they leave, so they can’t rejoin through one', async () => {
    const { owner, members } = await spaceOf(2)
    const [joe, ann] = members
    const anns = [await ann.invite(), await ann.invite()]
    const joes = await joe.invite()
    const owners = await owner.invite()
    const before = (await owner.sync()).body.seq
    expect((await ann.leave()).status).toBe(200)
    const afterLeave = await owner.sync()
    expect(afterLeave.body.seq).toBe(before + 1)
    expect(ids(afterLeave.body.invites).sort()).toEqual([joes.inviteId, owners.inviteId].sort())
    // Nobody joins through hers, Ann included; the others stay open.
    const bo = await owner.other()
    for (const invite of anns)
      expect(await bo.join(invite)).toMatchObject({ status: 404, body: spacesError('not_found') })
    expect((await ann.join(anns[0])).status).toBe(404)
    expect((await bo.join(joes)).status).toBe(200)
  })

  it('closes every open invite when a member is removed, so they can’t rejoin through anyone’s', async () => {
    const { owner, members } = await spaceOf(2)
    const [joe, ann] = members
    const joes = await joe.invite()
    const anns = await ann.invite()
    const owners = await owner.invite()
    const before = (await owner.sync()).body.seq
    expect((await owner.remove(joe)).status).toBe(200)
    const afterRemoval = await owner.sync()
    expect(afterRemoval.body).toMatchObject({ seq: before + 1, invites: [], rekeyNeeded: true })
    // Joe can't come back through another member's invite (whose secret
    // his device may hold), nor his own; nor can anyone else.
    for (const invite of [anns, owners, joes])
      expect(await joe.join(invite)).toMatchObject({ status: 404, body: spacesError('not_found') })
    const bo = await owner.other()
    expect((await bo.join(anns)).status).toBe(404)
    // The inviters send theirs again after the rekey.
    expect((await owner.rekey(2, [owner, ann])).status).toBe(200)
    expect((await bo.join(await ann.invite())).body).toMatchObject({ ok: true, epoch: 2 })
  })

  it('keeps used invites when a member is removed, for a retried join', async () => {
    const { owner, members } = await spaceOf(1)
    const [joe] = members
    const invite = await joe.invite()
    const ann = await owner.other()
    const joined = await ann.join(invite)
    await owner.remove(joe)
    expect((await ann.join(invite)).body).toEqual({ ...joined.body, seq: joined.body.seq + 1 })
  })

  it('compares dhPub on retried creates and joins, beneath the Worker’s check', async () => {
    const owner = await owned()
    const stub = h.env.SHARED_SPACE.get(h.env.SHARED_SPACE.idFromName(owner.spaceId))
    const swapped = b64u(randomBytes(32))
    const create = await owner.createBody()
    expect(await stub.existingCreate(create)).toEqual({
      ok: true,
      value: { seq: 1, joinedAt: START },
    })
    expect(await stub.existingCreate({ ...create, dhPub: swapped })).toEqual({
      ok: false,
      error: 'conflict',
    })
    const invite = await owner.invite()
    const joe = await owner.other()
    expect((await joe.join(invite)).status).toBe(200)
    const join = {
      spaceId: owner.spaceId,
      inviteId: invite.inviteId,
      joinHash: invite.joinVerifier,
      memberId: joe.memberId,
      dhPub: joe.dhPub,
      tokenHash: await joe.tokenHash(),
      wrap: fakeWrap(),
      maxMembers: SPACES_LIMITS.defaultMaxMembers,
    }
    expect(await stub.join(join)).toEqual({
      ok: true,
      value: { seq: 3, epoch: 1, joinedAt: START },
    })
    expect(await stub.join({ ...join, dhPub: swapped })).toEqual({ ok: false, error: 'conflict' })
  })

  it('frees the places a gone member’s invites held', async () => {
    const { owner, members } = await spaceOf(1)
    await h.kv.put('spaces:maxMembers', '4')
    const [joe] = members
    await joe.invite()
    await joe.invite()
    expect((await owner.invite()).response.body).toEqual(spacesError('limit'))
    await owner.remove(joe)
    for (let i = 0; i < 3; i++) expect((await owner.invite()).response.status).toBe(200)
  })

  it('refuses an invite whose inviter is no longer on the space', async () => {
    const owner = await owned()
    const secret = await joinSecret()
    const inviteId = randomId()
    // One that slipped past leave and member/remove.
    h.spaces
      .storage(owner.spaceId)
      .query(
        `INSERT INTO invite (invite_id, invited_by, join_verifier, expires_at, created_at, bad_joins)
         VALUES (?, ?, ?, ?, ?, 0)`,
        inviteId,
        randomId(),
        secret.joinVerifier,
        Date.now() + HOUR,
        Date.now()
      )
    const joe = await owner.other()
    expect(await joe.join({ inviteId, joinSecret: secret.joinSecret })).toMatchObject({
      status: 404,
      body: spacesError('not_found'),
    })
    expect(h.spaces.storage(owner.spaceId).query('SELECT bad_joins AS n FROM invite')).toEqual([
      { n: 0 },
    ])
  })

  it('refuses unknown, expired, and closed invites, members already on, and deleted spaces', async () => {
    const owner = await owned()
    const joe = await owner.other()
    expect((await joe.join({ inviteId: randomId(), joinSecret: (await joinSecret()).joinSecret })).status).toBe(404)
    const nowhere = await SpaceMember.open(h.env)
    expect((await nowhere.join({ inviteId: randomId(), joinSecret: (await joinSecret()).joinSecret })).status).toBe(404)

    const expiring = await owner.invite({ expiresAt: Date.now() + HOUR })
    advance(HOUR)
    expect((await joe.join(expiring)).status).toBe(404)
    expect((await owner.sync()).body.invites).toEqual([])

    const closed = await owner.invite()
    expect((await owner.deleteInvite(closed.inviteId)).body).toEqual({ ok: true })
    expect((await joe.join(closed)).status).toBe(404)

    const twice = await owner.invite()
    expect(await owner.join(twice)).toMatchObject({ status: 409, body: spacesError('conflict') })

    const late = await owner.invite()
    expect((await owner.deleteSpace()).status).toBe(200)
    expect(await joe.join(late)).toMatchObject({ status: 410, body: spacesError('gone') })
  })

  it('holds members plus open invites to 10, or KV spaces:maxMembers', async () => {
    const { owner } = await spaceOf(3)
    for (let i = 0; i < SPACES_LIMITS.defaultMaxMembers - 4; i++)
      expect((await owner.invite()).response.status).toBe(200)
    const over = await owner.invite()
    expect(over.response).toMatchObject({ status: 429, body: spacesError('limit') })
    expect(over.response.headers.get('retry-after')).toBeNull()

    await h.kv.put('spaces:maxMembers', '12')
    expect((await owner.invite()).response.status).toBe(200)
    // A lowered cap still holds at join: the open invites can't all land.
    await h.kv.put('spaces:maxMembers', '5')
    const pending = (await owner.sync()).body.invites
    expect(pending).toHaveLength(7)
    expect((await owner.invite()).response.body).toEqual(spacesError('limit'))
  })

  it('takes 10 members, then refuses an 11th until the cap rises', async () => {
    const { owner, members } = await spaceOf(SPACES_LIMITS.defaultMaxMembers - 1)
    expect((await owner.sync()).body.members).toHaveLength(10)
    // Any member's invite is refused at the cap.
    for (const member of [owner, members[4]])
      expect((await member.invite()).response).toMatchObject({
        status: 429,
        body: spacesError('limit'),
      })
    await h.kv.put('spaces:maxMembers', '12')
    const eleventh = await owner.other()
    await eleventh.joinVia(members[8])
    const twelfth = await owner.other()
    await twelfth.joinVia(eleventh)
    expect((await owner.sync()).body.members).toHaveLength(12)
    expect((await owner.invite()).response.body).toEqual(spacesError('limit'))
  })

  it('frees an expired invite’s place', async () => {
    const owner = await owned()
    for (let i = 0; i < SPACES_LIMITS.defaultMaxMembers - 1; i++)
      expect((await owner.invite({ expiresAt: Date.now() + HOUR })).response.status).toBe(200)
    expect((await owner.invite()).response.body).toEqual(spacesError('limit'))
    advance(HOUR)
    expect((await owner.invite()).response.status).toBe(200)
    expect((await owner.sync()).body.invites).toHaveLength(1)
  })

  it('refuses a join past a lowered cap', async () => {
    const owner = await owned()
    const invites = [await owner.invite(), await owner.invite(), await owner.invite()]
    await h.kv.put('spaces:maxMembers', '2')
    const joe = await owner.other()
    expect(await joe.join(invites[0])).toMatchObject({ status: 429, body: spacesError('limit') })
    // Closing the other invites frees the places.
    await owner.deleteInvite(invites[1].inviteId)
    await owner.deleteInvite(invites[2].inviteId)
    expect((await joe.join(invites[0])).status).toBe(200)
  })

  it('takes closing a used invite as a no-op from any member, and an open one from its inviter or the owner only', async () => {
    const { owner, members } = await spaceOf(2)
    const [joe, ann] = members
    const joes = await joe.invite()
    const bo = await owner.other()
    const joined = await bo.join(joes)
    expect(joined.status).toBe(200)
    const seq = (await owner.sync()).body.seq
    // Ann neither made it nor owns the space, but it's used: nothing to close.
    expect(await ann.deleteInvite(joes.inviteId)).toMatchObject({ status: 200, body: { ok: true } })
    expect((await owner.sync()).body.seq).toBe(seq)
    // It still answers Bo's retried join.
    expect((await bo.join(joes)).body).toEqual(joined.body)
    // An open one is hers to close only if she made it.
    const open = await joe.invite()
    expect(await ann.deleteInvite(open.inviteId)).toMatchObject({
      status: 403,
      body: spacesError('forbidden'),
    })
    expect(ids((await owner.sync()).body.invites)).toEqual([open.inviteId])
  })

  it('lets the inviter or the owner close an invite, and nobody else', async () => {
    const { owner, members } = await spaceOf(2)
    const [joe, ann] = members
    const joes = await joe.invite()
    expect(await ann.deleteInvite(joes.inviteId)).toMatchObject({
      status: 403,
      body: spacesError('forbidden'),
    })
    expect((await joe.deleteInvite(joes.inviteId)).body).toEqual({ ok: true })
    const another = await joe.invite()
    expect((await owner.deleteInvite(another.inviteId)).body).toEqual({ ok: true })
    // Already closed, or never there.
    const seq = (await owner.sync()).body.seq
    expect((await owner.deleteInvite(another.inviteId)).body).toEqual({ ok: true })
    expect((await owner.deleteInvite(randomId())).body).toEqual({ ok: true })
    expect((await owner.sync()).body.seq).toBe(seq)
  })
})

describe('gone versus forbidden', () => {
  it('says gone for a member not on the space, forbidden for a wrong token', async () => {
    const owner = await owned()
    const stranger = await SpaceMember.open(h.env, owner.spaceId)
    expect(await stranger.sync()).toMatchObject({ status: 410, body: spacesError('gone') })
    const unknown = await SpaceMember.open(h.env)
    expect(await unknown.sync()).toMatchObject({ status: 410, body: spacesError('gone') })
    // A probe of an unknown space stores nothing.
    expect(h.spaces.storage(unknown.spaceId).tables()).toEqual([])

    const wrongToken = await stranger.send('sync', {
      spaceId: owner.spaceId,
      memberId: owner.memberId,
      token: stranger.token,
      since: 0,
    })
    expect(wrongToken).toMatchObject({ status: 403, body: spacesError('forbidden') })
    for (const op of ['put', 'invite/create', 'leave', 'delete'])
      expect(
        (await stranger.send(op, {
          spaceId: owner.spaceId,
          memberId: owner.memberId,
          token: stranger.token,
          records: [{ recordId: 'a', epoch: 1, stamp: 0, blob: 'AA' }],
          inviteId: randomId(),
          joinVerifier: (await joinSecret()).joinVerifier,
          expiresAt: Date.now() + HOUR,
          epoch: 1,
        })).body,
        op
      ).toEqual(spacesError('forbidden'))
  })
})

describe('leaving, removal, and ownership', () => {
  it('drops a member who leaves, and asks the owner to rekey', async () => {
    const { owner, members } = await spaceOf(2)
    const [joe, ann] = members
    expect((await joe.leave()).body).toEqual({ ok: true })
    expect(await joe.sync()).toMatchObject({ status: 410, body: spacesError('gone') })
    expect(await joe.leave()).toMatchObject({ status: 410 })
    const synced = await ann.sync()
    expect(synced.body.members.map((m: { memberId: string }) => m.memberId)).toEqual([
      owner.memberId,
      ann.memberId,
    ])
    expect(synced.body.rekeyNeeded).toBe(true)
    expect(synced.body.ownerId).toBe(owner.memberId)
  })

  it('passes ownership to the member who joined first when the owner leaves', async () => {
    const { owner, members } = await spaceOf(3)
    const [joe, ann, bo] = members
    expect((await owner.leave()).status).toBe(200)
    expect((await bo.sync()).body.ownerId).toBe(joe.memberId)
    // Owner-only ops follow the role.
    expect((await ann.remove(bo)).status).toBe(403)
    expect((await joe.remove(bo)).status).toBe(200)
    expect((await joe.leave()).status).toBe(200)
    expect((await ann.sync()).body.ownerId).toBe(ann.memberId)
  })

  it('hands off ownership while another member’s put is in flight', async () => {
    const { owner, members } = await spaceOf(2)
    const [joe, ann] = members
    const object = h.spaces.object(owner.spaceId) as SharedSpace
    const put = object.put.bind(object)
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let arrived!: () => void
    const reached = new Promise<void>((resolve) => (arrived = resolve))
    vi.spyOn(object, 'put').mockImplementationOnce(async (args) => {
      arrived()
      await held
      return put(args)
    })
    const inFlight = ann.put([{ recordId: 'trip-1', stamp: START }])
    await reached
    expect((await owner.leave()).status).toBe(200)
    release()
    // Stored after the leave (seq 6) took effect.
    expect((await inFlight).body).toEqual({
      ok: true,
      seq: 7,
      results: [{ recordId: 'trip-1', stored: true }],
    })
    const synced = await ann.sync()
    expect(synced.body).toMatchObject({ ownerId: joe.memberId, rekeyNeeded: true, seq: 7 })
    expect(synced.body.records.map((r: { recordId: string }) => r.recordId)).toEqual(['trip-1'])
    // The new owner rekeys for who's left, and Ann's next puts use it.
    expect((await joe.rekey(2, [joe, ann])).status).toBe(200)
    expect((await ann.put([{ recordId: 'trip-2' }])).status).toBe(200)
  })

  it('deletes the space when its last member leaves', async () => {
    const { owner, members } = await spaceOf(1)
    await owner.leave()
    expect((await members[0].leave()).body).toEqual({ ok: true })
    expect(await members[0].sync()).toMatchObject({ status: 410 })
    expect(h.spaces.storage(owner.spaceId).tables()).toEqual(['tombstone'])
    expect(h.spaces.storage(owner.spaceId).alarm()).toBeNull()
    expect((await owner.create()).status).toBe(410)
  })

  it('lets only the owner remove members, never themselves', async () => {
    const { owner, members } = await spaceOf(2)
    const [joe, ann] = members
    expect(await joe.remove(ann)).toMatchObject({ status: 403, body: spacesError('forbidden') })
    expect(await owner.remove(owner)).toMatchObject({ status: 400, body: spacesError('bad_request') })
    expect((await owner.remove(joe)).body).toEqual({ ok: true })
    expect(await joe.sync()).toMatchObject({ status: 410, body: spacesError('gone') })
    expect((await owner.sync()).body).toMatchObject({ rekeyNeeded: true })
    // Idempotent.
    expect((await owner.remove(joe)).body).toEqual({ ok: true })
    expect((await owner.remove(randomId())).body).toEqual({ ok: true })
  })
})

describe('rekey', () => {
  it('moves every current member to the next epoch and closes open invites', async () => {
    const { owner, members } = await spaceOf(2)
    const [joe, ann] = members
    const open = await joe.invite()
    await owner.remove(ann)
    const wraps = { [owner.memberId]: fakeWrap(), [joe.memberId]: fakeWrap() }
    const head = (await owner.sync()).body.seq
    const link = fakeLink()
    const rekeyed = await owner.send('rekey', {
      ...owner.fields,
      epoch: 2,
      wraps: Object.entries(wraps).map(([memberId, wrap]) => ({ memberId, wrap })),
      link,
    })
    // The rekey takes one seq, and its link the next: the head.
    expect(rekeyed.body).toEqual({ ok: true, seq: head + 2 })
    const synced = await joe.sync()
    expect(synced.body).toMatchObject({
      seq: rekeyed.body.seq,
      epoch: 2,
      wrap: wraps[joe.memberId],
      rekeyNeeded: false,
      invites: [],
    })
    expect(synced.body.records).toEqual([
      { recordId: 'k.2', epoch: 2, stamp: link.stamp, deleted: false, blob: link.blob, seq: head + 2 },
    ])
    expect((await owner.sync()).body.wrap).toBe(wraps[owner.memberId])
    expect((await (await owner.other()).join(open)).status).toBe(404)
    // Old-epoch puts are stale now; new-epoch ones land.
    expect(await joe.put([{ epoch: 1 }])).toMatchObject({ status: 409, body: spacesError('stale_key') })
    expect((await joe.put([{ epoch: 2 }])).status).toBe(200)
  })

  it('must name exactly the current members, at the next epoch, from the owner', async () => {
    const { owner, members } = await spaceOf(2)
    const [joe, ann] = members
    const everyone = [owner, joe, ann]
    // Membership changed under the owner's device: sync and try again.
    for (const wraps of [[owner, joe], [...everyone, randomId()], [owner, joe, randomId()]])
      expect(await owner.rekey(2, wraps)).toMatchObject({
        status: 409,
        body: spacesError('conflict'),
      })
    expect((await owner.rekey(2, [owner, joe, joe])).body).toEqual(spacesError('bad_request'))
    expect((await owner.rekey(1, everyone)).body).toEqual(spacesError('bad_request'))
    // The epoch is checked before the members.
    for (const wraps of [everyone, [owner, joe]])
      expect((await owner.rekey(3, wraps)).body).toEqual(spacesError('stale_key'))
    expect((await joe.rekey(2, everyone)).body).toEqual(spacesError('forbidden'))
    expect((await owner.sync()).body).toMatchObject({ epoch: 1, seq: 5 })
    expect((await owner.rekey(2, everyone)).status).toBe(200)
    expect((await owner.rekey(2, everyone)).body).toEqual(spacesError('stale_key'))
  })

  it('stores the link in place of any k.<epoch> already there, whatever its stamp', async () => {
    const { owner, members } = await spaceOf(2)
    const [joe, ann] = members
    // Only an owner puts a k. record. The first owner put a k.2 ahead of
    // time, as far ahead as a stamp may be, deleted to win ties too, and
    // left: Joe owns the space now.
    const planted = b64u(randomBytes(500))
    expect(
      (await owner.put([{ recordId: 'k.2', stamp: Date.now() + DAY, deleted: true, blob: planted }])).status
    ).toBe(200)
    expect((await owner.leave()).status).toBe(200)
    const storage = h.spaces.storage(owner.spaceId)
    const counts = () =>
      storage.query('SELECT record_count AS records, blob_bytes AS bytes, seq FROM space')[0]
    const before = counts()
    const link = fakeLink()
    const rekeyed = await joe.rekey(2, [joe, ann], { link })
    expect(rekeyed.body).toEqual({ ok: true, seq: Number(before.seq) + 2 })
    expect((await ann.sync(Number(before.seq))).body.records).toEqual([
      { recordId: 'k.2', epoch: 2, stamp: link.stamp, deleted: false, blob: link.blob, seq: rekeyed.body.seq },
    ])
    // A replaced version gives its bytes back; a new link counts as a record.
    expect(counts()).toEqual({ records: before.records, bytes: 90, seq: rekeyed.body.seq })
    const next = await joe.rekey(3, [joe, ann])
    expect(next.status).toBe(200)
    expect(counts()).toEqual({ records: Number(before.records) + 1, bytes: 180, seq: next.body.seq })
    expect(storage.query('SELECT COALESCE(SUM(blob_bytes), 0) AS n FROM record')[0].n).toBe(180)
  })

  it('holds the link to the space’s record and byte caps, and changes nothing when it doesn’t fit', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { owner, members } = await spaceOf(1)
    const [joe] = members
    const open = await joe.invite()
    const storage = h.spaces.storage(owner.spaceId)
    storage.query('UPDATE space SET record_count = ?', SPACES_LIMITS.records)
    const head = (await owner.sync()).body.seq
    expect(await owner.rekey(2, [owner, joe])).toMatchObject({ status: 429, body: spacesError('limit') })
    expect((await owner.sync()).body).toMatchObject({ seq: head, epoch: 1, invites: [{ inviteId: open.inviteId }] })
    // Replacing a link it holds adds no record, so it fits.
    storage.query('UPDATE space SET record_count = ?', SPACES_LIMITS.records - 1)
    expect((await owner.put([{ recordId: 'k.2', stamp: 1 }])).status).toBe(200)
    expect((await owner.rekey(2, [owner, joe])).status).toBe(200)
    // Bytes: a 90-byte link past the cap by one.
    storage.query('UPDATE space SET record_count = 3, blob_bytes = ?', SPACES_LIMITS.spaceBytes - 89)
    expect((await owner.rekey(3, [owner, joe])).body).toEqual(spacesError('limit'))
    storage.query('UPDATE space SET blob_bytes = ?', SPACES_LIMITS.spaceBytes - 90)
    expect((await owner.rekey(3, [owner, joe])).status).toBe(200)
    expect(console.warn).toHaveBeenCalledWith('spaces: limit hit', { op: 'spaces/rekey', limit: 'records' })
    expect(console.warn).toHaveBeenCalledWith('spaces: limit hit', { op: 'spaces/rekey', limit: 'spaceBytes' })
  })

  it('checks the link as put checks a record, and needs it', async () => {
    const { owner, members } = await spaceOf(1)
    const [joe] = members
    const everyone = [owner, joe]
    for (const [link, code] of [
      [undefined, 'bad_request'],
      [{ stamp: Date.now() + DAY + 1, blob: fakeLink().blob }, 'bad_request'],
      [{ stamp: Date.now(), blob: 'not base64!' }, 'bad_request'],
      [{ stamp: Date.now(), blob: b64u(randomBytes(SPACES_LIMITS.blobBytes + 1)) }, 'too_large'],
    ] as const)
      expect(await owner.rekey(2, everyone, { link }), JSON.stringify(link)).toMatchObject({
        status: code === 'too_large' ? 413 : 400,
        body: spacesError(code),
      })
    expect((await owner.sync()).body).toMatchObject({ epoch: 1, records: [] })
    expect(
      (await owner.rekey(2, everyone, {
        link: { stamp: Date.now() + DAY, blob: b64u(randomBytes(SPACES_LIMITS.blobBytes)) },
      })).status
    ).toBe(200)
  })

  it('answers empty wraps with conflict: the owner is always a member', async () => {
    const owner = await owned()
    expect(await owner.rekey(2, [])).toMatchObject({ status: 409, body: spacesError('conflict') })
    expect((await owner.sync()).body).toMatchObject({ epoch: 1, seq: 1 })
  })

  it('counts its link against neither put rate', async () => {
    const { owner, members } = await spaceOf(1)
    const [joe] = members
    const storage = h.spaces.storage(owner.spaceId)
    const rates = () => ({
      hours: storage.query('SELECT hour, records FROM put_hour'),
      puts: storage.query('SELECT member_id, at, puts FROM member_put'),
    })
    expect((await owner.rekey(2, [owner, joe])).status).toBe(200)
    expect((await owner.rekey(3, [owner, joe])).status).toBe(200)
    expect(rates()).toEqual({ hours: [], puts: [] })
    // With the owner's minute and the space's day spent, a rekey still lands.
    for (let i = 0; i < SPACES_LIMITS.memberPuts; i++)
      expect((await owner.put([{}])).status).toBe(200)
    storage.query('UPDATE put_hour SET records = ?', SPACES_LIMITS.spaceRecordsPerDay)
    expect((await owner.put([{}])).body.code).toBe('rate_limited')
    const before = rates()
    expect((await owner.rekey(4, [owner, joe])).status).toBe(200)
    expect(rates()).toEqual(before)
  })

  it('rolls back whole when storing its link throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { owner, members } = await spaceOf(2)
    const [joe, ann] = members
    await joe.invite()
    await ann.leave()
    const snapshot = async () => ({ owner: (await owner.sync()).body, joe: (await joe.sync()).body })
    const before = await snapshot()
    expect(before.owner).toMatchObject({ epoch: 1, rekeyNeeded: true, invites: [{}] })
    const storage = h.spaces.storage(owner.spaceId)
    const sql = storage.state.storage.sql
    const exec = sql.exec.bind(sql)
    const failing = vi.spyOn(sql, 'exec').mockImplementation(((query: string, ...bindings: unknown[]) => {
      if (query.trim().startsWith('INSERT INTO record')) throw new Error('storage unavailable')
      return exec(query, ...(bindings as never[]))
    }) as typeof sql.exec)
    expect(await owner.rekey(2, [owner, joe])).toMatchObject({ status: 500, body: spacesError('internal') })
    failing.mockRestore()
    // Epoch, wraps, invites, rekeyNeeded, and seq are as they were.
    expect(await snapshot()).toEqual(before)
    expect(storage.query('SELECT invite_id FROM closed_invite')).toEqual([])
    expect((await owner.rekey(2, [owner, joe])).status).toBe(200)
  })

  it('races a join: a join that lands first makes the rekey a conflict', async () => {
    const { owner, members } = await spaceOf(1)
    const [joe] = members
    const invite = await joe.invite()
    // The owner's device synced before Ann joined.
    const seen = (await owner.sync()).body.members.map((m: { memberId: string }) => m.memberId)
    const ann = await owner.other()
    advance(1_000)
    expect((await ann.join(invite)).status).toBe(200)
    expect((await owner.rekey(2, seen)).body).toEqual(spacesError('conflict'))
    const fresh = (await owner.sync()).body
    expect(ids(fresh.members)).toEqual([owner.memberId, joe.memberId, ann.memberId])
    expect((await owner.rekey(2, [owner, joe, ann])).status).toBe(200)
    expect((await ann.sync()).body).toMatchObject({ epoch: 2 })
    expect((await ann.put([{}])).status).toBe(200)
  })

  it('races a join: a rekey that lands first closes the invite, and the new one carries the new epoch', async () => {
    const { owner, members } = await spaceOf(1)
    const [joe] = members
    const invite = await joe.invite()
    expect((await owner.rekey(2, [owner, joe])).status).toBe(200)
    const ann = await owner.other()
    expect(await ann.join(invite)).toMatchObject({ status: 404, body: spacesError('not_found') })
    // Joe's device sends it again: refused at the old epoch, open at the new one.
    expect((await joe.invite({ epoch: 1 })).response.body).toEqual(spacesError('stale_key'))
    const again = await joe.invite()
    expect(again.epoch).toBe(2)
    const joined = await ann.join(again)
    expect(joined.body).toMatchObject({ ok: true, epoch: 2 })
    expect((await owner.sync()).body).toMatchObject({ rekeyNeeded: false, epoch: 2 })
  })
})

describe('delete', () => {
  it('lets the owner wipe the space; everyone then gets gone', async () => {
    const { owner, members } = await spaceOf(1)
    const [joe] = members
    await owner.put([{}, { deleted: true }])
    const invite = await owner.invite()
    const storage = h.spaces.storage(owner.spaceId).state.storage
    const deleteAll = vi.spyOn(storage, 'deleteAll')
    expect(await joe.deleteSpace()).toMatchObject({ status: 403, body: spacesError('forbidden') })
    expect(deleteAll).not.toHaveBeenCalled()
    expect((await owner.deleteSpace()).body).toEqual({ ok: true })
    // The storage itself is freed, not only its tables dropped.
    expect(deleteAll).toHaveBeenCalledTimes(1)
    for (const response of [
      await owner.sync(),
      await joe.sync(),
      await joe.put([{}]),
      await joe.leave(),
      await owner.deleteSpace(),
      await (await owner.other()).join(invite),
    ])
      expect(response).toMatchObject({ status: 410, body: spacesError('gone') })
    expect(h.spaces.storage(owner.spaceId).tables()).toEqual(['tombstone'])
    expect(h.spaces.storage(owner.spaceId).alarm()).toBeNull()
  })

  it('frees the storage when the last member leaves', async () => {
    const owner = await owned()
    const deleteAll = vi.spyOn(h.spaces.storage(owner.spaceId).state.storage, 'deleteAll')
    expect((await owner.leave()).status).toBe(200)
    expect(deleteAll).toHaveBeenCalledTimes(1)
    expect(h.spaces.storage(owner.spaceId).query('SELECT deleted_at AS at FROM tombstone')).toEqual([
      { at: START },
    ])
  })

  it('is gone at once even if freeing the storage fails, and the alarm tries again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const owner = await owned()
    await owner.put([{}])
    const state = h.spaces.storage(owner.spaceId)
    const deleteAll = vi
      .spyOn(state.state.storage, 'deleteAll')
      .mockRejectedValueOnce(new Error('storage unavailable'))
    // workerd resets an object whose blockConcurrencyWhile callback rejects,
    // and fails the request: the client sees 500, though the wipe committed.
    expect(await owner.deleteSpace()).toMatchObject({ status: 500, body: spacesError('internal') })
    expect(console.error).toHaveBeenCalledWith('spaces: request failed', { op: 'delete' })
    // Its retry gets gone.
    expect(await owner.deleteSpace()).toMatchObject({ status: 410, body: spacesError('gone') })
    expect(await owner.sync()).toMatchObject({ status: 410, body: spacesError('gone') })
    expect(await owner.create()).toMatchObject({ status: 410, body: spacesError('gone') })
    expect(state.tables()).toEqual(['tombstone'])
    expect(state.alarm()).toBe(Date.now() + 10 * MINUTE)
    expect(console.warn).toHaveBeenCalledWith('spaces: storage purge failed; retrying from the alarm')

    advance(10 * MINUTE)
    await h.spaces.fireAlarm(owner.spaceId)
    expect(deleteAll).toHaveBeenCalledTimes(2)
    expect(state.tables()).toEqual(['tombstone'])
    expect(state.query('SELECT deleted_at AS at FROM tombstone')).toEqual([{ at: START }])
    expect(state.alarm()).toBeNull()
    expect((await owner.create()).status).toBe(410)
  })
})

describe('suspension', () => {
  it('refuses create, put, invite/create, and join; everything else still works', async () => {
    const { owner, members } = await spaceOf(2)
    const [joe, ann] = members
    const invite = await owner.invite()
    await suspend(owner)
    const fresh = await SpaceMember.open(h.env, randomId(), owner.session)
    const refused = spacesError('suspended')
    expect(await fresh.create()).toMatchObject({ status: 403, body: refused })
    expect((await owner.put([{}])).body).toEqual(refused)
    expect((await owner.invite()).response.body).toEqual(refused)
    const suspendedJoiner = await owner.other()
    await suspend(suspendedJoiner)
    expect((await suspendedJoiner.join(invite)).body).toEqual(refused)

    expect((await owner.sync()).status).toBe(200)
    expect((await owner.deleteInvite(invite.inviteId)).status).toBe(200)
    expect((await owner.remove(ann)).status).toBe(200)
    expect((await owner.rekey(2, [owner, joe])).status).toBe(200)
    // Others on the space aren't affected.
    expect((await joe.put([{ epoch: 2 }])).status).toBe(200)
    expect((await owner.deleteSpace()).status).toBe(200)
  })

  it('lets a suspended member leave', async () => {
    const { members } = await spaceOf(1)
    await suspend(members[0])
    expect((await members[0].leave()).status).toBe(200)
  })
})

describe('kill switch', () => {
  it('refuses everything but leave, member/remove, and delete while off', async () => {
    const { owner, members } = await spaceOf(2)
    const [joe, ann] = members
    const invite = await owner.invite()
    await h.kv.put('spaces:enabled', 'false')
    const fresh = await SpaceMember.open(h.env)
    for (const response of [
      await fresh.create(),
      await owner.sync(),
      await owner.put([{}]),
      (await owner.invite()).response,
      await owner.deleteInvite(invite.inviteId),
      await (await owner.other()).join(invite),
      await owner.rekey(2, [owner, joe, ann]),
      await owner.live(),
    ]) {
      expect(response.status).toBe(503)
      expect(response.body).toMatchObject({ code: 'disabled', retryAfter: 60 })
    }
    expect((await ann.leave()).status).toBe(200)
    expect((await owner.remove(joe)).status).toBe(200)
    expect((await owner.deleteSpace()).status).toBe(200)
  })

  it('falls back to SPACES_ENABLED, which KV overrides', async () => {
    h = await createHarness({ spacesEnabled: 'false' })
    const owner = await SpaceMember.open(h.env)
    expect((await owner.create()).status).toBe(503)
    await h.kv.put('spaces:enabled', 'true')
    expect((await owner.create()).status).toBe(200)
  })

  it('takes no Supporter check', async () => {
    const owner = await owned()
    expect((await owner.put([{}])).status).toBe(200)
  })
})

describe('privacy', () => {
  it('never logs ids, tokens, or blobs', async () => {
    const logs: unknown[] = []
    for (const level of ['log', 'warn', 'error', 'info'] as const)
      vi.spyOn(console, level).mockImplementation((...args) => logs.push(args))
    const { owner, members } = await spaceOf(1)
    const blob = 'Q'.repeat(40)
    await owner.put([{ recordId: 'trip-1', blob }])
    await owner.sync()
    await owner.put([{ recordId: 'x', epoch: 7 }])
    await members[0].leave()
    await owner.deleteSpace()
    const text = JSON.stringify(logs)
    for (const secret of [
      owner.spaceId,
      owner.memberId,
      owner.dhPub,
      owner.token,
      members[0].memberId,
      owner.session.accountId,
      owner.session.accessToken,
      'trip-1',
      blob,
    ])
      expect(text).not.toContain(secret)
  })

  it('never logs or reports invite ids, join secrets, verifiers, token hashes, wraps, or the live headers', async () => {
    const logs: unknown[] = []
    for (const level of ['log', 'warn', 'error', 'info', 'debug'] as const)
      vi.spyOn(console, level).mockImplementation((...args) => logs.push(args))
    const recorder = recordSentryEvents()
    try {
      const owner = await owned()
      const joe = await owner.other()
      const invite = await owner.invite()
      const joinWrap = fakeWrap()
      expect((await joe.join(invite, { wrap: joinWrap })).status).toBe(200)
      const wraps = [
        { memberId: owner.memberId, wrap: fakeWrap() },
        { memberId: joe.memberId, wrap: fakeWrap() },
      ]
      const link = fakeLink()
      expect((await owner.rekey(2, [owner, joe], { wraps, link })).status).toBe(200)
      const open = await owner.invite()
      expect((await owner.live()).status).toBe(101)
      // A wrong secret and a wrong live token are refused, not logged.
      const wrongSecret = (await joinSecret()).joinSecret
      expect((await (await owner.other()).join({ ...open, joinSecret: wrongSecret })).status).toBe(403)
      const stranger = await owner.other()
      expect((await stranger.live({ 'x-ww-space-auth': owner.liveHeader() })).status).toBe(403)

      // Every op again on broken storage, so each failure reaches Sentry.
      const storage = h.spaces.storage(owner.spaceId)
      storage.query('DROP TABLE invite')
      const failures = [
        (await owner.invite()).response,
        await (await owner.other()).join(open),
        await owner.deleteInvite(open.inviteId),
        await owner.rekey(3, [owner, joe], { link: fakeLink() }),
        await owner.remove(joe),
      ]
      storage.query('DROP TABLE member')
      failures.push(await owner.sync(), await owner.leave())
      const live = await owner.live()
      for (const failed of [...failures, live])
        expect(failed).toMatchObject({ status: 500, body: spacesError('internal') })

      const events = await recorder.events()
      expect(events.map((event) => event.exception?.values?.[0]?.value)).toEqual([
        'spaces/invite/create',
        'spaces/join',
        'spaces/invite/delete',
        'spaces/rekey',
        'spaces/member/remove',
        'spaces/sync',
        'spaces/leave',
        'spaces/live',
      ])
      const text = JSON.stringify({ logs, events })
      for (const secret of [
        invite.inviteId,
        open.inviteId,
        invite.joinSecret,
        invite.joinVerifier,
        open.joinSecret,
        open.joinVerifier,
        wrongSecret,
        await owner.tokenHash(),
        await joe.tokenHash(),
        await stranger.tokenHash(),
        joinWrap,
        ...wraps.map((entry) => entry.wrap),
        link.blob,
        owner.liveHeader(),
        owner.token,
        stranger.token,
        owner.spaceId,
        owner.memberId,
        joe.memberId,
      ])
        expect(text).not.toContain(secret)
    } finally {
      recorder.stop()
    }
  })

  it('logs limit hits under its own prefix, naming the op and the limit only', async () => {
    h = await createHarness({ unsignedLimit: 1 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const owner = await owned()
    await h.kv.put('spaces:maxMembers', '1')
    await owner.invite()
    await h.kv.put('spaces:maxMembers', '3')
    const joe = await owner.other()
    const invite = await owner.invite()
    expect((await joe.join({ ...invite, joinSecret: (await joinSecret()).joinSecret })).status).toBe(403)
    expect((await joe.join(invite)).body.code).toBe('rate_limited')
    expect(warn.mock.calls).toEqual([
      ['spaces: limit hit', { op: 'spaces/invite/create', limit: 'maxMembers' }],
      ['spaces: limit hit', { op: 'spaces/join', limit: 'edge.unsigned' }],
    ])
  })

  it('reports a failure to Sentry as the op alone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const recorder = recordSentryEvents()
    try {
      const owner = await owned()
      // A real SQLite error from the space DO.
      h.spaces.storage(owner.spaceId).query('DROP TABLE put_hour')
      const blob = 'Q'.repeat(40)
      const failed = await owner.put([{ recordId: 'trip-1', blob }])
      expect(failed).toMatchObject({ status: 500, body: spacesError('internal') })
      const events = await recorder.events()
      expect(events).toHaveLength(1)
      expect(events[0].exception?.values).toEqual([
        expect.objectContaining({ type: 'OperationError', value: 'spaces/put' }),
      ])
      const json = JSON.stringify(events[0])
      for (const secret of ['put_hour', 'no such table', owner.spaceId, owner.memberId, 'trip-1', blob])
        expect(json).not.toContain(secret)
      expect(console.error).toHaveBeenCalledWith('spaces: request failed', { op: 'put' })
    } finally {
      recorder.stop()
    }
  })
})
