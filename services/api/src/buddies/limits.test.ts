import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DAY_MS,
  Owner,
  SigningKey,
  blobOfSize,
  createHarness,
  envelope,
  liveHeaders,
  randomId,
  unsignedEnvelope,
  relayError,
  type ApiResponse,
  type Harness,
  type Writer,
} from '../test/buddies'
import { BUDDIES_LIMITS, BUDDIES_OPS } from './contracts'
import {
  BUDDIES_ABUSE_LIMITS as ABUSE,
  SignerBudget,
  allowBuddiesCaller,
  buddiesCallerKey,
  buddiesEdgeTier,
  type BuddiesEdgeTier,
} from './limits'
import type { Environment } from '../types'
import { RATE_LIMIT_PERIOD_SECONDS } from '../rateLimit'

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

// Aligned to a 10-minute signer window, like `relay.test.ts`.
const START = Date.UTC(2026, 8, 23, 12)
const SECOND_MS = 1_000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)

/**
 * For the three tests that send thousands of real signed requests at the real
 * limits (an Ed25519 sign and verify each). They send independent requests
 * concurrently and take 0.3–0.4 s locally, but GitHub runners have measured
 * 1.5–4.5 s for them from run to run, too close to the 5 s default.
 */
const SIGNED_LOAD_TIMEOUT_MS = 20_000

let h: Harness
let warn: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  h = await createHarness()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** `[op, limit]` for every `buddies: limit hit` log line so far. */
const limitHits = () =>
  warn.mock.calls
    .filter(([message]) => message === 'buddies: limit hit')
    .map(([, fields]) => {
      // Only the op and the limit's name are ever logged.
      expect(Object.keys(fields as object).sort()).toEqual(['limit', 'op'])
      const { op, limit } = fields as { op: string; limit: string }
      return [op, limit]
    })

const garbage = (path: string, ip: string) =>
  h.post(path, { p: '!!' }, { 'cf-connecting-ip': ip })

/** Posts a signed op from `ip`; `fields` add to inboxId/ts/nonce. */
const sendFrom = async (
  ip: string,
  op: Parameters<typeof envelope>[0],
  key: SigningKey,
  fields: Record<string, unknown>
): Promise<ApiResponse> =>
  h.post(
    `/${op}`,
    await envelope(op, { ts: Date.now(), nonce: randomId(), ...fields }, key),
    { 'cf-connecting-ip': ip }
  )

const nonceRows = (inboxId: string) =>
  h.inboxes.storage(inboxId).query('SELECT COUNT(*) AS n FROM nonce')[0].n

const usage = (inboxId: string, slotId: string) =>
  h.inboxes
    .storage(inboxId)
    .query(
      'SELECT events, bytes FROM slot_usage WHERE slot_id = ?',
      slotId
    )[0] ?? null

describe('caller keys', () => {
  it('keys IPv4 by address and IPv6 by its /64', () => {
    expect(buddiesCallerKey('203.0.113.7')).toBe('203.0.113.7')
    expect(buddiesCallerKey(' 203.0.113.007 ')).toBe('203.0.113.7')
    expect(buddiesCallerKey('2001:db8:a:b:1:2:3:4')).toBe('2001:db8:a:b::/64')
    expect(buddiesCallerKey('2001:DB8:A:B::9')).toBe('2001:db8:a:b::/64')
    expect(buddiesCallerKey('2001:0db8:000a:000b:ffff::')).toBe(
      '2001:db8:a:b::/64'
    )
    expect(buddiesCallerKey('2001:db8:a:c::1')).toBe('2001:db8:a:c::/64')
    expect(buddiesCallerKey('::1')).toBe('0:0:0:0::/64')
    expect(buddiesCallerKey('fe80::1%en0')).toBe('fe80:0:0:0::/64')
    expect(buddiesCallerKey('2001:db8::192.0.2.1')).toBe('2001:db8:0:0::/64')
  })

  it('treats IPv4-mapped IPv6 as the IPv4 address', () => {
    expect(buddiesCallerKey('::ffff:192.0.2.1')).toBe('192.0.2.1')
    expect(buddiesCallerKey('::ffff:c000:201')).toBe('192.0.2.1')
  })

  it('falls back to the raw value, or `unknown` when absent', () => {
    expect(buddiesCallerKey(null)).toBe('unknown')
    expect(buddiesCallerKey('')).toBe('unknown')
    expect(buddiesCallerKey('not-an-ip')).toBe('not-an-ip')
    expect(buddiesCallerKey('1:2:3:4:5:6:7:8:9')).toBe('1:2:3:4:5:6:7:8:9')
    expect(buddiesCallerKey('1::2::3')).toBe('1::2::3')
    expect(buddiesCallerKey('999.1.1.1')).toBe('999.1.1.1')
  })
})

