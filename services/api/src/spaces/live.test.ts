import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHarness, b64u, randomBytes, randomId, type Harness } from '../test/buddies'
import { SpaceMember, spacesError } from '../test/spaces'
import type { FakeWebSocket } from '../test/durableObjects'
import { SPACES_LIMITS } from './contracts'

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
 * Shared Spaces' live socket (`GET /spaces/v1/live`), retention, and
 * eviction (witness-work ADR 0037): `hello`, `changed`, ping/pong, the close
 * codes, the upgrade's checks, the 400-day wipe, and what survives the
 * space DO restarting.
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
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)

const owned = async (): Promise<SpaceMember> => {
  const owner = await SpaceMember.open(h.env)
  expect((await owner.create()).status).toBe(200)
  return owner
}

const socketOf = async (member: SpaceMember): Promise<FakeWebSocket> => {
  const attempt = await member.live()
  expect(attempt.status).toBe(101)
  return attempt.socket!
}

describe('live socket', () => {
  it('says hello with the head, then changed after every change', async () => {
    const owner = await owned()
    await owner.put([{}])
    const socket = await socketOf(owner)
    expect(socket.messages()).toEqual([{ type: 'hello', seq: 2 }])

    const seqs: number[] = []
    const expectChanged = async (change: Promise<{ status: number }>) => {
      expect((await change).status).toBe(200)
      seqs.push((await owner.sync()).body.seq)
    }
    const joe = await owner.other()
    const ann = await owner.other()
    await expectChanged(owner.put([{ recordId: 'r', stamp: 5 }]))
    const invite = await owner.invite()
    seqs.push((await owner.sync()).body.seq)
    await expectChanged(joe.join(invite))
    await ann.joinVia(owner)
    seqs.push(seqs.at(-1)! + 1, seqs.at(-1)! + 2)
    await expectChanged(owner.remove(ann))
    await expectChanged(owner.rekey(2, [owner, joe]))
    const closing = await joe.invite()
    seqs.push((await owner.sync()).body.seq)
    await expectChanged(joe.deleteInvite(closing.inviteId))
    await expectChanged(joe.leave())

    expect(socket.messages()).toEqual([
      { type: 'hello', seq: 2 },
      ...seqs.map((seq) => ({ type: 'changed', seq })),
    ])
  })

  it('stays quiet for writes that change nothing and for reads', async () => {
    const owner = await owned()
    await owner.put([{ recordId: 'r', stamp: 5 }])
    const socket = await socketOf(owner)
    await owner.put([{ recordId: 'r', stamp: 4 }])
    await owner.sync()
    await owner.deleteInvite(randomId())
    await owner.put([{ epoch: 2 }])
    expect(socket.messages()).toEqual([{ type: 'hello', seq: 2 }])
  })

  it('tells every socket on the space, members’ other devices included', async () => {
    const owner = await owned()
    const joe = await owner.other()
    await joe.joinVia(owner)
    const phone = await socketOf(owner)
    const tablet = await socketOf(owner)
    const joes = await socketOf(joe)
    await joe.put([{}])
    for (const socket of [phone, tablet, joes])
      expect(socket.messages().at(-1)).toEqual({ type: 'changed', seq: 4 })
  })

  it('answers ping with pong and ignores anything else', async () => {
    const owner = await owned()
    const socket = await socketOf(owner)
    socket.send('ping')
    socket.send('hello?')
    expect(socket.received.slice(1)).toEqual(['pong'])
  })

  it('closes the oldest past 4 sockets per member the cap allows: 40 at 10', async () => {
    const owner = await owned()
    const sockets: FakeWebSocket[] = []
    const cap = SPACES_LIMITS.liveSocketsPerMember * SPACES_LIMITS.defaultMaxMembers
    expect(cap).toBe(40)
    for (let i = 0; i <= cap; i++) {
      sockets.push(await socketOf(owner))
      advance(1)
    }
    expect(sockets[0].closedBy).toEqual({ code: 4002, reason: 'replaced' })
    expect(sockets.slice(1).every((socket) => socket.closedBy == null)).toBe(true)
  })

  it('replaces the opener’s own oldest once they hold 4, so nobody keeps the others out', async () => {
    const owner = await owned()
    const joe = await owner.other()
    await joe.joinVia(owner)
    const cap = SPACES_LIMITS.liveSocketsPerMember * SPACES_LIMITS.defaultMaxMembers
    // Joe's socket is the space's oldest; the owner fills the rest of the cap.
    const joes = await socketOf(joe)
    advance(1)
    const owners: FakeWebSocket[] = []
    for (let i = 1; i < cap; i++) {
      owners.push(await socketOf(owner))
      advance(1)
    }
    expect([joes, ...owners].every((socket) => socket.closedBy == null)).toBe(true)
    // Past the cap, more of the owner's close the owner's own oldest, never Joe's.
    for (let i = 0; i < 3; i++) {
      owners.push(await socketOf(owner))
      advance(1)
    }
    expect(owners.slice(0, 3).map((socket) => socket.closedBy)).toEqual(
      Array(3).fill({ code: 4002, reason: 'replaced' })
    )
    expect(owners.slice(3).every((socket) => socket.closedBy == null)).toBe(true)
    expect(joes.closedBy).toBeNull()
  })

  it('closes the oldest of whoever holds the most for a member holding fewer than 4', async () => {
    const owner = await owned()
    const joe = await owner.other()
    const ann = await owner.other()
    await joe.joinVia(owner)
    await ann.joinVia(owner)
    const cap = SPACES_LIMITS.liveSocketsPerMember * SPACES_LIMITS.defaultMaxMembers
    const joes = [await socketOf(joe), await socketOf(joe)]
    advance(1)
    const owners: FakeWebSocket[] = []
    for (let i = 2; i < cap; i++) {
      owners.push(await socketOf(owner))
      advance(1)
    }
    // Ann holds none: her socket opens by closing the oldest of the owner,
    // who holds the most, though Joe's are the space's oldest.
    const anns = await socketOf(ann)
    expect(owners[0].closedBy).toEqual({ code: 4002, reason: 'replaced' })
    expect(joes.every((socket) => socket.closedBy == null)).toBe(true)
    // Joe holds 2: his next one closes the owner's oldest too.
    advance(1)
    const joesThird = await socketOf(joe)
    expect(owners[1].closedBy).toEqual({ code: 4002, reason: 'replaced' })
    // The owner, holding 36, replaces their own oldest.
    advance(1)
    await socketOf(owner)
    expect(owners[2].closedBy).toEqual({ code: 4002, reason: 'replaced' })
    expect(owners.slice(3).every((socket) => socket.closedBy == null)).toBe(true)
    expect([...joes, joesThird, anns].every((socket) => socket.closedBy == null)).toBe(true)
  })

  it('keeps a member rotating their sockets to stay newest from pushing honest members off', async () => {
    const owner = await owned()
    const joe = await owner.other()
    const ann = await owner.other()
    await joe.joinVia(owner)
    await ann.joinVia(owner)
    // A cap of 3 members allows 12 sockets.
    await h.kv.put('spaces:maxMembers', '3')
    const joes = await socketOf(joe)
    advance(1)
    const owners: FakeWebSocket[] = []
    const open = async () => {
      owners.push(await socketOf(owner))
      advance(1)
    }
    for (let i = 1; i < 12; i++) await open()
    // The owner keeps opening, so theirs are always the newest: each one
    // replaces the owner's own oldest, and Joe's, the space's oldest, stays.
    for (let i = 0; i < 20; i++) await open()
    expect(joes.closedBy).toBeNull()
    // Ann's socket opens by closing one of the owner's, not Joe's.
    const anns = await socketOf(ann)
    advance(1)
    for (let i = 0; i < 20; i++) await open()
    expect([joes, anns].map((socket) => socket.closedBy)).toEqual([null, null])
    const live = owners.filter((socket) => socket.closedBy == null)
    expect(live).toEqual(owners.slice(-10))
  })

  it('spills an excess bigger than the opener’s share over the biggest holders after KV lowers the cap', async () => {
    const owner = await owned()
    const joe = await owner.other()
    const ann = await owner.other()
    await joe.joinVia(owner)
    await ann.joinVia(owner)
    const opened = async (member: SpaceMember, count: number) => {
      const sockets: FakeWebSocket[] = []
      for (let i = 0; i < count; i++) {
        sockets.push(await socketOf(member))
        advance(1)
      }
      return sockets
    }
    const owners = await opened(owner, 6)
    const joes = await opened(joe, 10)
    const anns = await opened(ann, 8)
    expect([...owners, ...joes, ...anns].every((socket) => socket.closedBy == null)).toBe(true)
    // 24 sockets, then a cap of 3 members: 12. The owner's next one is 13
    // past it, more than the 3 of the owner's own it may replace.
    await h.kv.put('spaces:maxMembers', '3')
    const newest = await socketOf(owner)
    const open = (sockets: FakeWebSocket[]) => sockets.filter((socket) => socket.closedBy == null)
    // The owner keeps their newest 3 and the new one; Joe, then Joe and Ann
    // in turn, lose their oldest until the space is at the cap.
    expect(open(owners)).toEqual(owners.slice(3))
    expect(newest.closedBy).toBeNull()
    expect(open(joes)).toEqual(joes.slice(6))
    expect(open(anns)).toEqual(anns.slice(4))
    expect(
      [...owners, ...joes, ...anns]
        .filter((socket) => socket.closedBy != null)
        .every((socket) => socket.closedBy?.code === 4002)
    ).toBe(true)
    expect(h.spaces.storage(owner.spaceId).sockets().filter((ws) => ws.readyState === 1)).toHaveLength(12)
  })

  it('follows the member cap in KV', async () => {
    const owner = await owned()
    await h.kv.put('spaces:maxMembers', '2')
    const sockets: FakeWebSocket[] = []
    for (let i = 0; i < 10; i++) {
      sockets.push(await socketOf(owner))
      advance(1)
    }
    expect(sockets.map((socket) => socket.closedBy?.code ?? null)).toEqual([
      4002, 4002, null, null, null, null, null, null, null, null,
    ])
  })

  it('closes a member’s sockets with 4001 when they leave or are removed', async () => {
    const owner = await owned()
    const joe = await owner.other()
    const ann = await owner.other()
    await joe.joinVia(owner)
    await ann.joinVia(owner)
    const owners = await socketOf(owner)
    const joes = await socketOf(joe)
    const anns = await socketOf(ann)
    await owner.remove(joe)
    expect(joes.closedBy).toEqual({ code: 4001, reason: 'gone' })
    expect(owners.closedBy).toBeNull()
    expect(anns.messages().at(-1)).toMatchObject({ type: 'changed' })
    await ann.leave()
    expect(anns.closedBy).toEqual({ code: 4001, reason: 'gone' })
    expect(owners.closedBy).toBeNull()
  })

  it('closes every socket with 4001 when the space is deleted', async () => {
    const owner = await owned()
    const joe = await owner.other()
    await joe.joinVia(owner)
    const sockets = [await socketOf(owner), await socketOf(joe)]
    await owner.deleteSpace()
    for (const socket of sockets)
      expect(socket.closedBy).toEqual({ code: 4001, reason: 'gone' })
    expect(await owner.live()).toMatchObject({ status: 410, body: spacesError('gone') })
  })

  it('checks the upgrade, the headers, and the member', async () => {
    const owner = await owned()
    const plain = await owner.live({ upgrade: '' })
    expect(plain).toMatchObject({ status: 426, body: spacesError('upgrade_required') })
    const ids = { spaceId: owner.spaceId, memberId: owner.memberId }
    for (const headers of [
      { 'x-ww-space-auth': 'not json' },
      { 'x-ww-space-auth': owner.liveHeader({ spaceId: owner.spaceId }) },
      { 'x-ww-space-auth': b64u(randomBytes(2_000)) },
      { 'x-ww-space-auth': owner.liveHeader({ ...ids, pad: 'x'.repeat(1_024) }) },
      { 'x-ww-space-auth': '' },
      { 'x-ww-space-token': '' },
      { 'x-ww-space-token': owner.token.slice(1) },
      // The token travels in its own header now, not beside the ids.
      { 'x-ww-space-auth': owner.liveHeader(owner.fields), 'x-ww-space-token': '' },
      // The ids' header was x-ww-space before it held "auth"; nothing reads that now.
      { 'x-ww-space-auth': '', 'x-ww-space': owner.liveHeader() },
    ])
      expect(await owner.live(headers), JSON.stringify(headers)).toMatchObject({
        status: 400,
        body: spacesError('bad_request'),
      })
    const stranger = await SpaceMember.open(h.env, owner.spaceId)
    expect(await stranger.live()).toMatchObject({ status: 410, body: spacesError('gone') })
    expect(
      await stranger.live({ 'x-ww-space-auth': owner.liveHeader(), 'x-ww-space-token': stranger.token })
    ).toMatchObject({ status: 403, body: spacesError('forbidden') })
    const anonymous = await owner.live({ authorization: '' })
    expect(anonymous.status).toBe(401)
  })

  it('hands the space only the verified member, without the session or the token', async () => {
    const owner = await owned()
    await h.kv.put('spaces:maxMembers', '7')
    const object = h.spaces.object(owner.spaceId)
    const fetch = vi.spyOn(object, 'fetch')
    await socketOf(owner)
    const forwarded = fetch.mock.calls[0][0].headers
    for (const name of ['authorization', 'x-ww-space-auth', 'x-ww-space-token', 'x-ww-space-member'])
      expect(forwarded.has(name), name).toBe(false)
    // Its name holds "token", so Cloudflare's logs redact the hash it carries.
    expect(JSON.parse(forwarded.get('x-ww-space-member-token')!)).toEqual({
      spaceId: owner.spaceId,
      memberId: owner.memberId,
      tokenHash: await owner.tokenHash(),
      maxMembers: 7,
    })
    expect(forwarded.get('upgrade')).toBe('websocket')
  })

  it('never trusts a client’s member header', async () => {
    const owner = await owned()
    const stranger = await SpaceMember.open(h.env, owner.spaceId)
    const member = JSON.stringify({
      spaceId: owner.spaceId,
      memberId: owner.memberId,
      tokenHash: await owner.tokenHash(),
      maxMembers: 100,
    })
    for (const name of ['x-ww-space-member-token', 'x-ww-space-member'])
      expect(await stranger.live({ [name]: member }), name).toMatchObject({
        status: 410,
        body: spacesError('gone'),
      })
  })
})

