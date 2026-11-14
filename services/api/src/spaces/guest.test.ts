import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Event } from '@sentry/cloudflare'
import { blobOfSize, createHarness, randomId, type Harness } from '../test/buddies'
import { recordSentryEvents } from '../test/sentry'
import {
  GuestPage,
  SpaceMember,
  linkSecret,
  openLink,
  scopeId,
  spacesError,
  uuid,
} from '../test/spaces'
import { resetAccountStatusCache } from '../accounts/auth'
import { createSentryConfig } from '../sentry'
import type { Environment } from '../types'
import { SPACES_LIMITS } from './contracts'
import { SharedSpace } from './spaceDO'

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
 * Guest links' public ops, `guest/sync` and `guest/put` (witness-work ADR
 * 0047, `docs/territories-protocol.md` "Guest ops"): the API's first writes
 * without a session. A guest reads and writes only its link's streets, stops
 * the moment the link ends or expires, can't tell an unknown space, link, or
 * token apart, and is turned away by the switches, the per-network limit,
 * and the body checks before any space wakes. Nothing logs or reports its
 * token, verifier, IP, or blobs.
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

const territory = async (): Promise<SpaceMember> => {
  const owner = await SpaceMember.open(h.env)
  expect((await owner.create(undefined, { mode: 'scoped' })).status).toBe(200)
  return owner
}

const ids = (response: { body: { records: { recordId: string }[] } }) =>
  response.body.records.map((record) => record.recordId).sort()

/**
 * The owner's territory with streets S (linked), T (linked by nobody), and
 * U; a record in each; and a guest link on S alone.
 */
const linked = async () => {
  const owner = await territory()
  const [S, T, U] = [scopeId(), scopeId(), scopeId()]
  const records = {
    h: 'h',
    s: `s.${S}`,
    sw: `s.${S}.w`,
    sDoor: `s.${S}.${uuid()}`,
    t: `s.${T}`,
    tDoor: `s.${T}.${uuid()}`,
    d: `d.${uuid()}`,
    m: `m.${owner.memberId}`,
  }
  expect((await owner.put(Object.values(records).map((recordId) => ({ recordId })))).status).toBe(200)
  const link = await openLink(owner, [S])
  expect(link.response.status).toBe(200)
  const other = await openLink(owner, [T])
  const g = `g.${link.linkId}`
  expect((await owner.put([{ recordId: g }, { recordId: `g.${other.linkId}` }])).status).toBe(200)
  return { owner, S, T, U, records, link, other, g, guest: link.guest }
}

