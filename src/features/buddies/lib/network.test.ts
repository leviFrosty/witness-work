import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromB64u, fromUtf8 } from '@/features/buddies/lib/bytes'
import {
  BuddyInviteError,
  createBuddiesEngine,
  type BuddiesEngineDeps,
} from '@/features/buddies/lib/engine'
import {
  createRelayClient,
  RELAY_FULL_SYNC_TIMEOUT_MS,
  RELAY_TIMEOUT_MS,
  RelayError,
  type RelayDeps,
} from '@/features/buddies/lib/relay'
import type { OutgoingShareSpec } from '@/features/buddies/lib/state'
import { createFakeRelay } from '@/features/buddies/lib/testing/fakeRelay'
import {
  memoryStore,
  ownerAuthFor,
  pair,
  random,
  setup,
  testSessions,
} from '@/features/buddies/lib/testing/engineHarness'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

afterEach(() => {
  vi.useRealTimers()
})

const BASE_URL = 'https://relay.test'
const opOf = (url: unknown) => String(url).split('/buddies/v1/')[1]
const reply = (status: number, body: unknown, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers })

function clientOn(fetchImpl: typeof fetch, extra: Partial<RelayDeps> = {}) {
  const seed = random(32)
  const sessions = testSessions({
    fetchImpl,
    now: Date.now,
    accountKey: async () => seed,
  })
  const client = createRelayClient({
    baseUrl: BASE_URL,
    randomBytes: random,
    authorize: (run, { signal }) => sessions.withSession(run, { signal }),
    fetchImpl,
    ...extra,
  })
  return { client, seed }
}

function scripted(
  fetchImpl: typeof fetch,
  extra: Partial<BuddiesEngineDeps> = {},
  relayExtra: Partial<RelayDeps> = {}
) {
  const { client, seed } = clientOn(fetchImpl, relayExtra)
  const store = memoryStore({})
  const engine = createBuddiesEngine({
    relay: client,
    store,
    randomBytes: random,
    now: Date.now,
    getRootSeed: async () => seed,
    deleteRootSeed: async () => {},
    getPlans: () => ({ dayPlans: [], recurringPlans: [] }),
    getProfile: () => ({ name: 'Mom' }),
    ...extra,
  })
  return { engine, store, seed, client }
}

function flakyRelay() {
  const fake = createFakeRelay(Date.now)
  const stalled = new Set<string>()
  const failures = new Map<string, Response>()
  const ops: string[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const op = opOf(url)
    ops.push(op)

    if (stalled.has(op))
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
        )
      )
    const failure = failures.get(op)
    if (failure) {
      failures.delete(op)
      return failure
    }
    return fake.fetchImpl(url, init)
  }) as typeof fetch
  return { fake, stalled, failures, ops, fetchImpl }
}

describe('the relay client', () => {
  it('gives up on a stalled call, and the sync queue moves on', async () => {
    vi.useFakeTimers()
    const relay = flakyRelay()
    const { engine } = scripted(relay.fetchImpl)
    relay.stalled.add('inbox/register')

    const stalled = engine.sync()
    const outcome = expect(stalled).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(RELAY_TIMEOUT_MS)
    await outcome

    relay.stalled.clear()
    const next = engine.sync()
    await vi.advanceTimersByTimeAsync(0)
    await expect(next).resolves.toBe('synced')
  })

  it('allows a longer wait for reading an inbox from the start', async () => {
    vi.useFakeTimers()
    const relay = flakyRelay()
    const { engine } = scripted(relay.fetchImpl)
    await engine.ensureInbox()
    relay.stalled.add('inbox/sync')

    const outcome = engine.sync().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(RELAY_TIMEOUT_MS)
    let settled = false
    void outcome.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(
      RELAY_FULL_SYNC_TIMEOUT_MS - RELAY_TIMEOUT_MS
    )
    expect(await outcome).toMatchObject({ code: 'timeout' })
  })

  it("cancels a call when the caller's signal aborts", async () => {
    const relay = flakyRelay()
    const { client } = clientOn(relay.fetchImpl)
    relay.stalled.add('invite/fetch')
    const controller = new AbortController()
    const fetched = client.fetchInvite('x', { signal: controller.signal })
    controller.abort()
    await expect(fetched).rejects.toEqual(new RelayError('cancelled', 0))
  })

  it("reports the relay's code and Retry-After", async () => {
    const client = createRelayClient({
      baseUrl: BASE_URL,
      randomBytes: random,
      authorize: (run) => run('Bearer token', { accountId: 'a'.repeat(22) }),
      fetchImpl: (async () =>
        reply(
          503,
          { error: 'disabled' },
          { 'retry-after': '120' }
        )) as typeof fetch,
    })
    await expect(client.fetchInvite('x')).rejects.toEqual(
      new RelayError('disabled', 503, 120_000)
    )
  })

  it('signs again on a corrected clock after the relay calls it stale', async () => {
    let skew = 10 * 60 * 1000
    const stamps: number[] = []
    const fake = createFakeRelay(Date.now)
    const { client, seed } = clientOn(
      (async (url: string, init?: RequestInit) => {
        if (!opOf(url)) return fake.fetchImpl(url, init)
        const { payload } = JSON.parse(String(init?.body)) as {
          payload: string
        }
        const { ts } = JSON.parse(fromUtf8(fromB64u(payload))) as {
          ts: number
        }
        stamps.push(ts)
        if (Math.abs(ts - Date.now()) > 5 * 60 * 1000)
          return reply(401, { error: 'stale' })
        return fake.fetchImpl(url, init)
      }) as typeof fetch,
      {
        now: () => Date.now() + skew,
        recalibrate: async () => {
          skew = 0
        },
      }
    )
    await expect(
      client.registerInbox(ownerAuthFor(seed))
    ).resolves.toMatchObject({ ok: true })
    expect(stamps).toHaveLength(2)
    expect(Math.abs(stamps[1] - Date.now())).toBeLessThan(60 * 1000)
  })
})

