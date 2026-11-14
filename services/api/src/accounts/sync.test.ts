import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createHarness,
  randomBytes,
  randomId,
  sha256B64u,
  TEST_WEB_ORIGIN,
  type Harness,
} from '../test/buddies'
import {
  accountEnvelope,
  bearer,
  liveTicket,
  openTestSession,
  postJson,
  requestJson,
  type TestSession,
} from '../test/accounts'
import type { FakeWebSocket } from '../test/durableObjects'
import { RevenueCatError } from '../revenuecat'
import { createAccountsRoutes } from './route'
import { resetSyncEntitlementCache } from './sync'
import { resetSessionCapabilitiesCache } from './sessionStore'
import { SYNC_LIMITS } from './syncContracts'
import { entitlementForApp, syncEntitlement } from './syncSwitch'
import { AccountSync } from './syncDO'
import { accountSupporterStatus } from './supporter'
import { accessTokenKeys, signAccessToken } from './tokens'

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

vi.mock('./supporter', async (original) => ({
  ...(await original<typeof import('./supporter')>()),
  accountSupporterStatus: vi.fn(),
}))

/**
 * Cloud Sync (witness-work ADR 0030): per-device encrypted slots in R2, an
 * `AccountSync` index per account, a live socket, switches, and retention.
 */

/** A session from an app that says it turns Cloud Sync on only for new installs. */
const CURRENT_APP = { appVersion: '1.47.0', capabilities: ['sync-everyone'] }
const START = Date.UTC(2026, 9, 19, 12)
const SECOND = 1_000
const DAY = 24 * 60 * 60 * SECOND
const MIB = 1_024 * 1_024
const app = createAccountsRoutes()
const supporterStatus = vi.mocked(accountSupporterStatus)

let h: Harness

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
  resetSyncEntitlementCache()
  resetSessionCapabilitiesCache()
  supporterStatus.mockReset()
  supporterStatus.mockResolvedValue({
    supporter: true,
    expiresAt: null,
    customers: 1,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)
const session = () => openTestSession(app as never, h.env, undefined, CURRENT_APP)
const slot = () => randomId().slice(0, 16)

const request = (path: string, init: RequestInit) =>
  (app as { request: typeof fetch }).request(
    path,
    { duplex: 'half', ...init } as RequestInit,
    h.env as never
  )

const put = async (
  s: TestSession,
  slotId: string,
  bytes: Uint8Array = randomBytes(1_000),
  headers: Record<string, string> = {}
) => {
  const response = await request('/sync/put', {
    method: 'POST',
    headers: {
      ...bearer(s.accessToken),
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.byteLength),
      'x-ww-slot-id': slotId,
      'x-ww-sha256': await sha256B64u(bytes),
      ...headers,
    },
    body: bytes,
  })
  return {
    status: response.status,
    headers: response.headers,
    body: (await response.json()) as Record<string, unknown>,
  }
}

const list = (s: TestSession) =>
  postJson(app as never, h.env, '/sync/list', {}, bearer(s.accessToken))

const del = (s: TestSession, body: Record<string, unknown> = {}) =>
  postJson(app as never, h.env, '/sync/delete', body, bearer(s.accessToken))

const get = async (s: TestSession, slotId: string) => {
  const response = await request('/sync/get', {
    method: 'POST',
    headers: { ...bearer(s.accessToken), 'content-type': 'application/json' },
    body: JSON.stringify({ slotId }),
  })
  return {
    status: response.status,
    headers: response.headers,
    bytes:
      response.status === 200
        ? new Uint8Array(await response.arrayBuffer())
        : null,
    body: response.status === 200 ? null : await response.json(),
  }
}

const live = async (
  s: TestSession,
  slotId: string,
  headers: Record<string, string> = {}
) => {
  const response = (await request('/sync/live', {
    method: 'GET',
    headers: {
      ...bearer(s.accessToken),
      upgrade: 'websocket',
      'x-ww-slot-id': slotId,
      ...headers,
    },
  })) as Response & { webSocket?: FakeWebSocket | null }
  return {
    status: response.status,
    socket: response.status === 101 ? response.webSocket! : null,
  }
}

const code = (body: unknown) => (body as { code?: string }).code

describe('put, list, get, delete', () => {
  it('stores ciphertext per slot and lists ETags with the account seq', async () => {
    const s = await session()
    const phone = slot()
    const bytes = randomBytes(5_000)
    const etag = await sha256B64u(bytes)

    const stored = await put(s, phone, bytes)
    expect(stored.status).toBe(200)
    expect(stored.body).toEqual({
      ok: true,
      etag,
      size: 5_000,
      updatedAt: START,
      seq: 1,
      floorSequence: 1,
    })
    expect(stored.headers.get('etag')).toBe(`"${etag}"`)
    expect(h.syncBlobs.objects.get(`v1/${s.accountId}/${phone}`)?.bytes).toEqual(
      bytes
    )

    expect((await list(s)).body).toEqual({
      ok: true,
      seq: 1,
      slots: [
        { slotId: phone, etag, size: 5_000, updatedAt: START, platform: 'dev', live: true },
      ],
    })

    const got = await get(s, phone)
    expect(got.status).toBe(200)
    expect(got.bytes).toEqual(bytes)
    expect(got.headers.get('etag')).toBe(`"${etag}"`)
    expect(got.headers.get('x-ww-updated-at')).toBe(String(START))
    expect(got.headers.get('cache-control')).toBe('no-store')

    expect((await get(s, slot())).status).toBe(404)

    expect((await del(s, { slotId: phone })).body).toEqual({ ok: true, seq: 2 })
    expect(h.syncBlobs.objects.size).toBe(0)
    expect((await list(s)).body).toEqual({ ok: true, seq: 2, slots: [] })
    // Idempotent.
    expect((await del(s, { slotId: phone })).body).toEqual({ ok: true, seq: 2 })
  })

  it('keeps accounts apart', async () => {
    const a = await session()
    const b = await session()
    const shared = slot()
    await put(a, shared)
    expect((await list(b)).body).toEqual({ ok: true, seq: 0, slots: [] })
    expect((await get(b, shared)).status).toBe(404)
    await del(b, { slotId: shared })
    expect((await list(a)).body).toMatchObject({ slots: [{ slotId: shared }] })
  })

  it('deletes every slot, and leftovers in R2, without slotId', async () => {
    const s = await session()
    await put(s, slot())
    await put(s, slot())
    h.syncBlobs.objects.set(`v1/${s.accountId}/orphaned-slot`, {
      bytes: randomBytes(4),
      uploaded: Date.now(),
    })
    expect((await del(s)).body).toEqual({ ok: true, seq: 3 })
    expect(h.syncBlobs.objects.size).toBe(0)
  })

  it('needs a live session to put or delete a slot', async () => {
    const s = await session()
    const mine = slot()
    await put(s, mine)
    await requestJson(app as never, h.env, 'DELETE', '/sessions/current', undefined, bearer(s.accessToken))
    expect((await del(s)).status).toBe(401)
    expect((await del(s, { slotId: mine })).status).toBe(401)
    expect((await put(s, mine)).status).toBe(401)
    // Reads keep the token's 15 minutes.
    expect((await get(s, mine)).status).toBe(200)
  })

  it('refuses malformed requests', async () => {
    const s = await session()
    const bytes = randomBytes(100)
    expect((await put(s, 'short')).status).toBe(400)
    expect(
      (await put(s, slot(), bytes, { 'x-ww-sha256': await sha256B64u(randomBytes(100)) }))
        .body
    ).toMatchObject({ code: 'bad_request' })
    expect((await put(s, slot(), bytes, { 'if-match': 'nope' })).status).toBe(400)
    expect((await get(s, 'bad slot id!')).status).toBe(400)
    expect((await del(s, { slotId: 7 })).status).toBe(400)
    expect(h.syncBlobs.objects.size).toBe(0)
  })

  it('refuses a request without a token', async () => {
    const response = await postJson(app as never, h.env, '/sync/list', {})
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('Bearer')
  })
})