describe('edge tiers', () => {
  it('puts every op, the live socket, and the blob routes in a tier', () => {
    const tiers = Object.fromEntries(
      [
        ...BUDDIES_OPS,
        'inbox/live' as const,
        'blob/put' as const,
        'blob/get' as const,
      ].map((op) => [op, buddiesEdgeTier(op)])
    )
    expect(tiers).toEqual({
      'inbox/register': 'register',
      'inbox/sync': 'read',
      'inbox/live': 'read',
      'inbox/delete': 'write',
      'device/register': 'write',
      'device/unregister': 'write',
      'slot/add': 'write',
      'slot/remove': 'write',
      'roster/put': 'write',
      'invite/create': 'write',
      'invite/delete': 'write',
      'blob/delete': 'write',
      'blob/put': 'blobPut',
      'blob/get': 'blobGet',
      'card/put': 'write',
      'event/put': 'write',
      'slot/leave': 'write',
      'slot/seal': 'write',
      'invite/fetch': 'unsigned',
      'invite/claim': 'unsigned',
    })
  })

  it('lets requests through when a limiter fails, logging once', async () => {
    const env = {
      BUDDIES_READ_LIMITER: {
        limit: async () => {
          throw new Error('limiter down')
        },
      },
    } as unknown as Environment
    expect(await allowBuddiesCaller(env, 'inbox/sync', 'k')).toBe(true)
    expect(await allowBuddiesCaller(env, 'inbox/live', 'k')).toBe(true)
    const outages = warn.mock.calls.filter(([message]) =>
      String(message).includes('rate limiter unavailable')
    )
    expect(outages).toHaveLength(1)
  })
})