describe("the relay's clock", () => {
  it("re-signs on the relay's own time from a stale answer, without recalibrating", async () => {
    const recalibrate = vi.fn(async () => {})
    const stamps: number[] = []
    const fake = createFakeRelay(Date.now)
    const { client, seed } = clientOn(
      (async (url: string, init?: RequestInit) => {
        if (!opOf(url)) return fake.fetchImpl(url, init)
        const { payload } = JSON.parse(String(init?.body)) as {
          payload: string
        }
        const { ts } = JSON.parse(fromUtf8(fromB64u(payload))) as {
          ts: number
        }
        stamps.push(ts)
        if (Math.abs(ts - Date.now()) > 5 * 60 * 1000)
          return reply(401, {
            ok: false,
            error: 'stale',
            code: 'stale',
            serverTime: Date.now(),
          })
        return fake.fetchImpl(url, init)
      }) as typeof fetch,

      { now: () => Date.now() + 60 * 60 * 1000, recalibrate }
    )
    const me = ownerAuthFor(seed)
    await client.registerInbox(me)

    await client.registerInbox(me)
    expect(stamps).toHaveLength(3)
    expect(Math.abs(stamps[2] - Date.now())).toBeLessThan(60 * 1000)
    expect(recalibrate).not.toHaveBeenCalled()
  })
})