describe('If-Match', () => {
  it('puts only while the slot holds that ETag, or exists for *', async () => {
    const s = await session()
    const phone = slot()
    expect((await put(s, phone, randomBytes(10), { 'if-match': '*' })).body).toMatchObject({
      code: 'precondition_failed',
    })
    const first = await put(s, phone)
    advance(2 * SECOND)
    const stale = `"${await sha256B64u(randomBytes(10))}"`
    const refused = await put(s, phone, randomBytes(10), { 'if-match': stale })
    expect(refused.status).toBe(412)
    expect(
      (await put(s, phone, randomBytes(10), { 'if-match': `"${first.body.etag}"` }))
        .status
    ).toBe(200)
    advance(2 * SECOND)
    expect((await put(s, phone, randomBytes(10), { 'if-match': '*' })).status).toBe(200)
  })
})

describe('limits', () => {
  it('refuses a declared size over 20 MiB before reading the body', async () => {
    const s = await session()
    const response = await request('/sync/put', {
      method: 'POST',
      headers: {
        ...bearer(s.accessToken),
        'content-length': String(SYNC_LIMITS.blobBytes + 1),
        'x-ww-slot-id': slot(),
        'x-ww-sha256': await sha256B64u(randomBytes(1)),
      },
      body: randomBytes(1),
    })
    expect(response.status).toBe(413)
    expect(code(await response.json())).toBe('too_large')
  })

  it('caps new slots at 20 an account', async () => {
    const s = await session()
    for (let i = 0; i < SYNC_LIMITS.slots; i++)
      expect((await put(s, slot(), randomBytes(8))).status).toBe(200)
    const over = await put(s, slot(), randomBytes(8))
    expect(over.status).toBe(429)
    expect(over.body).toMatchObject({ code: 'limit' })
  })

  it('takes one put a slot every 2 seconds', async () => {
    const s = await session()
    const phone = slot()
    await put(s, phone)
    advance(1_500)
    const early = await put(s, phone)
    expect(early.status).toBe(429)
    expect(early.body).toMatchObject({ code: 'rate_limited', retryAfter: 1 })
    expect(early.headers.get('retry-after')).toBe('1')
    // Another device isn't held up.
    expect((await put(s, slot())).status).toBe(200)
    advance(500)
    expect((await put(s, phone)).status).toBe(200)
  })

  it('holds a slot while a put is uploading, and frees it after a failed write', async () => {
    const s = await session()
    const index = h.syncIndexes.object(s.accountId)
    const phone = slot()
    const begun = await index.beginPut({
      accountId: s.accountId,
      slotId: phone,
      size: 10,
      ifMatch: null,
    })
    expect(begun.ok).toBe(true)
    expect((await put(s, phone)).body).toMatchObject({ code: 'rate_limited' })
    advance(SYNC_LIMITS.putReservationMs + 1)
    h.syncBlobs.failNext('put')
    expect((await put(s, phone)).status).toBe(500)
    expect((await put(s, phone)).status).toBe(200)
  })

  it('caps puts and bytes an account a rolling day', async () => {
    const s = await session()
    const index = h.syncIndexes.object(s.accountId)
    const args = { accountId: s.accountId, slotId: slot(), size: 1, ifMatch: null }
    for (let i = 0; i < SYNC_LIMITS.accountPutsPerDay; i++) {
      const begun = await index.beginPut(args)
      expect(begun.ok).toBe(true)
      if (begun.ok)
        await index.abortPut({ slotId: args.slotId, reservation: begun.value.reservation })
    }
    const over = await put(s, slot())
    expect(over.status).toBe(429)
    expect(over.body).toMatchObject({ code: 'rate_limited', retryAfter: 24 * 60 * 60 })
    advance(DAY + 1)
    // The token expired meanwhile; the same account signs in again.
    const again = await openTestSession(app as never, h.env, s.key, CURRENT_APP)
    expect((await put(again, slot())).status).toBe(200)

    const other = await session()
    const big = h.syncIndexes.object(other.accountId)
    const half = { accountId: other.accountId, slotId: slot(), size: SYNC_LIMITS.accountBytesPerDay / 2, ifMatch: null }
    const first = await big.beginPut(half)
    if (first.ok) await big.abortPut({ slotId: half.slotId, reservation: first.value.reservation })
    expect((await big.beginPut(half)).ok).toBe(true)
    expect(await big.beginPut({ ...half, slotId: slot(), size: 1 })).toMatchObject({
      ok: false,
      error: 'rate_limited',
    })
  })
})