describe('reading and writing only its streets', () => {
  it('reads its link’s keys and its streets, nothing else', async () => {
    const { records, g, guest, link } = await linked()
    const synced = await guest.sync()
    expect(synced.status).toBe(200)
    expect(synced.body).toMatchObject({
      ok: true,
      epoch: 1,
      expiresAt: link.expiresAt,
      more: false,
    })
    expect(Object.keys(synced.body).sort()).toEqual(
      ['ok', 'seq', 'epoch', 'expiresAt', 'records', 'more'].sort()
    )
    expect(ids(synced)).toEqual([g, records.s, records.sw, records.sDoor].sort())
  })

  it('writes s.<S>.w and s.<S>.<uuid> in its streets, and nothing else', async () => {
    const { owner, S, T, U, guest } = await linked()
    advance(1_000)
    const door = `s.${S}.${uuid()}`
    const put = await guest.put([{ recordId: `s.${S}.w` }, { recordId: door }])
    expect(put.body).toEqual({
      ok: true,
      seq: expect.any(Number),
      results: [
        { recordId: `s.${S}.w`, stored: true },
        { recordId: door, stored: true },
      ],
    })
    const seq = (await owner.sync()).body.seq
    for (const recordId of [
      `s.${S}`,
      `s.${T}.w`,
      `s.${U}.${uuid()}`,
      'h',
      `d.${uuid()}`,
      `m.${randomId()}`,
      `i.${randomId()}`,
      `g.${guest.linkId}`,
      'k.2',
    ])
      expect(
        await guest.put([{ recordId: `s.${S}.${uuid()}` }, { recordId }]),
        recordId
      ).toMatchObject({ status: 403, body: spacesError('forbidden') })
    expect((await owner.sync()).body.seq).toBe(seq)
    expect((await guest.put([{ recordId: 'trip-1' }])).body).toEqual(spacesError('bad_request'))
    // Members see what the guest recorded.
    expect(ids(await owner.sync())).toContain(door)
  })

  it('refuses stale_key after a rekey, and takes the new epoch', async () => {
    const { owner, S, guest } = await linked()
    expect((await owner.rekey(2, [owner])).status).toBe(200)
    expect((await guest.put([{ recordId: `s.${S}.w` }])).body).toEqual(spacesError('stale_key'))
    guest.epoch = 2
    expect((await guest.put([{ recordId: `s.${S}.w` }])).status).toBe(200)
    expect((await guest.sync()).body.epoch).toBe(2)
  })

  it('works a street only while its creator may write it', async () => {
    const { owner, S, guest, g } = await linked()
    const W = await owner.other()
    await W.joinVia(owner)
    // The owner hands S off: the owner's link stops reaching it.
    await owner.send('handoff/create', { ...owner.fields, scopeId: S, target: W.memberId })
    expect(ids(await guest.sync())).toEqual([g])
    expect((await guest.put([{ recordId: `s.${S}.w` }])).body).toEqual(spacesError('forbidden'))
    // Taken back, it works again.
    await owner.send('handoff/end', { ...owner.fields, scopeId: S })
    expect((await guest.put([{ recordId: `s.${S}.w` }])).status).toBe(200)
  })

  it('pages at 500 at most', async () => {
    const owner = await territory()
    const S = scopeId()
    const link = await openLink(owner, [S])
    for (let i = 0; i < 6; i++)
      await owner.put(Array.from({ length: 100 }, () => ({ recordId: `s.${S}.${uuid()}` })))
    const first = await link.guest.sync()
    expect(first.body.records).toHaveLength(SPACES_LIMITS.guestSyncRecords)
    expect(first.body.more).toBe(true)
    const rest = await link.guest.sync(first.body.seq)
    expect(rest.body.records).toHaveLength(100)
    expect(rest.body.more).toBe(false)
    expect((await link.guest.sync(0, { limit: 501 })).body).toEqual(spacesError('bad_request'))
  })
})

describe('ending', () => {
  it('stops the moment its link is ended, with reason ended', async () => {
    const { owner, guest } = await linked()
    await owner.send('link/end', { ...owner.fields, linkId: guest.linkId })
    for (const response of [await guest.sync(), await guest.put([{ recordId: `s.${randomId()}.w` }])])
      expect(response).toMatchObject({
        status: 410,
        body: { ...spacesError('gone'), reason: 'ended' },
      })
  })

  it('stops at expiresAt, with reason expired', async () => {
    const owner = await territory()
    const link = await openLink(owner, [scopeId()], { expiresAt: Date.now() + HOUR })
    expect((await link.guest.sync()).status).toBe(200)
    advance(HOUR)
    expect(await link.guest.sync()).toMatchObject({
      status: 410,
      body: { ...spacesError('gone'), reason: 'expired' },
    })
  })

  it('stops when a take-back ends the holder’s link, when its creator leaves, and when the space goes', async () => {
    const owner = await territory()
    const [S, T] = [scopeId(), scopeId()]
    const holder = await owner.other()
    await holder.joinVia(owner, { scopes: [S], handoff: true })
    const onS = await openLink(holder, [S])
    expect((await onS.guest.put([{ recordId: `s.${S}.w` }])).status).toBe(200)
    await owner.send('handoff/end', { ...owner.fields, scopeId: S })
    expect((await onS.guest.sync()).body).toEqual({ ...spacesError('gone'), reason: 'ended' })

    const W = await owner.other()
    await W.joinVia(owner)
    await owner.send('handoff/create', { ...owner.fields, scopeId: T, target: W.memberId })
    const onT = await openLink(W, [T])
    expect((await onT.guest.sync()).status).toBe(200)
    expect((await W.leave()).status).toBe(200)
    expect((await onT.guest.sync()).body).toEqual({ ...spacesError('gone'), reason: 'ended' })

    const ownerLink = await openLink(owner, [scopeId()])
    expect((await ownerLink.guest.sync()).status).toBe(200)
    expect((await owner.deleteSpace()).status).toBe(200)
    expect(await ownerLink.guest.sync()).toMatchObject({
      status: 410,
      body: { ...spacesError('gone'), reason: 'ended' },
    })
  })
})