describe('sync scheduling', () => {
  it("skips the queued sync when the running one reached the live signal's seq", async () => {
    const { user, setAfterOp } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    let reads = 0
    setAfterOp(async (op) => {
      if (op === 'inbox/sync') reads += 1
    })
    const seq = anna.store.getState().syncSeq

    await Promise.all([anna.engine.sync(), anna.engine.sync({ minSeq: seq })])
    expect(reads).toBe(1)

    await Promise.all([anna.engine.sync(), anna.engine.sync()])
    expect(reads).toBe(3)
  })

  it("waits out the relay's Retry-After for automatic syncs, not the User's", async () => {
    const relay = flakyRelay()
    const { engine } = scripted(relay.fetchImpl)
    await engine.ensureInbox()
    relay.failures.set(
      'inbox/sync',
      reply(429, { error: 'rate_limited' }, { 'retry-after': '30' })
    )
    await expect(engine.sync()).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterMs: 30_000,
    })
    expect(engine.coolingDown()).toBe(true)

    const reads = () => relay.ops.filter((op) => op === 'inbox/sync').length
    await engine.sync({ automatic: true })
    expect(reads()).toBe(1)
    await engine.sync()
    expect(reads()).toBe(2)

    expect(engine.coolingDown()).toBe(false)
  })

  it('holds automatic syncs back for a long while once Buddies is switched off', async () => {
    let now = Date.parse('2026-09-23T15:00:00Z')
    const relay = flakyRelay()
    const { engine } = scripted(relay.fetchImpl, { now: () => now })
    await engine.ensureInbox()
    relay.failures.set('inbox/sync', reply(503, { error: 'disabled' }))
    await expect(engine.sync()).rejects.toMatchObject({ code: 'disabled' })
    now += 14 * 60 * 1000
    expect(engine.coolingDown()).toBe(true)
    now += 60 * 1000
    expect(engine.coolingDown()).toBe(false)
  })

  it('holds automatic syncs back only a minute for a suspended account', async () => {
    let now = Date.parse('2026-09-23T15:00:00Z')
    const relay = flakyRelay()
    const { engine } = scripted(relay.fetchImpl, { now: () => now })
    await engine.ensureInbox()
    relay.failures.set('inbox/sync', reply(403, { error: 'suspended' }))
    await expect(engine.sync()).rejects.toMatchObject({ code: 'suspended' })
    now += 59 * 1000
    expect(engine.coolingDown()).toBe(true)
    now += 1000
    expect(engine.coolingDown()).toBe(false)
  })

  it('says when a call shows the account is active (not suspended)', async () => {
    const relay = flakyRelay()
    const onAccountActive = vi.fn()
    const { engine, seed, client } = scripted(
      relay.fetchImpl,
      {},
      { onAccountActive }
    )

    await engine.ensureInbox()
    expect(onAccountActive).toHaveBeenCalledTimes(1)
    await engine.sync()
    const afterSync = onAccountActive.mock.calls.length
    expect(afterSync).toBeGreaterThan(1)

    relay.failures.set('inbox/sync', reply(403, { error: 'suspended' }))
    await expect(engine.sync()).rejects.toMatchObject({ code: 'suspended' })
    expect(onAccountActive).toHaveBeenCalledTimes(afterSync)

    const auth = ownerAuthFor(seed)
    onAccountActive.mockClear()
    await client.removeSlot(auth, 'AAAAAAAAAAAAAAAAAAAAAA').catch(() => {})
    await client.deleteInbox(auth)
    expect(onAccountActive).not.toHaveBeenCalled()
  })

  it('registers a new inbox once, however many ask at the same time', async () => {
    const { user, setAfterOp } = setup()
    const mom = user('Mom')
    let registers = 0
    setAfterOp(async (op) => {
      if (op === 'inbox/register') registers += 1
    })
    await Promise.all([
      mom.engine.ensureInbox(),
      mom.engine.ensureInbox(),
      mom.engine.ensureInbox(),
    ])
    expect(registers).toBe(1)
  })
})