describe('switches and entitlement', () => {
  it('is free for everyone by default', async () => {
    const s = await session()
    supporterStatus.mockResolvedValue({ supporter: false, expiresAt: null, customers: 0 })
    expect((await put(s, slot())).status).toBe(200)
    expect(
      (await requestJson(app as never, h.env, 'GET', '/sync', undefined, bearer(s.accessToken))).body
    ).toMatchObject({ entitled: true, entitlement: 'everyone', supporter: false })
  })

  it("doesn't give everyone's Cloud Sync to an app without the capability", async () => {
    // An app that never sends `sync-everyone` (any version) turns Cloud Sync
    // on by itself for any device that never chose once it's entitled
    // (ADR 0040 §2).
    const old = await openTestSession(app as never, h.env)
    supporterStatus.mockResolvedValue({ supporter: false, expiresAt: null, customers: 0 })
    expect(
      (await requestJson(app as never, h.env, 'GET', '/sync', undefined, bearer(old.accessToken))).body
    ).toMatchObject({ enabled: true, entitled: false, entitlement: 'supporter', supporter: false })
    const refused = await put(old, slot())
    expect(refused.status).toBe(403)
    expect(refused.body).toMatchObject({ code: 'supporter_required' })
    // Its Supporters keep Cloud Sync as before.
    resetSyncEntitlementCache()
    supporterStatus.mockResolvedValue({ supporter: true, expiresAt: null, customers: 1 })
    expect((await put(old, slot())).status).toBe(200)
    // The version doesn't decide it: 1.47.0 without the capability is refused.
    const versioned = await openTestSession(app as never, h.env, undefined, { appVersion: '1.47.0' })
    resetSyncEntitlementCache()
    supporterStatus.mockResolvedValue({ supporter: false, expiresAt: null, customers: 0 })
    expect((await put(versioned, slot())).status).toBe(403)
    // Unknown names are ignored, not granted.
    const other = await openTestSession(app as never, h.env, undefined, { capabilities: ['sync-later'] })
    expect((await put(other, slot())).status).toBe(403)
    // With it, the same account's new session is in.
    const current = await openTestSession(app as never, h.env, versioned.key, CURRENT_APP)
    expect((await put(current, slot())).status).toBe(200)
  })

  it('takes the capability on refresh, and keeps it when a refresh leaves it out', async () => {
    supporterStatus.mockResolvedValue({ supporter: false, expiresAt: null, customers: 0 })
    const s = await openTestSession(app as never, h.env)
    expect((await put(s, slot())).status).toBe(403)
    const refresh = async (body: Record<string, unknown>) => {
      const response = await requestJson(app as never, h.env, 'POST', '/sessions/refresh', {
        refreshToken: s.refreshToken,
        ...body,
      })
      expect(response.status).toBe(200)
      const tokens = response.body as { accessToken: string; refreshToken: string }
      s.accessToken = tokens.accessToken
      s.refreshToken = tokens.refreshToken
    }
    // The app updated: its next refresh says so, answered at once (a session
    // without capabilities isn't cached).
    await refresh({ capabilities: ['sync-everyone'] })
    expect((await put(s, slot())).status).toBe(200)
    await refresh({ appVersion: '1.47.1' })
    expect((await put(s, slot())).status).toBe(200)
    // Sent empty, it replaces the stored list, and this isolate forgets the
    // cached one.
    await refresh({ capabilities: [] })
    expect((await put(s, slot())).status).toBe(403)
    // Malformed is `bad_request`.
    for (const capabilities of ['sync-everyone', [1], ['Sync Everyone'], Array(17).fill('a')]) {
      const response = await requestJson(app as never, h.env, 'POST', '/sessions/refresh', {
        refreshToken: s.refreshToken,
        capabilities,
      })
      expect(response.body).toMatchObject({ code: 'bad_request' })
    }
  })

  it('grants everyone only with the capability, and never past the switch', () => {
    expect(entitlementForApp('everyone', ['sync-everyone'])).toBe('everyone')
    expect(entitlementForApp('everyone', ['other', 'sync-everyone'])).toBe('everyone')
    expect(entitlementForApp('everyone', [])).toBe('supporter')
    expect(entitlementForApp('everyone', null)).toBe('supporter')
    expect(entitlementForApp('everyone', undefined)).toBe('supporter')
    expect(entitlementForApp('supporter', ['sync-everyone'])).toBe('supporter')
  })

  it('resolves who gets it from KV, then the var, else everyone', async () => {
    const kv = (value?: string) => ({
      get: async () => value ?? null,
    })
    expect(await syncEntitlement({ NOTES_KV: kv() })).toBe('everyone')
    expect(await syncEntitlement({ NOTES_KV: kv(), SYNC_ENTITLEMENT: 'supporter' })).toBe('supporter')
    expect(await syncEntitlement({ NOTES_KV: kv('supporter'), SYNC_ENTITLEMENT: 'everyone' })).toBe('supporter')
    expect(await syncEntitlement({ NOTES_KV: kv('everyone'), SYNC_ENTITLEMENT: 'supporter' })).toBe('everyone')
    expect(await syncEntitlement({ NOTES_KV: kv(' supporter\n') })).toBe('supporter')
    expect(await syncEntitlement({ NOTES_KV: kv('Supporter') })).toBe('supporter')
    // Anything else is the default.
    expect(await syncEntitlement({ NOTES_KV: kv('nope') })).toBe('everyone')
    // An unreadable KV falls back to the var.
    const broken = { get: async () => { throw new Error('kv down') } }
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await syncEntitlement({ NOTES_KV: broken, SYNC_ENTITLEMENT: 'supporter' })).toBe('supporter')
    expect(await syncEntitlement({ NOTES_KV: broken })).toBe('everyone')
  })

  it('is a Supporter benefit again with sync:entitlement supporter', async () => {
    const s = await session()
    supporterStatus.mockResolvedValue({ supporter: false, expiresAt: null, customers: 0 })
    await h.kv.put('sync:entitlement', 'supporter')
    const refused = await put(s, slot())
    expect(refused.status).toBe(403)
    expect(refused.body).toMatchObject({ code: 'supporter_required' })
    for (const path of ['/sync/list', '/sync/get'])
      expect(
        (await postJson(app as never, h.env, path, { slotId: slot() }, bearer(s.accessToken))).status,
        path
      ).toBe(403)
    expect((await live(s, slot())).status).toBe(403)
    // Taking data off the server always works.
    expect((await del(s, { slotId: slot() })).status).toBe(200)
    expect(
      (await requestJson(app as never, h.env, 'GET', '/sync', undefined, bearer(s.accessToken))).body
    ).toEqual({
      ok: true,
      enabled: true,
      entitled: false,
      entitlement: 'supporter',
      supporter: false,
      requestedAt: null,
      photos: true,
      changes: false,
    })
    supporterStatus.mockResolvedValue({ supporter: true, expiresAt: null, customers: 1 })
    resetSyncEntitlementCache()
    expect((await put(s, slot())).status).toBe(200)
  })

  it('caches the Supporter answer for a minute per account', async () => {
    await h.kv.put('sync:entitlement', 'supporter')
    const s = await session()
    await put(s, slot())
    await list(s)
    expect(supporterStatus).toHaveBeenCalledTimes(1)
    advance(60 * SECOND)
    await list(s)
    expect(supporterStatus).toHaveBeenCalledTimes(2)
  })

  it('says unavailable, not "not a Supporter", when RevenueCat is down', async () => {
    await h.kv.put('sync:entitlement', 'supporter')
    const s = await session()
    supporterStatus.mockRejectedValue(new RevenueCatError('RevenueCat 500'))
    const refused = await put(s, slot())
    expect(refused.status).toBe(503)
    expect(refused.body).toMatchObject({ code: 'unavailable' })
    expect(refused.headers.get('retry-after')).toBe('30')
    expect(
      (await requestJson(app as never, h.env, 'GET', '/sync', undefined, bearer(s.accessToken))).body
    ).toMatchObject({ supporter: false, supporterCheckFailed: true, entitled: false })
  })

  it('turns off with sync:enabled, except delete and the status', async () => {
    const s = await session()
    const phone = slot()
    await put(s, phone)
    await h.kv.put('sync:enabled', 'false')
    advance(2 * SECOND)
    const refused = await put(s, phone)
    expect(refused.status).toBe(503)
    expect(refused.body).toMatchObject({ code: 'disabled' })
    expect(refused.headers.get('retry-after')).toBe('60')
    expect((await list(s)).status).toBe(503)
    expect((await live(s, phone)).status).toBe(503)
    expect(
      (await requestJson(app as never, h.env, 'GET', '/sync', undefined, bearer(s.accessToken))).body
    ).toMatchObject({ enabled: false, entitled: false })
    expect((await del(s, { slotId: phone })).status).toBe(200)
    await h.kv.put('sync:enabled', 'on')
    expect((await list(s)).status).toBe(200)
  })

  it('is off without the bucket', async () => {
    h = await createHarness({ syncBucket: false })
    const s = await session()
    expect((await put(s, slot())).body).toMatchObject({ code: 'disabled' })
    expect((await del(s)).body).toMatchObject({ code: 'disabled' })
  })

  it('keeps a suspended account syncing', async () => {
    const s = await session()
    await h.accountsDb!.prepare("UPDATE accounts SET status = 'suspended'").run()
    expect((await put(s, slot())).status).toBe(200)
    expect((await list(s)).status).toBe(200)
  })
})

describe('live socket', () => {
  it('refuses a web token on the header path, where nothing would close it', async () => {
    const s = await session()
    const keys = (await accessTokenKeys(h.env as never))!
    const { accessToken } = await signAccessToken(keys, {
      accountId: s.accountId,
      sessionId: s.sessionId,
      platform: 'web',
    })
    expect(await live({ ...s, accessToken }, slot())).toMatchObject({
      status: 403,
      socket: null,
    })
  })

  it('says hello with the seq, and changed to the account’s other slots', async () => {
    const s = await session()
    const phone = slot()
    const tablet = slot()
    await put(s, phone)

    const phoneLive = await live(s, phone)
    const tabletLive = await live(s, tablet)
    expect(phoneLive.status).toBe(101)
    expect(phoneLive.socket!.messages()).toEqual([{ type: 'hello', seq: 1 }])

    advance(2 * SECOND)
    await put(s, phone)
    expect(phoneLive.socket!.messages()).toEqual([{ type: 'hello', seq: 1 }])
    expect(tabletLive.socket!.messages()).toEqual([
      { type: 'hello', seq: 1 },
      { type: 'changed', seq: 2 },
    ])

    await del(s, { slotId: tablet })
    // Nothing was there: no change.
    await del(s, { slotId: phone })
    expect(phoneLive.socket!.messages().at(-1)).toEqual({ type: 'changed', seq: 3 })
    expect(tabletLive.socket!.messages().at(-1)).toEqual({ type: 'changed', seq: 3 })
  })

  it('answers ping with pong and ignores anything else', async () => {
    const s = await session()
    const { socket } = await live(s, slot())
    socket!.send('ping')
    socket!.send('hello?')
    expect(socket!.received.slice(1)).toEqual(['pong'])
  })

  it('closes the oldest past 20 sockets an account', async () => {
    const s = await session()
    const sockets: FakeWebSocket[] = []
    for (let i = 0; i <= SYNC_LIMITS.liveSockets; i++) {
      sockets.push((await live(s, slot())).socket!)
      advance(1)
    }
    expect(sockets[0].closedBy).toEqual({ code: 4000, reason: 'replaced' })
    expect(sockets.slice(1).every((socket) => socket.closedBy == null)).toBe(true)
  })

  it('needs an upgrade and a slot id, and never trusts a client’s account header', async () => {
    const s = await session()
    const other = await session()
    const plain = await request('/sync/live', {
      method: 'GET',
      headers: { ...bearer(s.accessToken), 'x-ww-slot-id': slot() },
    })
    expect(plain.status).toBe(426)
    expect((await live(s, 'x')).status).toBe(400)
    const spoofed = await live(s, slot(), { 'x-ww-sync-account': other.accountId })
    expect(spoofed.status).toBe(101)
    advance(2 * SECOND)
    await put(other, slot())
    expect(spoofed.socket!.messages()).toEqual([{ type: 'hello', seq: 0 }])
  })
})