describe('wrangler.toml', () => {
  type Table = { header: string; lines: string[] }
  const tables: Table[] = []
  for (const line of readFileSync(
    new URL('../../wrangler.toml', import.meta.url),
    'utf8'
  ).split('\n')) {
    const header = /^\s*(\[\[?[^\]]+\]\]?)/.exec(line)?.[1]
    if (header) tables.push({ header, lines: [] })
    else tables.at(-1)?.lines.push(line)
  }
  const field = (table: Table, name: string) => {
    const pattern = new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*(#.*)?$`)
    const value = table.lines.map((line) => pattern.exec(line)).find(Boolean)
    return value?.[1].replace(/^"|"$/g, '')
  }

  /** `[[ratelimits]]` with their `.simple` settings, for one env prefix. */
  const rateLimits = (prefix: string) => {
    type Limit = { id: string; limit: number; period: number }
    const limits: Record<string, Limit> = {}
    let last: string | null = null
    for (const table of tables) {
      if (table.header === `[[${prefix}ratelimits]]`) {
        last = field(table, 'name') ?? null
        const id = field(table, 'namespace_id') ?? ''
        if (last) limits[last] = { id, limit: 0, period: 0 }
      } else if (table.header === `[${prefix}ratelimits.simple]` && last) {
        limits[last].limit = Number(field(table, 'limit'))
        limits[last].period = Number(field(table, 'period'))
      }
    }
    return limits
  }

  it.each(['', 'env.beta.', 'env.dev.'])(
    'configures each edge tier at its limit (%s)',
    (prefix) => {
      const limits = rateLimits(prefix)
      for (const [tier, { binding, perMinute }] of Object.entries(
        ABUSE.edge
      )) {
        expect(limits[binding], tier).toMatchObject({
          limit: perMinute,
          period: 60,
        })
      }
    }
  )

  it.each(['', 'env.beta.', 'env.dev.'])(
    'sends the shared limiter’s window as Retry-After (%s)',
    (prefix) => {
      expect(rateLimits(prefix).RATE_LIMITER).toMatchObject({
        period: RATE_LIMIT_PERIOD_SECONDS,
      })
    }
  )

  it('gives every rate limiter its own namespace', () => {
    const ids = ['', 'env.beta.', 'env.dev.'].flatMap((prefix) =>
      Object.values(rateLimits(prefix)).map((limit) => limit.id)
    )
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(['', 'env.beta.', 'env.dev.'])(
    'binds and migrates the registration quota (%s)',
    (prefix) => {
      const binding = tables.find(
        (table) =>
          table.header === `[[${prefix}durable_objects.bindings]]` &&
          field(table, 'name') === 'BUDDY_REGISTRATION_QUOTA'
      )
      expect(binding && field(binding, 'class_name')).toBe(
        'BuddyRegistrationQuota'
      )
      const migration = tables.find(
        (table) =>
          table.header === `[[${prefix}migrations]]` &&
          field(table, 'tag') === 'v6'
      )
      expect(migration && field(migration, 'new_sqlite_classes')).toBe(
        '["BuddyRegistrationQuota"]'
      )
    }
  )
})

describe('per-caller edge limits', () => {
  const paths: Record<BuddiesEdgeTier, string> = {
    unsigned: '/invite/fetch',
    register: '/inbox/register',
    read: '/inbox/sync',
    write: '/card/put',
    blobPut: '/blob/put',
    blobGet: '/blob/get',
  }

  it.each(Object.keys(paths) as BuddiesEdgeTier[])(
    'refuses %s past its per-minute limit for one caller, with Retry-After',
    async (tier) => {
      const limit = ABUSE.edge[tier].perMinute
      for (let i = 0; i < limit; i++) {
        expect(
          (await garbage(paths[tier], '198.51.100.1')).body
        ).toEqual(relayError('bad_request'))
      }
      const refused = await h.request(paths[tier], {
        method: 'POST',
        headers: { 'cf-connecting-ip': '198.51.100.1' },
        body: JSON.stringify({ p: '!!' }),
      })
      expect(refused.status).toBe(429)
      expect(await refused.json()).toEqual(relayError('rate_limited'))
      expect(refused.headers.get('retry-after')).toBe('60')

      // Other callers and other tiers are unaffected.
      expect((await garbage(paths[tier], '198.51.100.2')).status).toBe(400)
      const other = tier === 'read' ? '/inbox/delete' : '/inbox/sync'
      expect((await garbage(other, '198.51.100.1')).status).toBe(400)
      // A new minute starts a new budget.
      advance(MINUTE_MS)
      expect((await garbage(paths[tier], '198.51.100.1')).status).toBe(400)
      expect(limitHits()).toEqual([
        [paths[tier].slice(1), `edge.${tier}`],
      ])
    }
  )

  it('counts every address in an IPv6 /64 as one caller', async () => {
    const limit = ABUSE.edge.unsigned.perMinute
    for (let i = 0; i < limit; i++) {
      const ip = `2001:db8:a:b:${i.toString(16)}::${(i * 7).toString(16)}`
      expect((await garbage('/invite/fetch', ip)).status).toBe(400)
    }
    expect((await garbage('/invite/fetch', '2001:db8:a:b::ffff')).status).toBe(
      429
    )
    expect((await garbage('/invite/fetch', '2001:db8:a:c::1')).status).toBe(400)
    expect(new Set(h.rateLimitKeys)).toEqual(
      new Set(['2001:db8:a:b::/64', '2001:db8:a:c::/64'])
    )
  })

  it('keys on the caller, so flooding an inbox never locks its owner out', async () => {
    const victim = await Owner.create(h)
    const attacker = await SigningKey.generate()
    const inboxCalls = vi.spyOn(h.env.BUDDY_INBOX, 'get')
    const limit = ABUSE.edge.read.perMinute
    for (let i = 0; i < limit; i++) {
      const response = await sendFrom('198.51.100.66', 'inbox/sync', attacker, {
        inboxId: victim.inboxId,
        since: 0,
      })
      expect(response.status).toBe(401)
    }
    expect(inboxCalls).toHaveBeenCalledTimes(limit)
    const refused = await sendFrom('198.51.100.66', 'inbox/sync', attacker, {
      inboxId: victim.inboxId,
      since: 0,
    })
    expect(refused).toEqual({ status: 429, body: relayError('rate_limited') })
    // Refused at the edge: the victim's Durable Object never woke.
    expect(inboxCalls).toHaveBeenCalledTimes(limit)

    expect((await victim.sync()).status).toBe(200)
    expect((await victim.connect()).status).toBe(101)
  })

  it('counts the live upgrade as a read', async () => {
    const owner = await Owner.create(h)
    for (let i = 0; i < ABUSE.edge.read.perMinute; i++) {
      expect((await garbage('/inbox/sync', '203.0.113.7')).status).toBe(400)
    }
    expect((await owner.connect()).status).toBe(429)
    expect((await owner.registerDevice()).status).toBe(200)
  })

  it('refuses malformed, stale, and forged requests before any Durable Object', async () => {
    const owner = await Owner.create(h, false)
    const inboxCalls = vi.spyOn(h.env.BUDDY_INBOX, 'get')
    const quotaCalls = vi.spyOn(h.env.BUDDY_REGISTRATION_QUOTA, 'get')

    expect((await owner.send('inbox/sync', { since: -1 })).status).toBe(400)
    const stale = await owner.send('inbox/sync', {
      since: 0,
      ts: Date.now() - BUDDIES_LIMITS.timestampSkewMs - 1,
    })
    expect(stale).toEqual({ status: 401, body: relayError('stale') })
    const staleLive = await h.live(
      await liveHeaders(
        { inboxId: owner.inboxId, ts: Date.now() + 6 * MINUTE_MS, nonce: randomId() },
        owner.key
      )
    )
    expect(staleLive.status).toBe(401)
    const impostor = await SigningKey.generate()
    const forged = await h.send('inbox/register', impostor, {
      inboxId: owner.inboxId,
      ownerPub: owner.key.publicKey,
    })
    expect(forged).toEqual({ status: 401, body: relayError('bad_signature') })

    expect(inboxCalls).not.toHaveBeenCalled()
    expect(quotaCalls).not.toHaveBeenCalled()
  })
})

describe('registration quota', () => {
  const register = (ip: string, owner: Owner) =>
    sendFrom(ip, 'inbox/register', owner.key, {
      inboxId: owner.inboxId,
      ownerPub: owner.key.publicKey,
    })

  it('caps signed registrations per caller per rolling day', async () => {
    const owners = await Promise.all(
      Array.from({ length: 20 }, () => Owner.create(h, false))
    )
    const ip = '2001:db8:5::1'
    // A minute's worth at a time, concurrently, under the per-minute edge limit.
    for (let sent = 0; sent < ABUSE.registrationsPerDay; ) {
      advance(MINUTE_MS)
      const count = Math.min(
        ABUSE.edge.register.perMinute,
        ABUSE.registrationsPerDay - sent
      )
      const responses = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          register(ip, owners[(sent + i) % owners.length])
        )
      )
      expect(responses.filter((response) => response.status !== 200)).toEqual(
        []
      )
      sent += count
    }
    // A fresh minute, so only the daily quota can refuse.
    advance(MINUTE_MS)
    const refused = await h.request('/inbox/register', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '2001:db8:5::2' },
      body: JSON.stringify(
        await envelope(
          'inbox/register',
          {
            inboxId: owners[0].inboxId,
            ownerPub: owners[0].key.publicKey,
            ts: Date.now(),
            nonce: randomId(),
          },
          owners[0].key
        )
      ),
    })
    expect(refused.status).toBe(429)
    expect(await refused.json()).toEqual(relayError('rate_limited'))
    // Free again once the first hour of registrations leaves the window.
    const retryAfter = Number(refused.headers.get('retry-after'))
    expect(retryAfter * SECOND_MS).toBe(START + DAY_MS - Date.now())
    expect(limitHits()).toEqual([['inbox/register', 'registrationsPerDay']])

    // Another caller is unaffected; the same caller recovers after the wait.
    expect((await register('198.51.100.9', owners[1])).status).toBe(200)
    advance(retryAfter * SECOND_MS)
    expect((await register(ip, owners[2])).status).toBe(200)
  }, SIGNED_LOAD_TIMEOUT_MS)

  it('counts only validly signed registrations', async () => {
    const owner = await Owner.create(h, false)
    const impostor = await SigningKey.generate()
    const quotaCalls = vi.spyOn(h.env.BUDDY_REGISTRATION_QUOTA, 'get')
    for (let i = 0; i < 50; i++) {
      const response = await sendFrom('198.51.100.3', 'inbox/register', impostor, {
        inboxId: owner.inboxId,
        ownerPub: owner.key.publicKey,
      })
      expect(response.status).toBe(401)
    }
    expect(quotaCalls).not.toHaveBeenCalled()
    expect((await register('198.51.100.3', owner)).status).toBe(200)
    expect(quotaCalls).toHaveBeenCalledTimes(1)
  })

  it('keeps only hourly counts and deletes itself a day after the newest', async () => {
    const quota = h.quotas.object('caller')
    const storage = h.quotas.storage('caller')
    expect(await quota.admit(Date.now())).toEqual({ ok: true })
    advance(HOUR_MS)
    expect(await quota.admit(Date.now())).toEqual({ ok: true })
    expect(await quota.admit(Date.now())).toEqual({ ok: true })
    expect(storage.query('SELECT hour, n FROM registration ORDER BY hour')).toEqual([
      { hour: START / HOUR_MS, n: 1 },
      { hour: START / HOUR_MS + 1, n: 2 },
    ])
    expect(storage.alarm()).toBe(START + HOUR_MS + DAY_MS)
    advance(DAY_MS)
    await h.quotas.fireAlarm('caller')
    expect(storage.tables()).toEqual([])
  })
})