describe('not_found', () => {
  it('is the same for an unknown space, an unknown link, a wrong token, and a car’s space', async () => {
    const { owner, guest } = await linked()
    const car = await SpaceMember.open(h.env)
    await car.create()
    const wrong = (await linkSecret()).linkToken
    const pages = [
      new GuestPage(h.env, randomId(), guest.linkId, guest.linkToken),
      new GuestPage(h.env, owner.spaceId, randomId(), guest.linkToken),
      new GuestPage(h.env, owner.spaceId, guest.linkId, wrong),
      new GuestPage(h.env, car.spaceId, guest.linkId, guest.linkToken),
    ]
    const answers = []
    for (const page of pages)
      for (const response of [await page.sync(), await page.put([{ recordId: `s.${randomId()}.w` }])])
        answers.push({
          status: response.status,
          body: response.body,
          headers: [...response.headers].filter(([name]) => name !== 'date'),
        })
    expect(answers[0]).toEqual({
      status: 404,
      body: spacesError('not_found'),
      headers: [['content-type', 'application/json']],
    })
    for (const answer of answers) expect(answer).toEqual(answers[0])
    // An unknown space never gets storage.
    expect(h.spaces.storage(pages[0].spaceId).tables()).toEqual([])
  })

  it('never ends or counts a link for a wrong token', async () => {
    const { guest } = await linked()
    const wrong = new GuestPage(h.env, guest.spaceId, guest.linkId, (await linkSecret()).linkToken)
    for (let i = 0; i < SPACES_LIMITS.guestLinkSyncs + 5; i++) {
      wrong.ip = `198.51.100.${i % 200}`
      expect((await wrong.sync()).status).toBe(404)
    }
    expect((await guest.sync()).status).toBe(200)
  })
})

describe('gates before the space', () => {
  const spyOnSpace = () => ({
    sync: vi.spyOn(SharedSpace.prototype, 'guestSync'),
    put: vi.spyOn(SharedSpace.prototype, 'guestPut'),
  })

  it('answers disabled while spaces:guests or spaces:enabled is off, without waking a space', async () => {
    const { owner, guest, S } = await linked()
    const space = spyOnSpace()
    for (const [key, value] of [
      ['spaces:guests', 'false'],
      ['spaces:enabled', 'false'],
    ]) {
      await h.kv.put(key, value)
      for (const response of [await guest.sync(), await guest.put([{ recordId: `s.${S}.w` }])]) {
        expect(response).toMatchObject({ status: 503, body: { ...spacesError('disabled'), retryAfter: 60 } })
        expect(response.headers.get('retry-after')).toBe('60')
      }
      await h.kv.delete(key)
    }
    expect(space.sync).not.toHaveBeenCalled()
    expect(space.put).not.toHaveBeenCalled()
    // link/create still works while guests are paused.
    await h.kv.put('spaces:guests', 'false')
    expect((await openLink(owner, [S])).response.status).toBe(200)
  })

  it('falls back to SPACES_GUESTS, which KV overrides', async () => {
    h = await createHarness({ spacesGuests: 'false' })
    const owner = await territory()
    const link = await openLink(owner, [scopeId()])
    expect((await link.guest.sync()).body).toMatchObject(spacesError('disabled'))
    await h.kv.put('spaces:guests', 'true')
    expect((await link.guest.sync()).status).toBe(200)
  })

  it('limits each network to 120 a minute, keyed by an HMAC of its IP, before any space wakes', async () => {
    const { guest } = await linked()
    for (let i = 0; i < SPACES_LIMITS.guestRequestsPerMinute; i++) {
      // A /64 is one network, whichever address in it.
      guest.ip = `2001:db8:1:2::${(i + 1).toString(16)}`
      // Unknown links: not_found, but still counted.
      const page = new GuestPage(h.env, guest.spaceId, randomId(), guest.linkToken, guest.ip)
      expect((await page.sync()).status).toBe(404)
    }
    const space = spyOnSpace()
    guest.ip = '2001:db8:1:2:ffff::1'
    const refused = await guest.sync()
    expect(refused).toMatchObject({ status: 429, body: { ...spacesError('rate_limited'), retryAfter: 60 } })
    expect(space.sync).not.toHaveBeenCalled()
    guest.ip = '2001:db8:1:3::1'
    expect((await guest.sync()).status).toBe(200)
    const keys = new Set(h.guestLimitKeys)
    expect(keys.size).toBe(2)
    for (const key of keys) {
      expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(key).not.toContain('2001')
    }
  })

  it('refuses bodies over 64 KiB and malformed fields before any space wakes', async () => {
    const { guest, S } = await linked()
    const space = spyOnSpace()
    const big = await guest.send('guest/put', {
      ...guest.fields,
      records: [{ recordId: `s.${S}.w`, epoch: 1, stamp: Date.now(), blob: 'A'.repeat(SPACES_LIMITS.guestBodyBytes) }],
    })
    expect(big).toMatchObject({ status: 413, body: spacesError('too_large') })
    const tooMany = await guest.put(
      Array.from({ length: SPACES_LIMITS.guestPutRecords + 1 }, () => ({ recordId: `s.${S}.${uuid()}` }))
    )
    expect(tooMany).toMatchObject({ status: 413, body: spacesError('too_large') })
    const bigBlob = await guest.put([{ recordId: `s.${S}.w`, blob: blobOfSize(SPACES_LIMITS.guestBlobBytes + 1) }])
    expect(bigBlob).toMatchObject({ status: 413, body: spacesError('too_large') })
    for (const body of [
      { ...guest.fields, since: -1 },
      { ...guest.fields, linkToken: 'short', since: 0 },
      { spaceId: guest.spaceId, linkId: guest.linkId, since: 0 },
      { ...guest.fields, linkId: 'x', since: 0 },
    ])
      expect((await guest.send('guest/sync', body)).body).toEqual(spacesError('bad_request'))
    expect((await guest.send('guest/put', { ...guest.fields, records: [] })).body).toEqual(
      spacesError('bad_request')
    )
    expect((await guest.put([{ recordId: 'trip-1' }])).body).toEqual(spacesError('bad_request'))
    expect(space.sync).not.toHaveBeenCalled()
    expect(space.put).not.toHaveBeenCalled()
    // 4 KiB exactly fits.
    expect((await guest.put([{ recordId: `s.${S}.w`, blob: blobOfSize(SPACES_LIMITS.guestBlobBytes) }])).status).toBe(200)
  })

  it('needs no session, and ignores one', async () => {
    const { guest, owner } = await linked()
    expect((await guest.sync(0)).status).toBe(200)
    expect((await guest.send('guest/sync', { ...guest.fields, since: 0 }, { authorization: `Bearer ${owner.session.accessToken}` })).status).toBe(200)
  })

  it('answers disabled when the worker has no key to hash IPs with', async () => {
    const { guest } = await linked()
    ;(h.env as Environment & { ACCOUNT_TICKET_SECRET?: string }).ACCOUNT_TICKET_SECRET = undefined
    expect((await guest.sync()).body).toMatchObject(spacesError('disabled'))
  })
})