describe('retention', () => {
  it('deletes a slot 30 days after its last put once its session ended', async () => {
    const s = await session()
    const kept = await session()
    const phone = slot()
    await put(s, phone)
    await put(kept, slot())
    expect(h.syncIndexes.storage(s.accountId).alarm()).toBe(START + DAY)

    await requestJson(app as never, h.env, 'DELETE', '/sessions/current', undefined, bearer(s.accessToken))
    advance(29 * DAY)
    await h.syncIndexes.fireAlarm(s.accountId)
    expect(h.syncIndexes.storage(s.accountId).query('SELECT slot_id FROM slot')).toHaveLength(1)

    advance(2 * DAY)
    await h.syncIndexes.fireAlarm(s.accountId)
    expect(h.syncIndexes.storage(s.accountId).query('SELECT slot_id FROM slot')).toEqual([])
    expect(h.syncBlobs.objects.has(`v1/${s.accountId}/${phone}`)).toBe(false)
    // Nothing left: no more alarms.
    expect(h.syncIndexes.storage(s.accountId).alarm()).toBeNull()

    // A live session's slot stays...
    await h.syncIndexes.fireAlarm(kept.accountId)
    expect(h.syncIndexes.storage(kept.accountId).query('SELECT slot_id FROM slot')).toHaveLength(1)
    // ...until 400 days without a put.
    advance(370 * DAY)
    await h.syncIndexes.fireAlarm(kept.accountId)
    expect(h.syncIndexes.storage(kept.accountId).query('SELECT slot_id FROM slot')).toEqual([])
  })

  it('sweeps objects no slot names', async () => {
    const s = await session()
    await put(s, slot())
    const orphan = `v1/${s.accountId}/never-committed`
    h.syncBlobs.objects.set(orphan, { bytes: randomBytes(4), uploaded: Date.now() })
    await h.syncIndexes.fireAlarm(s.accountId)
    // Too young: a put could still be committing it.
    expect(h.syncBlobs.objects.has(orphan)).toBe(true)
    advance(DAY)
    await h.syncIndexes.fireAlarm(s.accountId)
    expect(h.syncBlobs.objects.has(orphan)).toBe(false)
    expect(h.syncBlobs.objects.size).toBe(1)
  })
})

describe('sync/list sessions', () => {
  it('says each slot’s writing platform and whether that session is live', async () => {
    const s = await session()
    const other = await openTestSession(app as never, h.env, s.key, CURRENT_APP)
    const phone = slot()
    const tablet = slot()
    await put(s, phone)
    await put(other, tablet)
    await requestJson(app as never, h.env, 'DELETE', '/sessions/current', undefined, bearer(other.accessToken))
    expect((await list(s)).body.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slotId: phone, platform: 'dev', live: true }),
        expect.objectContaining({ slotId: tablet, platform: 'dev', live: false }),
      ])
    )
  })

  it('reads the platform of a slot put before it was kept, and says unknown once its session is gone', async () => {
    const s = await session()
    const other = await openTestSession(app as never, h.env, s.key, CURRENT_APP)
    const phone = slot()
    const tablet = slot()
    await put(s, phone)
    await put(other, tablet)
    h.syncIndexes.storage(s.accountId).query('UPDATE slot SET platform = NULL')
    await h.accountsDb!.prepare('DELETE FROM account_sessions WHERE id = ?').bind(other.sessionId).run()
    expect((await list(s)).body.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slotId: phone, platform: 'dev', live: true }),
        expect.objectContaining({ slotId: tablet, platform: null, live: false }),
      ])
    )
  })

  it('adds the column to an index from before it', async () => {
    const s = await session()
    const phone = slot()
    await put(s, phone)
    const storage = h.syncIndexes.storage(s.accountId)
    storage.query('ALTER TABLE slot DROP COLUMN platform')
    h.syncIndexes.restart(s.accountId)
    expect((await list(s)).body.slots).toEqual([
      expect.objectContaining({ slotId: phone, platform: 'dev', live: true }),
    ])
    advance(2 * SECOND)
    expect((await put(s, phone)).status).toBe(200)
    expect(storage.query('SELECT platform FROM slot')).toEqual([{ platform: 'dev' }])
  })

  it('says live when the sessions can’t be read', async () => {
    const s = await session()
    const other = await openTestSession(app as never, h.env, s.key, CURRENT_APP)
    await put(other, slot())
    await requestJson(app as never, h.env, 'DELETE', '/sessions/current', undefined, bearer(other.accessToken))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const sessions = await import('./sessionStore')
    vi.spyOn(sessions, 'sessionStates').mockRejectedValueOnce(new Error('d1 down'))
    expect((await list(s)).body.slots).toEqual([
      expect.objectContaining({ platform: 'dev', live: true }),
    ])
    expect((await list(s)).body.slots).toEqual([
      expect.objectContaining({ platform: 'dev', live: false }),
    ])
  })
})