describe('retention', () => {
  // A sync records activity at most once a day, so retention waits a day more.
  const RETAINED = SPACES_LIMITS.retentionMs + SPACES_LIMITS.activityGranularityMs

  it('deletes a space 400 days after its last sync or put', async () => {
    const owner = await owned()
    const joe = await owner.other()
    await joe.joinVia(owner)
    const storage = h.spaces.storage(owner.spaceId)
    expect(SPACES_LIMITS.activityGranularityMs).toBe(DAY)
    expect(storage.alarm()).toBe(START + RETAINED)

    // Invites and other ops aren't activity; a sync is.
    advance(300 * DAY)
    await owner.invite()
    await joe.sync()
    // Within a day of the one recorded, a sync isn't recorded (no write).
    advance(12 * HOUR)
    expect((await owner.sync()).status).toBe(200)
    advance(101 * DAY - 12 * HOUR)
    await h.spaces.fireAlarm(owner.spaceId)
    expect(storage.alarm()).toBe(START + 300 * DAY + RETAINED)

    const socket = await socketOf(owner)
    // So it goes at the earliest 400 days after the last sync, the unrecorded one.
    advance(RETAINED - 101 * DAY - 1)
    await h.spaces.fireAlarm(owner.spaceId)
    expect(storage.tables()).not.toEqual(['tombstone'])
    advance(1)
    const deleteAll = vi.spyOn(storage.state.storage, 'deleteAll')
    await h.spaces.fireAlarm(owner.spaceId)
    expect(deleteAll).toHaveBeenCalledTimes(1)
    expect(storage.tables()).toEqual(['tombstone'])
    expect(storage.alarm()).toBeNull()
    expect(socket.closedBy).toEqual({ code: 4001, reason: 'gone' })
    expect(await joe.sync()).toMatchObject({ status: 410, body: spacesError('gone') })
  })

  it('counts a put as activity too', async () => {
    const owner = await owned()
    advance(399 * DAY)
    await owner.put([{}])
    advance(2 * DAY)
    await h.spaces.fireAlarm(owner.spaceId)
    expect((await owner.sync()).status).toBe(200)
  })

  /** Deletes `owner`'s space with `deleteAll()` succeeding and the tombstone's write after it failing. */
  const loseTombstone = async (owner: SpaceMember) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const real = h.spaces.storage(owner.spaceId).state.storage
    const deleteAll = real.deleteAll.bind(real)
    vi.spyOn(real, 'deleteAll').mockImplementationOnce(async () => {
      await deleteAll()
      vi.spyOn(real, 'transactionSync').mockImplementationOnce(() => {
        throw new Error('storage unavailable')
      })
    })
    expect(await owner.deleteSpace()).toMatchObject({ status: 500 })
  }

  // workerd's deleteAll() keeps the alarm before compatibility date
  // 2026-02-24 (wrangler.toml's today) and drops it from then on.
  it.each([
    ['keeps the alarm', false],
    ['drops the alarm, as from compatibility date 2026-02-24', true],
  ])(
    'writes back a tombstone a failed purge lost, before any request, when deleteAll() %s',
    async (_, dropsAlarm) => {
      const owner = await owned()
      const invite = await owner.invite()
      const storage = h.spaces.storage(owner.spaceId)
      storage.deleteAllDeletesAlarm(dropsAlarm)
      await loseTombstone(owner)
      // The reset object writes it back before any request, so the id is
      // never free: neither create nor join gets in.
      const joe = await owner.other()
      expect(await owner.create()).toMatchObject({ status: 410, body: spacesError('gone') })
      expect(await joe.join(invite)).toMatchObject({ status: 410, body: spacesError('gone') })
      expect(await owner.sync()).toMatchObject({ status: 410, body: spacesError('gone') })
      expect(storage.tables()).toEqual(['tombstone'])
      // The retry alarm, set again after deleteAll(), frees the storage again.
      expect(storage.alarm()).toBe(Date.now() + 10 * MINUTE)
      advance(10 * MINUTE)
      const deleteAll = vi.spyOn(storage.state.storage, 'deleteAll')
      deleteAll.mockClear()
      await h.spaces.fireAlarm(owner.spaceId)
      expect(deleteAll).toHaveBeenCalledTimes(1)
      expect(storage.tables()).toEqual(['tombstone'])
      expect(storage.alarm()).toBeNull()
      expect(await owner.create()).toMatchObject({ status: 410, body: spacesError('gone') })
    }
  )

  it('writes the tombstone back from the alarm too', async () => {
    const owner = await owned()
    const storage = h.spaces.storage(owner.spaceId)
    await loseTombstone(owner)
    // Say the reset object found no alarm, then the alarm fires.
    storage.query('DROP TABLE IF EXISTS tombstone')
    advance(10 * MINUTE)
    await h.spaces.fireAlarm(owner.spaceId)
    expect(storage.tables()).toEqual(['tombstone'])
    expect(await owner.create()).toMatchObject({ status: 410, body: spacesError('gone') })
  })

  it('leaves an unknown space with no tombstone, and a deleted one with no alarm', async () => {
    const stranger = await SpaceMember.open(h.env)
    h.spaces.restart(stranger.spaceId)
    expect(await stranger.sync()).toMatchObject({ status: 410, body: spacesError('gone') })
    expect(h.spaces.storage(stranger.spaceId).tables()).toEqual([])
    expect((await stranger.create()).status).toBe(200)
    for (const dropsAlarm of [false, true]) {
      const owner = await owned()
      const storage = h.spaces.storage(owner.spaceId)
      storage.deleteAllDeletesAlarm(dropsAlarm)
      expect((await owner.deleteSpace()).status).toBe(200)
      expect(storage.alarm()).toBeNull()
      h.spaces.restart(owner.spaceId)
      expect(await owner.create()).toMatchObject({ status: 410, body: spacesError('gone') })
      expect(storage.tables()).toEqual(['tombstone'])
    }
  })
})