describe('stored-event caps', () => {
  /** Inserts `count` events of `chars` each for `slotId`, like real writes. */
  const seedEvents = (
    inboxId: string,
    slotId: string,
    count: number,
    chars: number
  ) => {
    const storage = h.inboxes.storage(inboxId)
    storage.query(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO event (event_id, slot_id, kind, blob, seq, created_at)
       SELECT 'seed' || i || ?, ?, 'plan.joined', substr(hex(zeroblob(?)), 1, ?), 0, ?
       FROM n`,
      count,
      slotId,
      slotId,
      Math.ceil(chars / 2),
      chars,
      Date.now()
    )
    storage.query(
      `INSERT INTO slot_usage (slot_id, events, bytes) VALUES (?, ?, ?)
       ON CONFLICT (slot_id) DO UPDATE SET
         events = events + excluded.events, bytes = bytes + excluded.bytes`,
      slotId,
      count,
      count * chars
    )
  }

  const storedEvents = (inboxId: string) =>
    h.inboxes.storage(inboxId).query('SELECT COUNT(*) AS n FROM event')[0].n

  it('keeps a running count and size per slot', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    const eventId = randomId()
    await buddy.putEvent({ eventId, blob: blobOfSize(300) })
    await buddy.putEvent({ blob: blobOfSize(30) })
    // A repeat is a dedupe, not a new event.
    await buddy.putEvent({ eventId, blob: blobOfSize(300) })
    expect(usage(owner.inboxId, buddy.slotId)).toEqual({
      events: 2,
      bytes: 400 + 40,
    })

    // Retention takes expired events out of the count.
    advance(10 * DAY_MS)
    await buddy.putEvent({ blob: blobOfSize(3) })
    advance(20 * DAY_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(usage(owner.inboxId, buddy.slotId)).toEqual({ events: 1, bytes: 4 })

    // Removing the slot drops its count with its events.
    expect((await owner.send('slot/remove', { slotId: buddy.slotId })).status).toBe(200)
    expect(usage(owner.inboxId, buddy.slotId)).toBeNull()
  })

  it('counts events an inbox stored before the count existed', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    await buddy.putEvent({ blob: blobOfSize(300) })
    await buddy.putEvent({ blob: blobOfSize(3) })
    const storage = h.inboxes.storage(owner.inboxId)
    storage.query('DROP TABLE slot_usage')
    h.inboxes.restart(owner.inboxId)

    expect((await owner.sync()).status).toBe(200)
    expect(usage(owner.inboxId, buddy.slotId)).toEqual({ events: 2, bytes: 404 })
    // Relay events (invite claims) aren't a slot's.
    expect(usage(owner.inboxId, '')).toBeNull()
  })

  it('starts from zero after a wipe, which keeps only the owner tombstone', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    await buddy.putEvent({ blob: blobOfSize(300) })
    const storage = h.inboxes.storage(owner.inboxId)
    expect((await owner.send('inbox/delete')).status).toBe(200)
    expect(storage.tables()).toEqual(['owner_tombstone'])

    // Probing a wiped inbox, even from a fresh instance, creates nothing.
    h.inboxes.restart(owner.inboxId)
    expect((await buddy.putEvent()).status).toBe(404)
    expect((await owner.sync()).status).toBe(404)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(storage.tables()).toEqual(['owner_tombstone'])

    // The owner comes back to empty counts and a fresh nonce table.
    await owner.send('inbox/register', { ownerPub: owner.key.publicKey })
    const again = await owner.addWriter(buddy.slotId)
    expect(usage(owner.inboxId, buddy.slotId)).toBeNull()
    await again.putEvent({ blob: blobOfSize(3) })
    expect(usage(owner.inboxId, buddy.slotId)).toEqual({ events: 1, bytes: 4 })
    expect(nonceRows(owner.inboxId)).toBe(3)
  })

  it('refuses events past a slot’s count cap and keeps everything stored', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    const other = await owner.addWriter()
    seedEvents(owner.inboxId, buddy.slotId, ABUSE.slotEvents, 4)
    const stored = storedEvents(owner.inboxId)
    const nonces = nonceRows(owner.inboxId)

    // Room comes back when the oldest stored event reaches retention.
    expect(await buddy.putEvent()).toEqual({
      status: 429,
      body: relayError('rate_limited', {
        retryAfter: BUDDIES_LIMITS.eventRetentionMs / 1000,
      }),
    })
    expect(storedEvents(owner.inboxId)).toBe(stored)
    expect(nonceRows(owner.inboxId)).toBe(nonces)
    // Cards replace in place, and other slots have their own room.
    expect((await buddy.putCard()).status).toBe(200)
    expect((await other.putEvent()).status).toBe(200)
    expect(limitHits()).toEqual([['event/put', 'slotEvents']])

    // Room comes back as events reach their 30-day retention.
    advance(BUDDIES_LIMITS.eventRetentionMs)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect((await buddy.putEvent()).status).toBe(200)
  })

  it('refuses events past a slot’s byte cap', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    const room = 6_000
    seedEvents(owner.inboxId, buddy.slotId, 16, (ABUSE.slotEventBytes - room) / 16)
    expect((await buddy.putEvent({ blob: blobOfSize(4_000) })).status).toBe(200)
    expect(await buddy.putEvent({ blob: blobOfSize(4_000) })).toEqual({
      status: 429,
      body: relayError('rate_limited'),
    })
    expect((await buddy.putEvent({ blob: blobOfSize(300) })).status).toBe(200)
    expect(limitHits()).toEqual([['event/put', 'slotEventBytes']])
  })

  it('refuses events past the inbox’s byte cap', async () => {
    const owner = await Owner.create(h)
    const writers: Writer[] = []
    for (let i = 0; i < 5; i++) writers.push(await owner.addWriter())
    // Four slots fill the inbox's cap, though each stays under its own.
    const perSlot = ABUSE.inboxEventBytes / 4 - 500
    for (const writer of writers.slice(0, 4)) {
      h.inboxes
        .storage(owner.inboxId)
        .query(
          'INSERT INTO slot_usage (slot_id, events, bytes) VALUES (?, 1, ?)',
          writer.slotId,
          perSlot
        )
    }
    expect(await writers[4].putEvent({ blob: blobOfSize(3_000) })).toEqual({
      status: 429,
      body: relayError('rate_limited'),
    })
    expect(limitHits()).toEqual([['event/put', 'inboxEventBytes']])
  })

  it('pages sync by event count too, bounding rows read per call', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    const storage = h.inboxes.storage(owner.inboxId)
    const total = ABUSE.syncEvents + 5
    storage.query(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO event (event_id, slot_id, kind, blob, seq, created_at)
       SELECT 'e' || i, ?, 'plan.joined', 'AAAA', i, ? FROM n`,
      total,
      buddy.slotId,
      Date.now()
    )
    storage.query('UPDATE meta SET seq = ?', total)

    const first = (await owner.sync()).body
    expect(first.events).toHaveLength(ABUSE.syncEvents)
    expect(first.seq).toBe(ABUSE.syncEvents)
    const rest = (await owner.sync(first.seq)).body
    expect(rest.events).toHaveLength(5)
    expect(rest.seq).toBe(total)
  })
})

