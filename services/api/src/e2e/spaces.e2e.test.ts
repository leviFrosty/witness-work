import { afterAll, describe, expect, it } from 'vitest'
import {
  b64u,
  blobOfSize,
  randomBytes,
  randomId,
  sha256B64u,
  spaceMemberId,
} from '../test/buddiesClient'
import {
  DEV_BYPASS_TOKEN,
  LOCAL_LAUNCHER,
  bearerHeaders,
  http,
  localKv,
  openLive,
  openSession,
  writeTranscript,
  type E2ESession,
} from '../test/e2e'

/**
 * Shared Spaces (witness-work ADR 0037, Shared Cars) over real HTTP against
 * the local worker's `SharedSpace` Durable Object: three accounts create a
 * space, invite and join, put and sync, rekey with its link after a removal
 * (no open invite lets the removed member back), and leave until the space
 * is gone; reserved record ids, joins at another epoch, and closed invites;
 * deleting and leaving after a sync page cut by its size budget (real
 * SQLite, where an unfinished cursor would block the wipe); plus the live
 * socket and the kill switch.
 */

afterAll(() => {
  writeTranscript('spaces')
})

const wrap = () => blobOfSize(105)

interface Invite {
  inviteId: string
  joinSecret: string
  joinVerifier: string
  expiresAt: number
  epoch: number
}

/**
 * One person on one space, on their own account session, with the X25519
 * public key (random bytes stand in) their member id commits to.
 */
class Member {
  readonly tokenBytes = randomBytes(32)
  readonly token = b64u(this.tokenBytes)
  readonly dhPub = b64u(randomBytes(32))
  memberId = ''
  epoch = 1

  private constructor(
    readonly session: E2ESession,
    readonly spaceId: string
  ) {}

  static async open(spaceId: string): Promise<Member> {
    const member = new Member(await openSession(), spaceId)
    member.memberId = await spaceMemberId(spaceId, member.dhPub)
    return member
  }

  get fields() {
    return { spaceId: this.spaceId, memberId: this.memberId, token: this.token }
  }

  op(op: string, body: Record<string, unknown>) {
    return http('POST', `/spaces/v1/${op}`, {
      body,
      headers: bearerHeaders(this.session),
    })
  }

  readonly #wrap = wrap()

  async create() {
    return this.op('create', {
      spaceId: this.spaceId,
      memberId: this.memberId,
      dhPub: this.dhPub,
      tokenHash: await sha256B64u(this.tokenBytes),
      wrap: this.#wrap,
    })
  }

  sync(since = 0) {
    return this.op('sync', { ...this.fields, since })
  }

  put(records: Record<string, unknown>[]) {
    return this.op('put', { ...this.fields, records })
  }

  /** Opens an invite; `again` sends one it opened before, as a retry does. */
  async invite(again?: Invite) {
    const secret = randomBytes(32)
    const invite = again ?? {
      inviteId: randomId(),
      joinSecret: b64u(secret),
      joinVerifier: await sha256B64u(secret),
      expiresAt: Date.now() + 7 * 24 * 60 * 60_000,
      epoch: this.epoch,
    }
    const response = await this.op('invite/create', {
      ...this.fields,
      inviteId: invite.inviteId,
      joinVerifier: invite.joinVerifier,
      expiresAt: invite.expiresAt,
      epoch: invite.epoch,
    })
    return { ...invite, response }
  }

  /** Joins at the invitation's epoch, as the app sends the `car.invite`'s. */
  async join(invite: { inviteId: string; joinSecret: string; epoch: number }) {
    return this.op('join', {
      spaceId: this.spaceId,
      inviteId: invite.inviteId,
      joinSecret: invite.joinSecret,
      epoch: invite.epoch,
      memberId: this.memberId,
      dhPub: this.dhPub,
      tokenHash: await sha256B64u(this.tokenBytes),
      wrap: wrap(),
    })
  }