describe('eviction', () => {
  it('keeps a deleted space’s tombstone', async () => {
    const owner = await owned()
    await owner.deleteSpace()
    h.spaces.restart(owner.spaceId)
    expect(await owner.sync()).toMatchObject({ status: 410, body: spacesError('gone') })
    expect(await owner.create()).toMatchObject({ status: 410, body: spacesError('gone') })
    expect(h.spaces.storage(owner.spaceId).tables()).toEqual(['tombstone'])
  })

  it('reads the schema again and carries on', async () => {
    const owner = await owned()
    const joe = await owner.other()
    await joe.joinVia(owner)
    await owner.put([{ recordId: 'trip-1' }])
    h.spaces.restart(owner.spaceId)
    const synced = await joe.sync()
    expect(synced.body).toMatchObject({ seq: 4, members: [{}, {}] })
    expect(synced.body.records.map((r: { recordId: string }) => r.recordId)).toEqual(['trip-1'])
    expect((await joe.put([{ recordId: 'trip-2' }])).body.seq).toBe(5)
    expect((await joe.invite()).response.status).toBe(200)
    expect((await owner.remove(joe)).status).toBe(200)
  })

  it('still closes hibernated sockets by member', async () => {
    const owner = await owned()
    const joe = await owner.other()
    await joe.joinVia(owner)
    const owners = await socketOf(owner)
    const joes = await socketOf(joe)
    h.spaces.restart(owner.spaceId)
    await owner.remove(joe)
    expect(joes.closedBy).toEqual({ code: 4001, reason: 'gone' })
    expect(owners.closedBy).toBeNull()
    expect(owners.messages().at(-1)).toEqual({ type: 'changed', seq: 4 })
    owners.send('ping')
    expect(owners.received.at(-1)).toBe('pong')
  })

  it('keeps the put budget, which lives in the space’s storage', async () => {
    const owner = await owned()
    for (let i = 0; i < SPACES_LIMITS.memberPuts; i++)
      expect((await owner.put([{}])).status).toBe(200)
    expect((await owner.put([{}])).body.code).toBe('rate_limited')
    h.spaces.restart(owner.spaceId)
    expect((await owner.put([{}])).body).toMatchObject({ code: 'rate_limited', retryAfter: 60 })
    advance(MINUTE)
    expect((await owner.put([{}])).status).toBe(200)
  })

  it('adds a table a space made before it existed, and nothing to other objects', async () => {
    const owner = await owned()
    const storage = h.spaces.storage(owner.spaceId)
    storage.query('DROP TABLE member_put')
    h.spaces.restart(owner.spaceId)
    expect(storage.tables()).toContain('member_put')
    expect((await owner.put([{}])).status).toBe(200)
    await owner.deleteSpace()
    h.spaces.restart(owner.spaceId)
    expect(storage.tables()).toEqual(['tombstone'])
  })
})