describe('the Cloud Sync request', () => {
  /** `{ requested: true }` with the account's envelope, unless the body says otherwise. */
  const ask = async (s: TestSession, body: Record<string, unknown> | unknown[], signer = s.key) =>
    postJson(
      app as never,
      h.env,
      '/sync/request',
      !Array.isArray(body) && body.requested === true && !('payload' in body)
        ? { ...body, ...(await accountEnvelope('sync/request', signer)) }
        : body,
      bearer(s.accessToken)
    )
  const status = async (s: TestSession) =>
    (await requestJson(app as never, h.env, 'GET', '/sync', undefined, bearer(s.accessToken))).body

  it('sets, keeps its time when asked again, and is withdrawn', async () => {
    const s = await session()
    expect(await status(s)).toMatchObject({ requestedAt: null })
    expect((await ask(s, { requested: true })).body).toEqual({ ok: true, requestedAt: START })
    advance(10 * SECOND)
    expect((await ask(s, { requested: true })).body).toEqual({ ok: true, requestedAt: START })
    expect(await status(s)).toMatchObject({ requestedAt: START })
    // Any session of the account sees it; withdrawing is bearer only.
    const web = await openTestSession(app as never, h.env, s.key, CURRENT_APP)
    expect(await status(web)).toMatchObject({ requestedAt: START })
    expect((await ask(web, { requested: false })).body).toEqual({ ok: true, requestedAt: null })
    expect((await ask(web, { requested: false })).body).toEqual({ ok: true, requestedAt: null })
    expect(await status(s)).toMatchObject({ requestedAt: null })
    // Asked again after that: a new time.
    advance(SECOND)
    expect((await ask(s, { requested: true })).body).toEqual({
      ok: true,
      requestedAt: START + 11 * SECOND,
    })
  })

  it('needs the token’s own account’s signature to set', async () => {
    const s = await session()
    const other = await session()
    const forged = await ask(s, { requested: true }, other.key)
    expect(forged.status).toBe(403)
    expect(forged.body).toMatchObject({ code: 'forbidden' })
    const bare = await ask(s, { requested: true, payload: undefined })
    expect(bare.body).toMatchObject({ code: 'bad_request' })
    const envelope = await accountEnvelope('sync/request', s.key)
    const tampered = await ask(s, { requested: true, ...envelope, signature: (await accountEnvelope('sync/request', s.key)).signature })
    expect(tampered.body).toMatchObject({ code: 'bad_signature' })
    const otherOp = await accountEnvelope('backup/delete', s.key)
    expect((await ask(s, { requested: true, ...otherOp })).body).toMatchObject({ code: 'bad_signature' })
    const stale = await accountEnvelope('sync/request', s.key)
    advance(10 * 60 * SECOND)
    const later = await openTestSession(app as never, h.env, s.key, CURRENT_APP)
    expect((await ask(later, { requested: true, ...stale })).body).toMatchObject({ code: 'stale' })
    expect(await status(later)).toMatchObject({ requestedAt: null })
  })

  it('takes an envelope once, so a captured one can’t undo a withdrawal', async () => {
    const s = await session()
    const envelope = await accountEnvelope('sync/request', s.key)
    expect((await ask(s, { requested: true, ...envelope })).body).toEqual({ ok: true, requestedAt: START })
    expect((await ask(s, { requested: false })).body).toEqual({ ok: true, requestedAt: null })
    const replayed = await ask(s, { requested: true, ...envelope })
    expect(replayed.status).toBe(409)
    expect(replayed.body).toMatchObject({ code: 'replay' })
    expect(await status(s)).toMatchObject({ requestedAt: null })
    // Past its window it's stale, so forgetting the nonce then is safe.
    advance(10 * 60 * SECOND)
    const later = await openTestSession(app as never, h.env, s.key, CURRENT_APP)
    expect((await ask(later, { requested: true, ...envelope })).body).toMatchObject({ code: 'stale' })
    expect((await ask(later, { requested: true })).status).toBe(200)
  })

  it('keeps accounts apart', async () => {
    const a = await session()
    const b = await session()
    await ask(a, { requested: true })
    expect(await status(b)).toMatchObject({ requestedAt: null })
    await ask(b, { requested: false })
    expect(await status(a)).toMatchObject({ requestedAt: START })
  })

  it('lapses 30 days after it was last asked for', async () => {
    let s = await session()
    await ask(s, { requested: true })
    advance(20 * DAY)
    s = await openTestSession(app as never, h.env, s.key, CURRENT_APP)
    expect((await ask(s, { requested: true })).body).toEqual({ ok: true, requestedAt: START })
    advance(30 * DAY - 1)
    // The token expired meanwhile; the same account signs in again.
    s = await openTestSession(app as never, h.env, s.key, CURRENT_APP)
    expect(await status(s)).toMatchObject({ requestedAt: START })
    advance(1)
    expect(await status(s)).toMatchObject({ requestedAt: null })
    // A lapsed request isn't "standing": asking again starts a new one.
    expect((await ask(s, { requested: true })).body).toEqual({
      ok: true,
      requestedAt: START + 50 * DAY,
    })
  })

  it('clears itself once every live phone session has written a slot since', async () => {
    const web = await session()
    const phone = await openTestSession(app as never, h.env, web.key, CURRENT_APP)
    const tablet = await openTestSession(app as never, h.env, web.key, CURRENT_APP)
    const gone = await openTestSession(app as never, h.env, web.key, CURRENT_APP)
    // A slot written before the request doesn't count.
    await put(tablet, 'tablet-slot')
    advance(SECOND)
    await ask(web, { requested: true })
    advance(SECOND)
    await put(phone, 'phone-slot')
    // The web's own session is a phone session here too (dev); it writes a slot.
    await put(web, 'web-slot')
    expect(await status(web)).toMatchObject({ requestedAt: START + SECOND })
    // An ended session doesn't hold it up.
    await requestJson(app as never, h.env, 'DELETE', '/sessions/current', undefined, bearer(gone.accessToken))
    expect(await status(web)).toMatchObject({ requestedAt: START + SECOND })
    advance(2 * SECOND)
    await put(tablet, 'tablet-slot')
    expect(await status(web)).toMatchObject({ requestedAt: null })
  })

  it('keeps standing when the sessions can’t be read', async () => {
    const s = await session()
    await ask(s, { requested: true })
    advance(SECOND)
    await put(s, slot())
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const sessions = await import('./sessionStore')
    vi.spyOn(sessions, 'listLiveSessions').mockRejectedValueOnce(new Error('d1 down'))
    expect(await status(s)).toMatchObject({ requestedAt: START })
    expect(await status(s)).toMatchObject({ requestedAt: null })
  })

  it('needs Cloud Sync on and an entitled account to set, never to withdraw', async () => {
    const s = await session()
    await ask(s, { requested: true })
    await h.kv.put('sync:enabled', 'false')
    const off = await ask(s, { requested: true })
    expect(off.status).toBe(503)
    expect(off.body).toMatchObject({ code: 'disabled' })
    expect(off.headers.get('retry-after')).toBe('60')
    // The status still says what stands.
    expect(await status(s)).toMatchObject({ enabled: false, requestedAt: START })
    expect((await ask(s, { requested: false })).body).toEqual({ ok: true, requestedAt: null })

    await h.kv.put('sync:enabled', 'on')
    await h.kv.put('sync:entitlement', 'supporter')
    supporterStatus.mockResolvedValue({ supporter: false, expiresAt: null, customers: 0 })
    resetSyncEntitlementCache()
    const unentitled = await ask(s, { requested: true })
    expect(unentitled.status).toBe(403)
    expect(unentitled.body).toMatchObject({ code: 'supporter_required' })
    expect((await ask(s, { requested: false })).status).toBe(200)
    expect(await status(s)).toMatchObject({ requestedAt: null })
  })

  it('works on an account whose index predates it', async () => {
    const s = await session()
    await put(s, slot())
    h.syncIndexes.storage(s.accountId).query('DROP TABLE sync_request')
    h.syncIndexes.restart(s.accountId)
    expect(await status(s)).toMatchObject({ requestedAt: null })
    expect((await ask(s, { requested: true })).body).toEqual({ ok: true, requestedAt: START })
  })

  it('still answers the status when the request can’t be read', async () => {
    const s = await session()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(AccountSync.prototype, 'requestedAt').mockRejectedValueOnce(new Error('do down'))
    expect(await status(s)).toMatchObject({ ok: true, entitled: true, requestedAt: null })
  })

  it('refuses malformed bodies and requests without a token', async () => {
    const s = await session()
    for (const body of [{}, { requested: 'yes' }, { requested: 1 }, { requested: null }, []])
      expect((await ask(s, body)).body, JSON.stringify(body)).toMatchObject({ code: 'bad_request' })
    const anonymous = await postJson(app as never, h.env, '/sync/request', {
      requested: true,
      ...(await accountEnvelope('sync/request', s.key)),
    })
    expect(anonymous.status).toBe(401)
    expect(await status(s)).toMatchObject({ requestedAt: null })
  })

  it('counts in the read edge tier', async () => {
    const s = await session()
    vi.spyOn(h.env.BUDDIES_READ_LIMITER, 'limit').mockResolvedValueOnce({ success: false })
    const limited = await ask(s, { requested: true })
    expect(limited.status).toBe(429)
    expect(limited.body).toMatchObject({ code: 'rate_limited' })
  })
})

describe('privacy', () => {
  it('never logs slot ids, account ids, or tokens', async () => {
    const logs: unknown[] = []
    for (const level of ['log', 'warn', 'error', 'info'] as const)
      vi.spyOn(console, level).mockImplementation((...args) => logs.push(args))
    const s = await session()
    const phone = slot()
    await put(s, phone)
    advance(1_000)
    await put(s, phone)
    await list(s)
    await get(s, phone)
    await del(s, { slotId: phone })
    await postJson(app as never, h.env, '/sync/request', { requested: true, ...(await accountEnvelope('sync/request', s.key)) }, bearer(s.accessToken))
    await postJson(app as never, h.env, '/sync/request', { requested: false }, bearer(s.accessToken))
    const text = JSON.stringify(logs)
    for (const secret of [phone, s.accountId, s.accessToken])
      expect(text).not.toContain(secret)
  })
})

/**
 * The browser's live socket (witness-work ADR 0038 §10): browsers can't set
 * headers on a WebSocket, so they mint a ticket naming the slot and offer it
 * in `Sec-WebSocket-Protocol`, next to `ww.v1`, from an allowed origin. The
 * access token never goes in that header: Cloudflare's logs record it.
 */