describe('per-link limits', () => {
  it('takes 120 syncs and 30 puts a link a minute', async () => {
    const { guest, S } = await linked()
    let n = 0
    const fresh = () => {
      guest.ip = `203.0.113.${n++ % 250}`
    }
    for (let i = 0; i < SPACES_LIMITS.guestLinkSyncs; i++) {
      fresh()
      expect((await guest.sync()).status).toBe(200)
    }
    fresh()
    const refused = await guest.sync()
    expect(refused).toMatchObject({ status: 429, body: spacesError('rate_limited') })
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0)
    for (let i = 0; i < SPACES_LIMITS.guestLinkPuts; i++) {
      fresh()
      expect((await guest.put([{ recordId: `s.${S}.w` }])).status).toBe(200)
    }
    fresh()
    expect((await guest.put([{ recordId: `s.${S}.w` }])).body).toMatchObject(spacesError('rate_limited'))
    advance(MINUTE)
    fresh()
    expect((await guest.sync()).status).toBe(200)
    expect((await guest.put([{ recordId: `s.${S}.w` }])).status).toBe(200)
  })

  it('takes 2,000 records a link a rolling day, per link', async () => {
    const { owner, guest, S } = await linked()
    let put = 0
    let n = 0
    while (put < SPACES_LIMITS.guestLinkRecordsPerDay) {
      guest.ip = `203.0.113.${n++ % 250}`
      const response = await guest.put(
        Array.from({ length: SPACES_LIMITS.guestPutRecords }, () => ({ recordId: `s.${S}.${uuid()}` }))
      )
      expect(response.status).toBe(200)
      put += SPACES_LIMITS.guestPutRecords
      if (n % SPACES_LIMITS.guestLinkPuts === 0) advance(MINUTE)
    }
    advance(MINUTE)
    const refused = await guest.put([{ recordId: `s.${S}.w` }])
    expect(refused).toMatchObject({ status: 429, body: spacesError('rate_limited') })
    // Another link on the same street has its own budget.
    const other = await openLink(owner, [S])
    expect((await other.guest.put([{ recordId: `s.${S}.w` }])).status).toBe(200)
  }, 30_000)
})