describe('nonces', () => {
  it('records no nonce for a refused request', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    for (let i = 0; i < BUDDIES_LIMITS.writesPerSlot; i++)
      expect((await buddy.putEvent()).status).toBe(200)
    const nonces = nonceRows(owner.inboxId)
    for (let i = 0; i < 25; i++) {
      expect((await buddy.putEvent()).status).toBe(429)
      expect((await buddy.putCard()).status).toBe(429)
    }
    // Count caps and conflicts are refusals too.
    for (let i = 1; i < BUDDIES_LIMITS.slotsPlusOpenInvites; i++)
      await owner.addWriter()
    const slotAdd = () =>
      owner.send('slot/add', {
        slotId: buddy.slotId,
        writerPub: owner.key.publicKey,
      })
    expect((await slotAdd()).body).toEqual(relayError('conflict'))
    const full = await owner.send('slot/add', {
      slotId: randomId(),
      writerPub: owner.key.publicKey,
    })
    expect(full.body).toEqual(relayError('limit'))
    const accepted = BUDDIES_LIMITS.slotsPlusOpenInvites - 1 // the slot/adds
    expect(nonceRows(owner.inboxId)).toBe(nonces + accepted)
    expect(limitHits()).toEqual([
      ...Array.from({ length: 25 }, () => [
        ['event/put', 'writesPerSlot'],
        ['card/put', 'writesPerSlot'],
      ]).flat(),
    ])
  })

  it('still lets each signed request take effect at most once', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    for (let i = 0; i < BUDDIES_LIMITS.writesPerSlot; i++)
      await buddy.putEvent()
    advance(HOUR_MS - 3 * SECOND_MS)
    const signed = await envelope(
      'card/put',
      {
        inboxId: owner.inboxId,
        slotId: buddy.slotId,
        blob: blobOfSize(64),
        ts: Date.now(),
        nonce: randomId(),
      },
      buddy.key
    )
    // Refused while the hour is full, so its nonce isn't kept...
    expect((await h.post('/card/put', signed)).status).toBe(429)
    advance(5 * SECOND_MS)
    // ...and it can take effect once the budget has room, but only once.
    expect((await h.post('/card/put', signed)).status).toBe(200)
    expect(await h.post('/card/put', signed)).toEqual({
      status: 409,
      body: relayError('replay'),
    })
    const parallel = await envelope(
      'inbox/sync',
      { inboxId: owner.inboxId, since: 0, ts: Date.now(), nonce: randomId() },
      owner.key
    )
    const statuses = (
      await Promise.all(
        Array.from({ length: 6 }, () => h.post('/inbox/sync', parallel))
      )
    ).map((response) => response.status)
    expect(statuses.sort()).toEqual([200, 409, 409, 409, 409, 409])
    advance(6 * MINUTE_MS)
    expect(
      (await h.post('/inbox/sync', parallel)).body
    ).toEqual(relayError('stale'))
  })
})