describe('browser live socket', () => {
  const MINUTE = 60 * SECOND

  const ticket = (s: TestSession, slotId: string, socket: 'sync' | 'buddies' = 'sync') =>
    liveTicket(app as never, h.env, s, socket, slotId)

  const offer = async (s: TestSession, slotId: string) => [
    'ww.v1',
    `ticket.${await ticket(s, slotId)}`,
  ]

  const browserLive = async (
    protocols: string[] | string | null,
    headers: Record<string, string> = {}
  ) => {
    const response = (await request('/sync/live', {
      method: 'GET',
      headers: {
        upgrade: 'websocket',
        origin: TEST_WEB_ORIGIN,
        ...(protocols == null
          ? {}
          : {
              'sec-websocket-protocol': Array.isArray(protocols)
                ? protocols.join(', ')
                : protocols,
            }),
        ...headers,
      },
    })) as Response & { webSocket?: FakeWebSocket | null }
    const upgraded = response.status === 101
    return {
      status: response.status,
      protocol: response.headers.get('sec-websocket-protocol'),
      authenticate: response.headers.get('www-authenticate'),
      code: upgraded ? null : code(await response.json()),
      socket: upgraded ? response.webSocket! : null,
    }
  }

  /** The requests `AccountSync` got through `fetch`. */
  const forwarded = () => {
    const seen: Request[] = []
    const original = AccountSync.prototype.fetch
    vi.spyOn(AccountSync.prototype, 'fetch').mockImplementation(function (
      this: AccountSync,
      request: Request
    ) {
      seen.push(request)
      return original.call(this, request)
    })
    return seen
  }

  it('mints a 30-second ticket for the slot', async () => {
    const s = await session()
    const response = await postJson(
      app as never,
      h.env,
      '/live/ticket',
      { socket: 'sync', id: slot() },
      bearer(s.accessToken)
    )
    expect(response.status).toBe(200)
    const body = response.body as { ok: boolean; ticket: string; expiresAt: number }
    expect(body).toMatchObject({ ok: true, expiresAt: START + 30 * SECOND })
    expect(body.ticket).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/)
    expect(body.ticket).not.toContain(s.accessToken)
    // Sealed: no id in it, in any form.
    for (const id of [s.accountId, s.sessionId])
      expect(body.ticket).not.toContain(id)
  })

  it('opens with ww.v1 echoed, says hello, and honors the slot', async () => {
    const s = await session()
    const phone = slot()
    const tablet = slot()
    const live = await browserLive(await offer(s, phone))
    expect(live.status).toBe(101)
    expect(live.protocol).toBe('ww.v1')
    expect(live.socket!.messages()).toEqual([{ type: 'hello', seq: 0 }])

    await put(s, phone)
    // Its own slot's put doesn't echo back.
    expect(live.socket!.messages()).toEqual([{ type: 'hello', seq: 0 }])
    await put(s, tablet)
    expect(live.socket!.messages().at(-1)).toEqual({ type: 'changed', seq: 2 })
    live.socket!.send('ping')
    expect(live.socket!.received.at(-1)).toBe('pong')
  })

  it('takes the entries in any order, with or without spaces', async () => {
    const s = await session()
    const live = await browserLive(`ticket.${await ticket(s, slot())} ,  ww.v1`)
    expect(live.status).toBe(101)
    expect(live.protocol).toBe('ww.v1')
  })

  it('never forwards the ticket or the offer to the DO', async () => {
    const seen = forwarded()
    const s = await session()
    const phone = slot()
    const minted = await ticket(s, phone)
    expect((await browserLive(['ww.v1', `ticket.${minted}`])).status).toBe(101)
    expect(seen).toHaveLength(1)
    const headers = Object.fromEntries(seen[0].headers.entries())
    expect(headers['sec-websocket-protocol']).toBeUndefined()
    expect(headers.authorization).toBeUndefined()
    expect(JSON.stringify(headers)).not.toContain(minted)
    // Who the socket is for goes to the DO in a call (`admitLive`), never
    // in a header: Workers Logs record the forwarded request's headers. The
    // upgrade carries only the one-use id that call answered with.
    expect(headers['x-ww-sync-admission']).toMatch(/^[0-9a-f-]{36}$/)
    for (const id of [s.accountId, s.sessionId, phone])
      expect(JSON.stringify(headers)).not.toContain(id)
    expect(headers['x-ww-sync-account']).toBeUndefined()
    expect(headers['x-ww-sync-expires-at']).toBeUndefined()
    expect(headers['x-ww-live-ticket']).toBeUndefined()
    expect(seen[0].url).not.toContain(phone)
  })

  it('takes the slot from the ticket, never a header', async () => {
    const s = await session()
    const phone = slot()
    const claimed = slot()
    const live = await browserLive(await offer(s, phone), { 'x-ww-slot-id': claimed })
    expect(live.status).toBe(101)
    // The socket is the ticket's slot's: its puts don't echo, the header's do.
    expect((await put(s, phone)).status).toBe(200)
    expect(live.socket!.messages()).toEqual([{ type: 'hello', seq: 0 }])
    expect((await put(s, claimed)).status).toBe(200)
    expect(live.socket!.messages().at(-1)).toEqual({ type: 'changed', seq: 2 })
  })

  it('needs ww.v1 in the offer, and echoes it', async () => {
    const s = await session()
    const [, entry] = await offer(s, slot())
    expect(await browserLive([entry])).toMatchObject({
      status: 400,
      code: 'bad_request',
      protocol: null,
    })
    expect((await browserLive(['ww.v1', entry])).protocol).toBe('ww.v1')
  })

  it('refuses the access token in place of a ticket', async () => {
    const s = await session()
    // The old `bearer.` entry is gone: an unknown entry.
    expect(await browserLive(['ww.v1', `bearer.${s.accessToken}`])).toMatchObject({
      status: 400,
      code: 'bad_request',
    })
    expect(await browserLive(['ww.v1', `ticket.${s.accessToken}`])).toMatchObject({
      status: 401,
      code: 'unauthorized',
    })
  })

  it('refuses a missing, forged, expired, or Buddies ticket with 401', async () => {
    const s = await session()
    const minted = await ticket(s, slot())
    const [claims, mac] = minted.split('.')
    const flipped = `${claims}.${mac[0] === 'A' ? 'B' : 'A'}${mac.slice(1)}`
    for (const protocols of [
      ['ww.v1'],
      ['ww.v1', 'ticket.nope'],
      ['ww.v1', `ticket.${flipped}`],
      ['ww.v1', `ticket.${minted}x`],
      // A Buddies ticket for a slot-shaped id.
      ['ww.v1', `ticket.${await ticket(s, randomId(), 'buddies')}`],
    ]) {
      const live = await browserLive(protocols)
      expect(live, protocols.join(', ').slice(0, 60)).toMatchObject({
        status: 401,
        code: 'unauthorized',
      })
      expect(live.authenticate).toContain('Bearer')
    }
  })

  it('refuses a ticket 30 seconds after minting', async () => {
    const s = await session()
    const first = await offer(s, slot())
    const second = await offer(s, slot())
    advance(29 * SECOND)
    expect((await browserLive(first)).status).toBe(101)
    advance(2 * SECOND)
    expect(await browserLive(second)).toMatchObject({ status: 401, code: 'unauthorized' })
  })

  it('opens one socket per ticket: a copy is 409 while it is open', async () => {
    const s = await session()
    const entries = await offer(s, slot())
    const first = await browserLive(entries)
    expect(first.status).toBe(101)
    // Another ticket of the same session opens beside it.
    const second = await browserLive(await offer(s, slot()))
    expect(second.status).toBe(101)
    // A replayed copy pushes no socket off: it never opens.
    for (let i = 0; i < 25; i++)
      expect(await browserLive(entries)).toMatchObject({ status: 409, code: 'conflict' })
    expect(first.socket!.closedBy).toBeNull()
    expect(second.socket!.closedBy).toBeNull()
    // Once the first closes, the same ticket reopens within its 30 seconds.
    first.socket!.close(1000, '')
    expect((await browserLive(entries)).status).toBe(101)
  })

  it('takes a client’s ticket header on neither path', async () => {
    const seen = forwarded()
    const admitted = vi.spyOn(AccountSync.prototype, 'admitLive')
    const s = await session()
    const first = await browserLive(await offer(s, slot()))
    // The ticket's hash, which can't open anything, so one ticket opens one socket.
    const hash = admitted.mock.calls[0][0].ticket!
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(first.status).toBe(101)
    // A header-path socket naming the open ticket opens, without it.
    const native = await live(s, slot(), { 'x-ww-live-ticket': hash })
    expect(native.status).toBe(101)
    expect(admitted.mock.calls[1][0].ticket).toBeNull()
    expect(seen[1].headers.get('x-ww-live-ticket')).toBeNull()
    // A browser one gets its own ticket's hash, never the client's.
    const other = await browserLive(await offer(s, slot()), { 'x-ww-live-ticket': hash })
    expect(other.status).toBe(101)
    expect(admitted.mock.calls[2][0].ticket).not.toBe(hash)
    expect(seen[2].headers.get('x-ww-live-ticket')).toBeNull()
  })

  it('mints only for a live session; a ticket minted before still opens', async () => {
    const s = await session()
    const entries = await offer(s, slot())
    const closed = await requestJson(
      app as never,
      h.env,
      'DELETE',
      '/sessions/current',
      undefined,
      bearer(s.accessToken)
    )
    expect(closed.status).toBe(200)
    expect(
      await postJson(app as never, h.env, '/live/ticket', { socket: 'sync', id: slot() }, bearer(s.accessToken))
    ).toMatchObject({ status: 401, body: { code: 'unauthorized' } })
    // The upgrade checks no session, as the header path doesn't: the ticket
    // lives 30 seconds, and the socket closes when the token expires.
    expect((await browserLive(entries)).status).toBe(101)
    expect((await live(s, slot())).status).toBe(101)

    // Revoked from another device: the same.
    const phone = await session()
    const lost = await openTestSession(app as never, h.env, phone.key)
    expect(
      (await postJson(app as never, h.env, '/sessions/revoke', { sessionId: lost.sessionId }, bearer(phone.accessToken))).status
    ).toBe(200)
    expect(
      await postJson(app as never, h.env, '/live/ticket', { socket: 'buddies', id: randomId() }, bearer(lost.accessToken))
    ).toMatchObject({ status: 401, body: { code: 'unauthorized' } })
  })

  it('mints nothing for a token within a second of expiring', async () => {
    const s = await session()
    const mint = () =>
      postJson(app as never, h.env, '/live/ticket', { socket: 'sync', id: slot() }, bearer(s.accessToken))
    advance(s.accessExpiresAt - Date.now() - 1_500)
    expect(await mint()).toMatchObject({
      status: 200,
      body: { expiresAt: s.accessExpiresAt },
    })
    advance(600)
    expect(await mint()).toMatchObject({ status: 401, body: { code: 'unauthorized' } })
  })

  it('mints only for a bearer caller and a well-formed request', async () => {
    const s = await session()
    const mint = (body: unknown, headers = bearer(s.accessToken)) =>
      postJson(app as never, h.env, '/live/ticket', body, headers)
    expect(await mint({ socket: 'sync', id: slot() }, {})).toMatchObject({
      status: 401,
      body: { code: 'unauthorized' },
    })
    advance(16 * MINUTE)
    expect(await mint({ socket: 'sync', id: slot() })).toMatchObject({ status: 401 })
    const later = await session()
    for (const body of [
      null,
      [],
      {},
      { socket: 'sync' },
      { socket: 'chat', id: slot() },
      { socket: 'sync', id: 'bad slot' },
      { socket: 'sync', id: 'x' },
      { socket: 'buddies', id: 'short' },
      { socket: 'sync', id: 42 },
    ]) {
      expect(await mint(body, bearer(later.accessToken)), JSON.stringify(body)).toMatchObject({
        status: 400,
        body: { code: 'bad_request' },
      })
    }
  })

  it('answers disabled without a ticket secret, on the route and the socket', async () => {
    const s = await session()
    const entries = await offer(s, slot())
    delete h.env.LIVE_TICKET_SECRET
    expect(
      await postJson(app as never, h.env, '/live/ticket', { socket: 'sync', id: slot() }, bearer(s.accessToken))
    ).toMatchObject({ status: 503, body: { code: 'disabled' } })
    expect(await browserLive(entries)).toMatchObject({ status: 503, code: 'disabled' })
    // Native sockets don't need it.
    expect((await live(s, slot())).status).toBe(101)
  })

  it('needs an allowed Origin, before the ticket or the DO', async () => {
    const seen = forwarded()
    const s = await session()
    for (const origin of ['https://evil.example', 'null', `${TEST_WEB_ORIGIN}/`]) {
      expect(
        await browserLive(await offer(s, slot()), { origin })
      ).toMatchObject({ status: 403, code: 'forbidden' })
      // A bad ticket from a bad origin is still the origin's refusal.
      expect(
        await browserLive(['ww.v1', 'ticket.nope'], { origin })
      ).toMatchObject({ status: 403, code: 'forbidden' })
      // So is a malformed offer: a foreign page learns nothing of its shape.
      expect(
        await browserLive(['ticket.nope', 'bad entry'], { origin })
      ).toMatchObject({ status: 403, code: 'forbidden' })
    }
    const response = (await request('/sync/live', {
      method: 'GET',
      headers: {
        upgrade: 'websocket',
        'sec-websocket-protocol': (await offer(s, slot())).join(', '),
      },
    })) as Response
    expect(response.status).toBe(403)
    expect(seen).toHaveLength(0)
  })

  it('refuses malformed offers with bad_request', async () => {
    const s = await session()
    const [ww, entry] = await offer(s, slot())
    for (const protocols of [
      [ww, ww, entry],
      [ww, entry, entry],
      [ww, entry, `ticket.${await ticket(s, slot())}`],
      [ww, '', entry],
      [ww, entry, 'chat'],
      [ww, entry, 'ww.v2'],
      [ww, 'ticket.'],
      [ww, 'ticket'],
      [ww, entry, `slot.${slot()}`],
      [ww, entry, `payload.${'A'.repeat(16)}`],
      [ww, entry, 'ticket.a/b'],
      [ww, `ticket.${'A'.repeat(5_000)}`],
    ]) {
      const live = await browserLive(protocols)
      expect(live, protocols.join(', ').slice(0, 80)).toMatchObject({
        status: 400,
        code: 'bad_request',
      })
    }
    expect(
      await browserLive([ww, entry], { authorization: `Bearer ${s.accessToken}` })
    ).toMatchObject({ status: 400, code: 'bad_request' })
  })

  it('runs the switch and entitlement checks the header path runs', async () => {
    const s = await session()
    await h.kv.put('sync:enabled', 'false')
    expect(await browserLive(await offer(s, slot()))).toMatchObject({
      status: 503,
      code: 'disabled',
    })
    await h.kv.delete('sync:enabled')
    await h.kv.put('sync:entitlement', 'supporter')
    supporterStatus.mockResolvedValue({ supporter: false, expiresAt: null, customers: 1 })
    resetSyncEntitlementCache()
    expect(await browserLive(await offer(s, slot()))).toMatchObject({
      status: 403,
      code: 'supporter_required',
    })
    const plain = await request('/sync/live', {
      method: 'GET',
      headers: {
        origin: TEST_WEB_ORIGIN,
        'sec-websocket-protocol': (await offer(s, slot())).join(', '),
      },
    })
    expect(plain.status).toBe(403)
  })

  it('needs an upgrade like the header path', async () => {
    const s = await session()
    const plain = await request('/sync/live', {
      method: 'GET',
      headers: {
        origin: TEST_WEB_ORIGIN,
        'sec-websocket-protocol': (await offer(s, slot())).join(', '),
      },
    })
    expect(plain.status).toBe(426)
  })

  it('leaves header-path sockets as they were: no subprotocol, no expiry', async () => {
    const seen = forwarded()
    const s = await session()
    const response = (await request('/sync/live', {
      method: 'GET',
      headers: {
        ...bearer(s.accessToken),
        upgrade: 'websocket',
        'x-ww-slot-id': slot(),
        // A client can't set the expiry the Worker hands the DO.
        'x-ww-sync-expires-at': String(Date.now() + MINUTE),
      },
    })) as Response & { webSocket?: FakeWebSocket | null }
    expect(response.status).toBe(101)
    expect(response.headers.get('sec-websocket-protocol')).toBeNull()
    expect(seen[0].headers.get('x-ww-sync-expires-at')).toBeNull()
    advance(20 * MINUTE)
    expect(h.syncIndexes.storage(s.accountId).alarm()).toBeNull()
    expect(response.webSocket!.closedBy).toBeNull()
  })

  it('closes with 4004 expired once the token expires; header sockets stay', async () => {
    const s = await session()
    const browser = await browserLive(await offer(s, slot()))
    const native = await live(s, slot())
    const storage = h.syncIndexes.storage(s.accountId)
    expect(storage.alarm()).toBe(s.accessExpiresAt)

    advance(s.accessExpiresAt - Date.now())
    await h.syncIndexes.fireAlarm(s.accountId)
    expect(browser.socket!.closedBy).toEqual({ code: 4004, reason: 'expired' })
    expect(native.socket!.closedBy).toBeNull()
    expect(storage.alarm()).toBeNull()
  })

  it('schedules the earliest expiry, and the next one after it', async () => {
    const first = await session()
    const firstSocket = await browserLive(await offer(first, slot()))
    advance(5 * MINUTE)
    // A second session of the same account: refresh-style, a later token.
    const later = await openTestSession(app as never, h.env, first.key, CURRENT_APP)
    expect(later.accountId).toBe(first.accountId)
    const laterSocket = await browserLive(await offer(later, slot()))
    const storage = h.syncIndexes.storage(first.accountId)
    expect(storage.alarm()).toBe(first.accessExpiresAt)

    advance(first.accessExpiresAt - Date.now())
    await h.syncIndexes.fireAlarm(first.accountId)
    expect(firstSocket.socket!.closedBy).toEqual({ code: 4004, reason: 'expired' })
    expect(laterSocket.socket!.closedBy).toBeNull()
    expect(storage.alarm()).toBe(later.accessExpiresAt)

    advance(later.accessExpiresAt - Date.now())
    await h.syncIndexes.fireAlarm(first.accountId)
    expect(laterSocket.socket!.closedBy).toEqual({ code: 4004, reason: 'expired' })
  })

  it('keeps the daily retention alarm: an expiry runs no retention early', async () => {
    const s = await session()
    await put(s, slot())
    const storage = h.syncIndexes.storage(s.accountId)
    expect(storage.alarm()).toBe(START + DAY)
    const listed = vi.spyOn(h.syncBlobs, 'list')

    const browser = await browserLive(await offer(s, slot()))
    expect(storage.alarm()).toBe(s.accessExpiresAt)
    advance(s.accessExpiresAt - Date.now())
    await h.syncIndexes.fireAlarm(s.accountId)
    expect(browser.socket!.closedBy).toEqual({ code: 4004, reason: 'expired' })
    expect(listed).not.toHaveBeenCalled()
    // Back to retention, at the time it had.
    expect(storage.alarm()).toBe(START + DAY)

    advance(START + DAY - Date.now())
    await h.syncIndexes.fireAlarm(s.accountId)
    expect(listed).toHaveBeenCalled()
    expect(storage.alarm()).toBe(START + 2 * DAY)
  })

  it('runs retention when it comes first, then closes at the expiry', async () => {
    const s = await session()
    await put(s, slot())
    const storage = h.syncIndexes.storage(s.accountId)
    advance(DAY - 5 * MINUTE)
    const later = await openTestSession(app as never, h.env, s.key, CURRENT_APP)
    const browser = await browserLive(await offer(later, slot()))
    // Retention (START + DAY) is sooner than the token's expiry.
    expect(storage.alarm()).toBe(START + DAY)
    const listed = vi.spyOn(h.syncBlobs, 'list')

    advance(5 * MINUTE)
    await h.syncIndexes.fireAlarm(s.accountId)
    expect(listed).toHaveBeenCalledTimes(1)
    expect(browser.socket!.closedBy).toBeNull()
    expect(storage.alarm()).toBe(later.accessExpiresAt)

    advance(later.accessExpiresAt - Date.now())
    await h.syncIndexes.fireAlarm(s.accountId)
    expect(browser.socket!.closedBy).toEqual({ code: 4004, reason: 'expired' })
    expect(listed).toHaveBeenCalledTimes(1)
    expect(storage.alarm()).toBe(START + 2 * DAY)
  })

  it('treats an alarm from before expiries as retention', async () => {
    const s = await session()
    await put(s, slot())
    const storage = h.syncIndexes.storage(s.accountId)
    // As an object from before this change: an alarm, no schedule row.
    storage.query('DROP TABLE IF EXISTS alarm_schedule')
    h.syncIndexes.restart(s.accountId)
    const listed = vi.spyOn(h.syncBlobs, 'list')
    const later = await openTestSession(app as never, h.env, s.key, CURRENT_APP)
    const browser = await browserLive(await offer(later, slot()))
    expect(storage.alarm()).toBe(later.accessExpiresAt)

    advance(later.accessExpiresAt - Date.now())
    await h.syncIndexes.fireAlarm(s.accountId)
    expect(browser.socket!.closedBy).toEqual({ code: 4004, reason: 'expired' })
    // The old alarm was retention's, kept for its time.
    expect(listed).not.toHaveBeenCalled()
    expect(storage.alarm()).toBe(START + DAY)
    advance(START + DAY - Date.now())
    await h.syncIndexes.fireAlarm(s.accountId)
    expect(listed).toHaveBeenCalled()
  })

  it('counts browser sockets in the 20-socket cap', async () => {
    const s = await session()
    const sockets: FakeWebSocket[] = []
    for (let i = 0; i < SYNC_LIMITS.liveSockets; i++) {
      sockets.push((await live(s, slot())).socket!)
      advance(1)
    }
    const browser = await browserLive(await offer(s, slot()))
    expect(browser.status).toBe(101)
    expect(sockets[0].closedBy).toEqual({ code: 4000, reason: 'replaced' })
    advance(1)
    // The 19 native sockets older than it go first, then it.
    for (let i = 0; i < SYNC_LIMITS.liveSockets - 1; i++) {
      await live(s, slot())
      advance(1)
    }
    expect(browser.socket!.closedBy).toBeNull()
    await live(s, slot())
    expect(browser.socket!.closedBy).toEqual({ code: 4000, reason: 'replaced' })
  })

  it('never logs the token or the slot', async () => {
    const logs: unknown[] = []
    for (const level of ['log', 'warn', 'error', 'info'] as const)
      vi.spyOn(console, level).mockImplementation((...args) => logs.push(args))
    const s = await session()
    const phone = slot()
    const entries = await offer(s, phone)
    await browserLive(entries)
    await browserLive(entries, { origin: 'https://evil.example' })
    advance(s.accessExpiresAt - Date.now())
    await h.syncIndexes.fireAlarm(s.accountId)
    const text = JSON.stringify(logs)
    for (const secret of [phone, s.accountId, s.accessToken, entries[1].slice(7)])
      expect(text).not.toContain(secret)
  })
})