  live() {
    const ids = { spaceId: this.spaceId, memberId: this.memberId }
    return openLive(
      {
        ...bearerHeaders(this.session),
        upgrade: 'websocket',
        'x-ww-space-auth': b64u(new TextEncoder().encode(JSON.stringify(ids))),
        'x-ww-space-token': this.token,
      },
      '/spaces/v1/live'
    )
  }
}

const record = (recordId: string, epoch: number, stamp = Date.now()) => ({
  recordId,
  epoch,
  stamp,
  blob: blobOfSize(200),
})

/** A rekey's `link`: the record `k.<epoch>`, opaque here. */
const link = () => ({ stamp: Date.now(), blob: blobOfSize(90) })

const BLOB_BYTES = 16 * 1_024

/**
 * Puts `count` records of 16 KiB (40 a put, under the 1 MiB body cap), more
 * than one sync page's 4 MiB of blobs once there are about 200.
 */
const fill = async (member: Member, count: number) => {
  const stamp = Date.now()
  for (let at = 0; at < count; at += 40) {
    const records = Array.from({ length: Math.min(40, count - at) }, (_, i) => ({
      recordId: `fill.${at + i}`,
      epoch: member.epoch,
      stamp: stamp + at + i,
      blob: blobOfSize(BLOB_BYTES),
    }))
    const put = await member.put(records)
    expect(put.status, JSON.stringify(put.body)).toBe(200)
  }
}

/** A sync from 0 that stops on the page's size budget, not its record limit. */
const syncCutBySize = async (member: Member, total: number) => {
  const page = await member.sync()
  expect(page.status).toBe(200)
  expect(page.body.more).toBe(true)
  expect(page.body.records.length).toBeLessThan(total)
  expect(page.body.records.length).toBeLessThan(1_000)
  return page
}