describe('privacy', () => {
  it('never logs or reports a token, verifier, IP, link, or blob', async () => {
    const logs: unknown[] = []
    for (const level of ['log', 'warn', 'error', 'info', 'debug'] as const)
      vi.spyOn(console, level).mockImplementation((...args) => logs.push(args))
    const recorder = recordSentryEvents()
    try {
      const { owner, guest, S, link } = await linked()
      guest.ip = '192.0.2.77'
      const blob = 'Q'.repeat(40)
      await guest.put([{ recordId: `s.${S}.w`, blob }])
      await guest.sync()
      await new GuestPage(h.env, guest.spaceId, guest.linkId, (await linkSecret()).linkToken, guest.ip).sync()
      // Every guest op on broken storage, so each failure reaches Sentry.
      h.spaces.storage(owner.spaceId).query('DROP TABLE link_request')
      expect((await guest.sync()).status).toBe(500)
      expect((await guest.put([{ recordId: `s.${S}.w`, blob }])).status).toBe(500)
      const events = await recorder.events()
      expect(events.map((event) => event.exception?.values?.[0]?.value)).toEqual([
        'spaces/guest/sync',
        'spaces/guest/put',
      ])
      const text = JSON.stringify({ logs, events })
      for (const secret of [
        guest.linkToken,
        link.verifier,
        guest.linkId,
        guest.spaceId,
        guest.ip,
        blob,
        'link_request',
      ])
        expect(text).not.toContain(secret)
      expect(logs).toContainEqual(['spaces: request failed', { op: 'guest/sync' }])
    } finally {
      recorder.stop()
    }
  })

  it('stores the verifier, never the token', async () => {
    const { owner, guest, link } = await linked()
    const storage = h.spaces.storage(owner.spaceId)
    const tables = JSON.stringify(storage.tables().map((table) => storage.query(`SELECT * FROM ${table}`)))
    expect(tables).toContain(link.verifier)
    expect(tables).not.toContain(guest.linkToken)
    expect(tables).not.toContain(guest.ip)
  })

  it('drops IP headers from Sentry events', () => {
    const config = createSentryConfig({ SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0' } as Environment)
    const event = {
      request: {
        headers: {
          'cf-connecting-ip': '192.0.2.1',
          'CF-Connecting-IPv6': '2001:db8::1',
          'cf-pseudo-ipv4': '192.0.2.2',
          'x-forwarded-for': '192.0.2.3',
          'x-real-ip': '192.0.2.4',
          'true-client-ip': '192.0.2.5',
          'content-type': 'application/json',
        },
      },
    } as Event
    const scrubbed = config.beforeSend!(event as never, {}) as Event
    expect(scrubbed.request?.headers).toEqual({ 'content-type': 'application/json' })
  })
})

describe('wrangler.toml', () => {
  const toml = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')

  it('binds SPACES_GUEST_LIMITER at 120 a minute in every environment, on distinct namespaces', () => {
    for (const [prefix, id] of [
      ['', '1008'],
      ['env.beta.', '3008'],
      ['env.dev.', '2008'],
    ]) {
      const p = prefix.replace(/\./g, '\\.')
      const pattern = new RegExp(
        `\\[\\[${p}ratelimits\\]\\]\\s*\\nname = "SPACES_GUEST_LIMITER"\\s*\\nnamespace_id = "${id}"[^\\n]*\\n\\s*\\n\\s*\\[${p}ratelimits\\.simple\\]\\s*\\n\\s*limit = ${SPACES_LIMITS.guestRequestsPerMinute}\\s*\\n\\s*period = 60`
      )
      expect(toml, prefix || 'prod').toMatch(pattern)
    }
  })

  it('sets SPACES_GUESTS on in Beta and locally, and off in prod', () => {
    const section = (name: string) => toml.split(`\n[${name}]\n`)[1]?.split(/\n\[/)[0] ?? ''
    const value = (name: string) => /^SPACES_GUESTS = "(\w+)"/m.exec(section(name))?.[1]
    expect(value('vars')).toBe('false')
    expect(value('env.beta.vars')).toBe('true')
    expect(value('env.dev.vars')).toBe('true')
    expect(toml.match(/^SPACES_GUESTS = /gm)).toHaveLength(3)
  })
})