describe('signer budgets', () => {
  it('bounds one writer’s requests, leaving the owner and others alone', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    const other = await owner.addWriter()
    const eventId = randomId()
    // Repeats of one event are accepted dedupes: no write budget, but a nonce each.
    for (let i = 0; i < ABUSE.writerRequests; i++) {
      advance(150)
      expect((await buddy.putEvent({ eventId })).status, `request ${i}`).toBe(200)
    }
    const nonces = nonceRows(owner.inboxId)
    // 2.5 minutes into the writer's 10-minute window.
    expect(await buddy.putEvent({ eventId })).toEqual({
      status: 429,
      body: relayError('rate_limited', { retryAfter: 7.5 * 60 }),
    })
    expect(nonceRows(owner.inboxId)).toBe(nonces)
    expect((await other.putEvent()).status).toBe(200)
    expect((await owner.sync()).status).toBe(200)
    expect(limitHits()).toEqual([['event/put', 'writerRequests']])

    advance(ABUSE.signerWindowMs)
    expect((await buddy.putEvent({ eventId })).status).toBe(200)
  })

  it(
    'bounds an owner’s requests that take effect, across callers',
    async () => {
      const owner = await Owner.create(h)
      // Signed up front, then sent through the Worker in concurrent batches,
      // each request from its own IP so no edge limit sees a repeat caller.
      const requests = await Promise.all(
        Array.from({ length: ABUSE.ownerRequests }, async (_, i) => ({
          ip: `198.18.${i >> 8}.${i & 255}`,
          signed: await envelope(
            'device/unregister',
            {
              inboxId: owner.inboxId,
              deviceId: randomId(),
              ts: Date.now(),
              nonce: randomId(),
            },
            owner.key
          ),
        }))
      )
      for (let start = 0; start < requests.length; start += 500) {
        const batch = await Promise.all(
          requests
            .slice(start, start + 500)
            .map(({ ip, signed }) =>
              h.post('/device/unregister', signed, { 'cf-connecting-ip': ip })
            )
        )
        expect(batch.filter((response) => response.status !== 200)).toEqual([])
      }
      // Registering doesn't count; it has its own limits.
      expect(nonceRows(owner.inboxId)).toBe(ABUSE.ownerRequests + 1)
      expect((await owner.sync()).body).toEqual(relayError('rate_limited'))
      expect(limitHits()).toEqual([['inbox/sync', 'ownerRequests']])
      advance(ABUSE.signerWindowMs)
      expect((await owner.sync()).status).toBe(200)
    },
    SIGNED_LOAD_TIMEOUT_MS
  )

  it('counts in fixed windows per signer', () => {
    const budget = new SignerBudget(10 * MINUTE_MS)
    budget.spend('a', START)
    budget.spend('a', START + MINUTE_MS)
    expect(budget.allows('a', 2, START + 2 * MINUTE_MS)).toBe(false)
    expect(budget.allows('b', 2, START + 2 * MINUTE_MS)).toBe(true)
    expect(budget.allows('a', 2, START + 10 * MINUTE_MS)).toBe(true)
    expect(budget.waitMs('a', START + 2 * MINUTE_MS)).toBe(8 * MINUTE_MS)
  })
})