describe('Shared Spaces without a session', () => {
  // The local launcher runs `--env dev`, where Shared Spaces is on.
  it.skipIf(!LOCAL_LAUNCHER)('refuses a request without a bearer token', async () => {
    const response = await http('POST', '/spaces/v1/sync', { body: {} })
    expect(response.status).toBe(401)
    expect(response.body).toEqual({ ok: false, error: 'unauthorized', code: 'unauthorized' })
    expect(response.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"')
  })
})

describe.skipIf(!DEV_BYPASS_TOKEN)('Shared Spaces with three accounts', () => {
  it('creates, invites, joins, puts, syncs, rekeys after a removal, and leaves', async () => {
    const spaceId = randomId()
    const anna = await Member.open(spaceId)
    const joe = await Member.open(spaceId)
    const bo = await Member.open(spaceId)

    const created = await anna.create()
    expect(created.body).toEqual({ ok: true, seq: 1, joinedAt: expect.any(Number) })
    // A retried create (a lost answer) gets the same answer.
    expect((await anna.create()).body).toEqual(created.body)
    // A member id that doesn't match its key is refused.
    const mismatched = await anna.op('create', {
      spaceId: randomId(),
      memberId: anna.memberId,
      dhPub: anna.dhPub,
      tokenHash: await sha256B64u(anna.tokenBytes),
      wrap: wrap(),
    })
    expect(mismatched.status).toBe(400)
    expect(mismatched.body.code).toBe('bad_request')

    // Anna invites Joe; Joe invites Bo (any member can).
    const forJoe = await anna.invite()
    expect(forJoe.response.body).toEqual({ ok: true })
    const joined = await joe.join(forJoe)
    expect(joined.body).toEqual({ ok: true, seq: 3, epoch: 1, joinedAt: expect.any(Number) })
    // A retry after a lost answer gets the same answer, with the same joinedAt.
    expect((await joe.join(forJoe)).body).toEqual(joined.body)
    const forBo = await joe.invite()
    expect(forBo.response.status).toBe(200)
    expect((await bo.join({ ...forBo, joinSecret: b64u(randomBytes(32)) })).body.code).toBe(
      'forbidden'
    )
    expect((await bo.join(forBo)).status).toBe(200)

    // Joe's live socket hears Anna's put.
    const joeLive = await joe.live()
    expect(joeLive.status).toBe(101)
    if (joeLive.status !== 101) return
    const hello = JSON.parse(await joeLive.connection.next())
    expect(hello).toEqual({ type: 'hello', seq: 5 })
    joeLive.connection.send('ping')
    expect(await joeLive.connection.next()).toBe('pong')
    const boLive = await bo.live()
    expect(boLive.status).toBe(101)
    if (boLive.status !== 101) return
    await boLive.connection.next()

    const put = await anna.put([record('car-1', 1), record('trip-1', 1)])
    expect(put.body).toEqual({
      ok: true,
      seq: 7,
      results: [
        { recordId: 'car-1', stored: true },
        { recordId: 'trip-1', stored: true },
      ],
    })
    expect(JSON.parse(await joeLive.connection.next())).toEqual({ type: 'changed', seq: 7 })

    // An older edit loses; a deletion with the same stamp wins.
    const stamp = Date.now() + 1_000
    await joe.put([record('trip-2', 1, stamp)])
    expect((await bo.put([record('trip-2', 1, stamp - 1)])).body.results).toEqual([
      { recordId: 'trip-2', stored: false },
    ])
    expect(
      (await bo.put([{ ...record('trip-2', 1, stamp), deleted: true }])).body.results
    ).toEqual([{ recordId: 'trip-2', stored: true }])

    const synced = await bo.sync()
    expect(synced.body).toMatchObject({
      ok: true,
      epoch: 1,
      ownerId: anna.memberId,
      rekeyNeeded: false,
      more: false,
      invites: [],
    })
    expect(
      synced.body.members.map((m: { memberId: string; dhPub: string }) => [m.memberId, m.dhPub])
    ).toEqual([
      [anna.memberId, anna.dhPub],
      [joe.memberId, joe.dhPub],
      [bo.memberId, bo.dhPub],
    ])
    expect(synced.body.members[1].joinedAt).toBe(joined.body.joinedAt)
    expect(
      synced.body.records.map((r: { recordId: string; deleted: boolean }) => [r.recordId, r.deleted])
    ).toEqual([
      ['car-1', false],
      ['trip-1', false],
      ['trip-2', true],
    ])

    // Bo opens an invite of their own, and Joe one for someone else; say
    // Bo's device holds both secrets.
    const bosOwn = await bo.invite()
    expect(bosOwn.response.status).toBe(200)
    const joesOpen = await joe.invite()
    expect(joesOpen.response.status).toBe(200)

    // Anna removes Bo: their socket closes, and their requests are gone.
    const removed = await anna.op('member/remove', { ...anna.fields, removeId: bo.memberId })
    expect(removed.body).toEqual({ ok: true })
    expect(await boLive.connection.closed).toEqual({ code: 4001, reason: 'gone' })
    expect((await bo.sync()).body.code).toBe('gone')
    const afterRemoval = await anna.sync()
    expect(afterRemoval.body.rekeyNeeded).toBe(true)
    // Every open invite closed, not only Bo's: neither lets Bo back in.
    expect(afterRemoval.body.invites).toEqual([])
    for (const invite of [bosOwn, joesOpen]) {
      const rejoin = await bo.join(invite)
      expect(rejoin.status).toBe(404)
      expect(rejoin.body.code).toBe('not_found')
    }
    expect((await bo.sync()).body.code).toBe('gone')

    // Anna rekeys to epoch 2 for everyone left; wraps that still name Bo
    // are a conflict. Old-epoch puts and invites are stale afterwards.
    const open = await joe.invite()
    const stale = await anna.op('rekey', {
      ...anna.fields,
      epoch: 2,
      wraps: [anna, joe, bo].map((m) => ({ memberId: m.memberId, wrap: wrap() })),
      link: link(),
    })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('conflict')
    // A rekey without its link is malformed.
    const unlinked = await anna.op('rekey', {
      ...anna.fields,
      epoch: 2,
      wraps: [anna, joe].map((m) => ({ memberId: m.memberId, wrap: wrap() })),
    })
    expect(unlinked.status).toBe(400)
    expect(unlinked.body.code).toBe('bad_request')
    // Only the owner puts a k. record: Joe's plant is refused. A k.2 the
    // owner's own device put ahead of the rekey is replaced by the link.
    const planted = await joe.put([{ ...record('k.2', 1, Date.now() + 60 * 60_000), deleted: true }])
    expect(planted.status).toBe(403)
    expect(planted.body.code).toBe('forbidden')
    expect(
      (await anna.put([{ ...record('k.2', 1, Date.now() + 60 * 60_000), deleted: true }])).status
    ).toBe(200)
    const head = (await anna.sync()).body.seq
    const theLink = link()
    const rekeyed = await anna.op('rekey', {
      ...anna.fields,
      epoch: 2,
      wraps: [anna, joe].map((m) => ({ memberId: m.memberId, wrap: wrap() })),
      link: theLink,
    })
    expect(rekeyed.body).toEqual({ ok: true, seq: head + 2 })
    const afterRekey = await joe.sync(head)
    expect(afterRekey.body).toMatchObject({ epoch: 2, rekeyNeeded: false, invites: [] })
    expect(afterRekey.body.records).toEqual([
      { recordId: 'k.2', epoch: 2, stamp: theLink.stamp, deleted: false, blob: theLink.blob, seq: head + 2 },
    ])
    expect((await (await Member.open(spaceId)).join(open)).body.code).toBe('not_found')
    expect((await joe.put([record('trip-3', 1)])).body.code).toBe('stale_key')
    expect((await joe.invite()).response.body.code).toBe('stale_key')
    joe.epoch = 2
    expect((await joe.put([record('trip-3', 2)])).status).toBe(200)
    const atNewKey = await joe.invite()
    expect(atNewKey.response.status).toBe(200)
    const cy = await Member.open(spaceId)
    expect((await cy.join(atNewKey)).body).toMatchObject({ ok: true, epoch: 2 })
    expect((await cy.op('leave', cy.fields)).status).toBe(200)

    // Anna leaves: Joe owns the space; when Joe leaves too, it's deleted.
    expect((await anna.op('leave', anna.fields)).status).toBe(200)
    expect((await joe.sync()).body.ownerId).toBe(joe.memberId)
    expect((await joe.op('leave', joe.fields)).status).toBe(200)
    expect(await joeLive.connection.closed).toEqual({ code: 4001, reason: 'gone' })
    expect((await joe.sync()).body.code).toBe('gone')
    expect((await anna.create()).body.code).toBe('gone')
    joeLive.connection.end()
    boLive.connection.end()
  })

  it('keeps reserved records to their members, joins to the current epoch, and closed invites closed', async () => {
    const spaceId = randomId()
    const owner = await Member.open(spaceId)
    const joe = await Member.open(spaceId)
    expect((await owner.create()).status).toBe(200)
    expect((await joe.join(await owner.invite())).status).toBe(200)

    // m.<memberId> is that member's, k.<x> the owner's; a batch naming
    // someone else's stores nothing.
    expect((await owner.put([record(`m.${owner.memberId}`, 1)])).status).toBe(200)
    expect((await joe.put([record(`m.${joe.memberId}`, 1)])).status).toBe(200)
    const head = (await owner.sync()).body.seq
    for (const records of [
      [record(`m.${owner.memberId}`, 1)],
      [{ ...record(`m.${owner.memberId}`, 1), deleted: true }],
      [record('k.2', 1)],
      [record('trip-1', 1), record(`m.${owner.memberId}`, 1)],
    ]) {
      const refused = await joe.put(records)
      expect(refused.status).toBe(403)
      expect(refused.body.code).toBe('forbidden')
    }
    expect((await owner.sync()).body.seq).toBe(head)

    // A fresh join needs the current epoch; nobody joins at another.
    const bo = await Member.open(spaceId)
    const invite = await owner.invite()
    const stale = await bo.join({ ...invite, epoch: 2 })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('stale_key')
    const joined = await bo.join(invite)
    expect(joined.body).toMatchObject({ ok: true, epoch: 1 })
    // After a rekey, its retry answers with the current epoch and the
    // original joinedAt.
    const rekeyed = await owner.op('rekey', {
      ...owner.fields,
      epoch: 2,
      wraps: [owner, joe, bo].map((m) => ({ memberId: m.memberId, wrap: wrap() })),
      link: link(),
    })
    expect(rekeyed.status).toBe(200)
    owner.epoch = 2
    expect((await bo.join(invite)).body).toEqual({
      ok: true,
      seq: rekeyed.body.seq,
      epoch: 2,
      joinedAt: joined.body.joinedAt,
    })

    // A closed invite's id never opens again.
    const closed = await owner.invite()
    expect((await owner.op('invite/delete', { ...owner.fields, inviteId: closed.inviteId })).status).toBe(200)
    const reopened = (await owner.invite(closed)).response
    expect(reopened.status).toBe(409)
    expect(reopened.body.code).toBe('conflict')
    expect((await (await Member.open(spaceId)).join(closed)).body.code).toBe('not_found')
    expect((await owner.sync()).body.invites).toEqual([])
    expect((await owner.op('delete', owner.fields)).status).toBe(200)
  })

  it('refuses a wrong member token with forbidden, and an unknown member with gone', async () => {
    const spaceId = randomId()
    const owner = await Member.open(spaceId)
    expect((await owner.create()).status).toBe(200)
    const stranger = await Member.open(spaceId)
    expect((await stranger.sync()).body.code).toBe('gone')
    const wrongToken = await stranger.op('sync', {
      spaceId,
      memberId: owner.memberId,
      token: stranger.token,
      since: 0,
    })
    expect(wrongToken.status).toBe(403)
    expect(wrongToken.body.code).toBe('forbidden')
    expect((await owner.op('delete', owner.fields)).status).toBe(200)
  })

  it('deletes a space after a sync page cut by its size budget', async () => {
    const owner = await Member.open(randomId())
    expect((await owner.create()).status).toBe(200)
    await fill(owner, 240)
    await syncCutBySize(owner, 240)
    const deleted = await owner.op('delete', owner.fields)
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200)
    expect(deleted.body).toEqual({ ok: true })
    expect((await owner.sync()).body.code).toBe('gone')
    expect((await owner.create()).body.code).toBe('gone')
  })

  it('lets the last member leave after a sync page cut by its size budget', async () => {
    const spaceId = randomId()
    const owner = await Member.open(spaceId)
    const joe = await Member.open(spaceId)
    expect((await owner.create()).status).toBe(200)
    expect((await joe.join(await owner.invite())).status).toBe(200)
    await fill(owner, 240)
    await syncCutBySize(joe, 240)
    // The owner leaves (Joe owns it now), then Joe, the last one.
    expect((await owner.op('leave', owner.fields)).status).toBe(200)
    expect((await joe.sync()).body.ownerId).toBe(joe.memberId)
    await syncCutBySize(joe, 240)
    const left = await joe.op('leave', joe.fields)
    expect(left.status, JSON.stringify(left.body)).toBe(200)
    expect(left.body).toEqual({ ok: true })
    expect((await joe.sync()).body.code).toBe('gone')
    expect((await owner.create()).body.code).toBe('gone')
  })

  it.skipIf(!LOCAL_LAUNCHER)(
    'turns off with spaces:enabled, except leaving, removing, and deleting',
    async () => {
      const spaceId = randomId()
      const owner = await Member.open(spaceId)
      const joe = await Member.open(spaceId)
      expect((await owner.create()).status).toBe(200)
      expect((await joe.join(await owner.invite())).status).toBe(200)
      localKv('put', 'spaces:enabled', 'false')
      try {
        const refused = await owner.sync()
        expect(refused.status).toBe(503)
        expect(refused.body).toMatchObject({ code: 'disabled', retryAfter: 60 })
        expect(refused.headers.get('retry-after')).toBe('60')
        expect((await owner.live()).status).toBe(503)
        expect((await joe.op('leave', joe.fields)).status).toBe(200)
        expect((await owner.op('delete', owner.fields)).status).toBe(200)
      } finally {
        localKv('delete', 'spaces:enabled')
      }
      expect((await owner.sync()).body.code).toBe('gone')
    }
  )
})