/** Every gated route refuses a session that didn't send `sync-everyone` (ADR 0040 §2). */
describe('sessions without sync-everyone', () => {
  const refusedEverywhere = async (s: TestSession) => {
    const refusals = {
      put: (await put(s, slot())).body,
      list: (await list(s)).body,
      get: (await get(s, slot())).body,
      request: (
        await postJson(
          app as never,
          h.env,
          '/sync/request',
          { requested: true, ...(await accountEnvelope('sync/request', s.key)) },
          bearer(s.accessToken)
        )
      ).body,
      live: await (async () => {
        const response = await request('/sync/live', {
          method: 'GET',
          headers: { ...bearer(s.accessToken), upgrade: 'websocket', 'x-ww-slot-id': slot() },
        })
        return response.json()
      })(),
      browserLive: await (async () => {
        const ticket = await liveTicket(app as never, h.env, s, 'sync', slot())
        const response = await request('/sync/live', {
          method: 'GET',
          headers: {
            upgrade: 'websocket',
            origin: TEST_WEB_ORIGIN,
            'sec-websocket-protocol': `ww.v1, ticket.${ticket}`,
          },
        })
        return response.json()
      })(),
    }
    for (const [route, body] of Object.entries(refusals))
      expect([route, code(body)]).toEqual([route, 'supporter_required'])
  }

  beforeEach(() => {
    supporterStatus.mockResolvedValue({ supporter: false, expiresAt: null, customers: 0 })
  })

  it('refuses put, list, get, the request, and both live sockets', async () => {
    await refusedEverywhere(await openTestSession(app as never, h.env))
    await refusedEverywhere(
      await openTestSession(app as never, h.env, undefined, { capabilities: ['sync-later'] })
    )
    await refusedEverywhere(await openTestSession(app as never, h.env, undefined, { capabilities: [] }))
  })

  it('refuses when the session’s capabilities can’t be read', async () => {
    // A token from before tokens carried them (`cap`): the session is read.
    const opened = await session()
    const keys = (await accessTokenKeys(h.env as never))!
    const { accessToken } = await signAccessToken(keys, {
      accountId: opened.accountId,
      sessionId: opened.sessionId,
      platform: 'dev',
    })
    const s = { ...opened, accessToken }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const sessions = await import('./sessionStore')
    vi.spyOn(sessions, 'cachedSessionCapabilities').mockRejectedValue(new Error('d1 down'))
    const refused = await put(s, slot())
    expect(refused.status).toBe(403)
    expect(refused.body).toMatchObject({ code: 'supporter_required' })
    vi.mocked(sessions.cachedSessionCapabilities).mockRestore()
    expect((await put(s, slot())).status).toBe(200)
  })

  it('refuses a malformed list on open', async () => {
    for (const capabilities of ['sync-everyone', [1], ['__proto__'], ['a'.repeat(33)], Array(17).fill('a')]) {
      await expect(
        openTestSession(app as never, h.env, undefined, { capabilities })
      ).rejects.toThrow()
    }
  })
})