describe('publishing', () => {
  const share = (recipients: string[]): OutgoingShareSpec => ({
    key: 'plan:1',
    type: 'plan',
    recipients,
    details: { d: '2026-09-26', s: 600, m: 60, title: 'Cart' },
    endsAt: Date.parse('2026-09-26T11:00:00Z'),
    expiresAt: Date.parse('2026-09-27T00:00:00Z'),
  })

  it('sends an invitation once when publishes overlap', async () => {
    const { fake, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    mom.setShares([share([anna.inboxId])])

    await Promise.all([
      mom.engine.publishShares(),
      mom.engine.publishShares(),
      mom.engine.publishShares(),
    ])
    const invites = fake.inboxes
      .get(anna.inboxId)!
      .events.filter((event) => event.kind === 'plan.invite')
    expect(invites).toHaveLength(1)
  })

  it('sends an invitation whose answer was lost under the same id', async () => {
    const { fake, user, setAfterOp } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    mom.setShares([share([anna.inboxId])])
    let lose = true
    setAfterOp(async (op) => {
      if (op === 'event/put' && lose) {
        lose = false
        throw new TypeError('Network request failed')
      }
    })
    await expect(mom.engine.publishShares()).rejects.toMatchObject({
      code: 'network',
    })
    await mom.engine.publishShares()
    const invites = fake.inboxes
      .get(anna.inboxId)!
      .events.filter((event) => event.kind === 'plan.invite')
    expect(invites).toHaveLength(1)
    expect(mom.store.getState().outgoingShares['plan:1'].pending).toBe(
      undefined
    )
  })

  it('reaches a buddy invited again while another send was still pending', async () => {
    const { fake, user, offlineOps } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    const joe = user('Joe')
    await pair(mom, anna)
    await pair(mom, joe)

    offlineOps.add('event/put')
    mom.setShares([share([anna.inboxId, joe.inboxId])])
    await mom.engine.publishShares().catch(() => {})
    offlineOps.clear()
    mom.setShares([share([anna.inboxId])])
    await mom.engine.publishShares()

    mom.setShares([share([joe.inboxId])])
    await mom.engine.publishShares()
    mom.setShares([share([anna.inboxId, joe.inboxId])])
    await mom.engine.publishShares()

    await anna.engine.sync()
    const kinds = fake.inboxes
      .get(anna.inboxId)!
      .events.filter((event) => event.kind.startsWith('plan.'))
      .map((event) => event.kind)
    expect(kinds).toEqual(['plan.invite', 'plan.cancel', 'plan.invite'])
    expect(Object.values(anna.store.getState().incomingShares)).toMatchObject([
      { status: 'pending' },
    ])
  })

  it("alerts once for an answer that's sent again after a lost reply", async () => {
    const { fake, user, setAfterOp } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    mom.setShares([share([anna.inboxId])])
    await mom.engine.publishShares()
    await anna.engine.sync()
    const [key] = Object.keys(anna.store.getState().incomingShares)

    let lose = true
    setAfterOp(async (op) => {
      if (op === 'event/put' && lose) {
        lose = false
        throw new TypeError('Network request failed')
      }
    })
    await anna.engine.replyToShare(key, 'going')
    expect(
      anna.store.getState().incomingShares[key].unsentReplyRev
    ).toBeDefined()
    await anna.engine.deliverReplies()

    const replies = fake.pushes.filter(
      (push) => push.inboxId === mom.inboxId && push.kind === 'share.reply'
    )
    expect(replies).toHaveLength(1)
  })
})

describe('pairing on a flaky connection', () => {
  it('pairs when the answer to a claim was lost', async () => {
    const { user, setAfterOp } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    const link = await mom.engine.createInvite()
    let lose = true
    setAfterOp(async (op) => {
      if (op === 'invite/claim' && lose) {
        lose = false
        throw new TypeError('Network request failed')
      }
    })
    await expect(anna.engine.acceptInvite(link)).resolves.toEqual({
      name: 'Mom',
    })
    await mom.engine.sync()
    const [claim] = mom.store.getState().incomingClaims
    await mom.engine.confirmClaim(claim.inviteId)
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: mom.inboxId, status: 'active' },
    ])
  })

  it('takes its slot back when a claim never reached the relay', async () => {
    const { fake, user, offlineOps } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    const link = await mom.engine.createInvite()
    offlineOps.add('invite/claim')
    await expect(anna.engine.acceptInvite(link)).rejects.toMatchObject({
      code: 'network',
    })
    expect(fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
    expect(anna.store.getState().buddies).toEqual([])
  })

  it('keeps a request listed when declining it could not reach the relay', async () => {
    const { user, offlineOps } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await anna.engine.acceptInvite(await mom.engine.createInvite())
    await mom.engine.sync()
    const [claim] = mom.store.getState().incomingClaims
    offlineOps.add('invite/delete')
    await expect(mom.engine.rejectClaim(claim.inviteId)).rejects.toMatchObject({
      code: 'network',
    })
    expect(mom.store.getState().incomingClaims).toHaveLength(1)
    offlineOps.clear()
    await mom.engine.rejectClaim(claim.inviteId)
    expect(mom.store.getState().incomingClaims).toEqual([])
  })

  it('says when the relay holds as many open invites as it allows', async () => {
    const { user } = setup()
    const mom = user('Mom')
    for (let i = 0; i < 3; i++) await mom.engine.createInvite()
    await expect(mom.engine.createInvite()).rejects.toEqual(
      new BuddyInviteError('openInvites')
    )
  })
})

describe('push alerts', () => {
  it('words an alert from the event a sync just read, without reading it again', async () => {
    const { fake, user, setAfterOp } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    mom.setShares([
      {
        key: 'plan:1',
        type: 'plan',
        recipients: [anna.inboxId],
        details: { d: '2026-09-26', s: 600, m: 60 },
        endsAt: Date.parse('2026-09-26T11:00:00Z'),
        expiresAt: Date.parse('2026-09-27T00:00:00Z'),
      },
    ])
    await mom.engine.publishShares()
    const marker = fake.markers
      .filter((m) => m.inboxId === anna.inboxId)
      .at(-1)!.marker
    await anna.engine.sync()

    let reads = 0
    setAfterOp(async (op) => {
      if (op === 'inbox/sync') reads += 1
    })
    const outcome = await anna.engine.describePush({
      kind: marker.kind,
      seq: marker.seq,
    })
    expect(outcome).toMatchObject({ alert: { name: 'Mom' } })
    expect(reads).toBe(0)
  })
})