describe('a heavy, legitimate user', () => {
  // Independent requests (different buddies, different devices) go out
  // concurrently, as they would from separate phones.
  it('never hits a limit across buddies, devices, sockets, and a restore', async () => {
    const statuses = new Map<string, number[]>()
    const track = async <T extends { status: number }>(
      label: string,
      response: Promise<T>
    ): Promise<T> => {
      const result = await response
      const seen = statuses.get(label) ?? []
      seen.push(result.status)
      statuses.set(label, seen)
      return result
    }

    // One household IP for everything: the owner's 4 devices and 5 buddies.
    // More buddies than that live elsewhere, as callers of their own.
    const owner = await Owner.create(h)
    const devices = Array.from({ length: 4 }, () => randomId())
    const eachDevice = (step: (device: string) => Promise<unknown>) =>
      Promise.all(devices.map(step))
    // Every device registers (idempotent) and registers for pushes.
    await eachDevice(async (device) => {
      await track(
        'register',
        owner.send('inbox/register', { ownerPub: owner.key.publicKey })
      )
      await track('device', owner.registerDevice(device))
    })
    const buddies: Writer[] = []
    for (let i = 0; i < 5; i++) buddies.push(await owner.addWriter())
    await track('roster', owner.send('roster/put', { blob: blobOfSize(20_000) }))

    const cursors = new Map(devices.map((device) => [device, 0]))
    const syncDevice = async (device: string) => {
      const response = await track('sync', owner.sync(cursors.get(device)))
      cursors.set(device, response.body.seq)
    }
    const reconnect = async () => {
      const live = await track('live', owner.connect())
      live.socket?.close()
    }

    // Day one's peak minutes: a shown invite code polls every 3 s for 5
    // minutes while every device reconnects as the app is switched in and out.
    for (let tick = 0; tick < 100; tick++) {
      advance(3 * SECOND_MS)
      await syncDevice(devices[0])
      if (tick % 10 === 0) await eachDevice(reconnect)
    }

    // 30 days of a power user's buddies: 30 events a day each (two bursts,
    // some with long notes), cards on every burst, and every device syncing
    // on each change.
    let longNotes = 0
    for (let day = 0; day < 30; day++) {
      for (const burst of [0, 1]) {
        advance(burst === 0 ? 9 * HOUR_MS : 8 * HOUR_MS)
        await Promise.all(
          buddies.map(async (buddy) => {
            const sizes = Array.from({ length: 15 }, () =>
              ++longNotes % 10 === 0 ? BUDDIES_LIMITS.eventBytes : 1_100
            )
            await Promise.all(
              sizes.map((size) =>
                track(
                  'event',
                  buddy.putEvent({ kind: 'plan.update', blob: blobOfSize(size) })
                )
              )
            )
            await track('card', buddy.putCard(blobOfSize(4_000)))
          })
        )
        await eachDevice(syncDevice)
        await eachDevice(reconnect)
      }
      advance(7 * HOUR_MS)
      await eachDevice(async (device) => {
        await track('device', owner.registerDevice(device))
        await syncDevice(device)
      })
    }

    // A new device restores everything from the start, a page at a time.
    await track(
      'register',
      owner.send('inbox/register', { ownerPub: owner.key.publicKey })
    )
    let cursor = 0
    let events = 0
    for (;;) {
      const page = (await track('sync', owner.sync(cursor))).body
      events += page.events.length
      if (page.seq === cursor) break
      cursor = page.seq
    }
    expect(events).toBeGreaterThan(4_000)

    for (const [label, codes] of statuses) {
      expect(
        codes.filter((code) => code !== 200 && code !== 101),
        label
      ).toEqual([])
    }
    expect(limitHits()).toEqual([])
    // Each slot stays far from its caps.
    for (const buddy of buddies) {
      const used = usage(owner.inboxId, buddy.slotId)
      expect(used.events).toBe(900)
      expect(used.events).toBeLessThan(ABUSE.slotEvents / 10)
      expect(used.bytes).toBeLessThan(ABUSE.slotEventBytes / 4)
    }
  }, SIGNED_LOAD_TIMEOUT_MS)
})
