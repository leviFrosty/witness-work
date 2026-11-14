import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHarness, randomBytes, sha256B64u, type Harness } from '../test/buddies'
import { bearer, openTestSession, postJson, requestJson, type TestSession } from '../test/accounts'
import type { FakeWebSocket } from '../test/durableObjects'
import { createAccountsRoutes } from './route'
import { resetSyncEntitlementCache } from './sync'
import { resetSessionCapabilitiesCache } from './sessionStore'
import { photoPutReservationMs, SYNC_LIMITS, SYNC_PHOTO_LIMITS } from './syncContracts'
import { accountSupporterStatus } from './supporter'

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
 * Cloud Sync photos (witness-work ADR 0040 §6, `docs/cloud-sync-photos.md`):
 * immutable, end-to-end encrypted blobs per account in `ACCOUNT_PHOTOS`, their
 * rows and usage in the account's `AccountSync`, the storage limit, the
 * rates, the purge of deleted photos, and the switches.
 */

/** A session from an app that says it turns Cloud Sync on only for new installs. */
const CURRENT_APP = { appVersion: '1.47.0', capabilities: ['sync-everyone'] }
const START = Date.UTC(2026, 9, 19, 12)
const SECOND = 1_000
const MINUTE = 60 * SECOND
const DAY = 24 * 60 * MINUTE
const LIMIT = 2_000_000_000
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
    supporter: false,
    expiresAt: null,
    customers: 0,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)
/**
 * Runs the daily retention now, as its alarm does once it's due. The alarm
 * also serves browser sockets' expiry, so firing it early alone runs nothing.
 */
const runRetention = async (accountId: string) => {
  h.syncIndexes.storage(accountId).query('UPDATE alarm_schedule SET retention_at = ?', Date.now())
  await h.syncIndexes.fireAlarm(accountId)
}
const PHONE = 'phone-slot-1'
const name = async () => sha256B64u(randomBytes(16))
const meta = () => Buffer.from(randomBytes(90)).toString('base64url')
/** The keys of `photo`'s objects (one per put that stored, until purged). */
const keysOf = (s: TestSession, photo: string) =>
  [...h.photoBlobs.objects.keys()].filter((k) => k.startsWith(`v1/${s.accountId}/${photo}/`))
const bytesOf = (s: TestSession, photo: string) => keysOf(s, photo).map((k) => h.photoBlobs.objects.get(k)!.bytes)
const code = (body: unknown) => (body as { code?: string }).code

const request = (path: string, init: RequestInit) =>
  (app as { request: typeof fetch }).request(path, { duplex: 'half', ...init } as RequestInit, h.env as never)

const put = async (
  s: TestSession,
  photo: string,
  bytes: Uint8Array = randomBytes(1_000),
  headers: Record<string, string> = {}
) => {
  const response = await request('/sync/photos/put', {
    method: 'POST',
    headers: {
      ...bearer(s.accessToken),
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.byteLength),
      'x-ww-photo-name': photo,
      'x-ww-sha256': await sha256B64u(bytes),
      'x-ww-photo-meta': meta(),
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

const list = (s: TestSession, body: Record<string, unknown> = {}) =>
  postJson(app as never, h.env, '/sync/photos/list', body, bearer(s.accessToken))

const del = (s: TestSession, body: unknown) =>
  postJson(app as never, h.env, '/sync/photos/delete', body, bearer(s.accessToken))

const usage = async (s: TestSession) =>
  (await requestJson(app as never, h.env, 'GET', '/sync/photos/usage', undefined, bearer(s.accessToken))).body.usage

const status = async (s: TestSession) =>
  (await requestJson(app as never, h.env, 'GET', '/sync', undefined, bearer(s.accessToken))).body

const get = async (s: TestSession, photo: string) => {
  const response = await request('/sync/photos/get', {
    method: 'POST',
    headers: { ...bearer(s.accessToken), 'content-type': 'application/json' },
    body: JSON.stringify({ name: photo }),
  })
  return {
    status: response.status,
    headers: response.headers,
    bytes: response.status === 200 ? new Uint8Array(await response.arrayBuffer()) : null,
    body: response.status === 200 ? null : await response.json(),
  }
}

/** A session of an account with a slot: photos are only for Cloud Sync's devices. */
const session = async (key?: TestSession['key']) => {
  const s = await openTestSession(app as never, h.env, key, CURRENT_APP)
  if (!key) expect((await slotPut(s, PHONE)).status).toBe(200)
  return s
}
const bareSession = () => openTestSession(app as never, h.env, undefined, CURRENT_APP)

const live = async (s: TestSession, slotId: string) => {
  const response = (await request('/sync/live', {
    method: 'GET',
    headers: {
      ...bearer(s.accessToken),
      upgrade: 'websocket',
      'x-ww-slot-id': slotId,
    },
  })) as Response & { webSocket?: FakeWebSocket | null }
  return response.webSocket!
}

/** A body stream that says whether it was read to the end. */
const trackedBody = (bytes: Uint8Array) => {
  let finished = false
  let offset = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        finished = true
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + 100))
      offset += 100
    },
  })
  return { stream, finished: () => finished }
}

async function slotPut(s: TestSession, slotId: string) {
  const bytes = randomBytes(100)
  return request('/sync/put', {
    method: 'POST',
    headers: {
      ...bearer(s.accessToken),
      'content-length': String(bytes.byteLength),
      'x-ww-slot-id': slotId,
      'x-ww-sha256': await sha256B64u(bytes),
    },
    body: bytes,
  })
}

const slotDelete = (s: TestSession, body: Record<string, unknown>) =>
  postJson(app as never, h.env, '/sync/delete', body, bearer(s.accessToken))

const slotList = (s: TestSession) => postJson(app as never, h.env, '/sync/list', {}, bearer(s.accessToken))

/** Usage must always equal the live rows' sum. */
const expectExactUsage = (s: TestSession) => {
  const [row] = h.syncIndexes
    .storage(s.accountId)
    .query('SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS count FROM photo WHERE deleted_at IS NULL')
  return expect(h.syncIndexes.storage(s.accountId).query('SELECT bytes, count FROM photo_state')[0]).toEqual(row)
}

/** Holds the next `ACCOUNT_PHOTOS` put until `release()`. */
const holdNextR2Put = () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const original = h.photoBlobs.put.bind(h.photoBlobs)
  vi.spyOn(h.photoBlobs, 'put').mockImplementationOnce(async (...args) => {
    await gate
    return original(...args)
  })
  return { release }
}

/** Seeds live photos straight through the index (no edge tier, no R2). */
const seed = async (s: TestSession, count: number, size = 10) => {
  const index = h.syncIndexes.object(s.accountId)
  const names: string[] = []
  for (let i = 0; i < count; i++) {
    const photo = await name()
    const begun = await index.beginPhotoPut({
      accountId: s.accountId,
      name: photo,
      size,
      sha256: await name(),
      meta: 'bWV0YQ',
    })
    if (!begun.ok || !('reservation' in begun.value)) throw new Error('seed')
    await index.commitPhotoPut({
      accountId: s.accountId,
      name: photo,
      reservation: begun.value.reservation,
    })
    names.push(photo)
  }
  return names.sort()
}

describe('put, list, get, delete, usage', () => {
  it('stores a photo once and serves it until it is deleted', async () => {
    const s = await session()
    const photo = await name()
    const bytes = randomBytes(5_000)
    const sha256 = await sha256B64u(bytes)
    const sealed = meta()

    const stored = await put(s, photo, bytes, { 'x-ww-photo-meta': sealed })
    expect(stored.status).toBe(200)
    expect(stored.body).toEqual({
      ok: true,
      name: photo,
      size: 5_000,
      sha256,
      createdAt: START,
      existed: false,
      usage: { bytes: 5_000, count: 1, limit: LIMIT },
    })
    expect(stored.headers.get('etag')).toBe(`"${sha256}"`)
    // One object, under a key of its own put.
    expect(keysOf(s, photo)).toEqual([expect.stringMatching(new RegExp(`^v1/${s.accountId}/${photo}/[\\w-]+$`))])
    expect(bytesOf(s, photo)).toEqual([bytes])

    expect((await list(s)).body).toEqual({
      ok: true,
      photos: [{ name: photo, size: 5_000, sha256, createdAt: START, meta: sealed }],
      cursor: null,
      usage: { bytes: 5_000, count: 1, limit: LIMIT },
    })

    const got = await get(s, photo)
    expect(got.status).toBe(200)
    expect(got.bytes).toEqual(bytes)
    expect(got.headers.get('etag')).toBe(`"${sha256}"`)
    expect(got.headers.get('x-ww-created-at')).toBe(String(START))
    expect(got.headers.get('cache-control')).toBe('no-store')
    expect(got.headers.get('content-type')).toBe('application/octet-stream')
    expect(await usage(s)).toEqual({ bytes: 5_000, count: 1, limit: LIMIT })

    expect((await del(s, { names: [photo] })).body).toEqual({
      ok: true,
      usage: { bytes: 0, count: 0, limit: LIMIT },
    })
    expect((await list(s)).body).toMatchObject({ photos: [], cursor: null })
    expect((await get(s, photo)).body).toMatchObject({ code: 'not_found' })
    // Purged later, not now.
    expect(keysOf(s, photo)).toHaveLength(1)
    // Idempotent, unknown names too.
    expect((await del(s, { names: [photo, await name()] })).status).toBe(200)
    expect(await usage(s)).toEqual({ bytes: 0, count: 0, limit: LIMIT })
    expectExactUsage(s)
  })

  it('keeps accounts apart', async () => {
    const a = await session()
    const b = await session()
    const photo = await name()
    await put(a, photo)
    expect((await get(b, photo)).status).toBe(404)
    expect((await list(b)).body).toMatchObject({ photos: [] })
    // The same name under another account is another photo.
    expect((await put(b, photo)).body).toMatchObject({ existed: false })
    await del(b, { names: [photo] })
    expect((await get(a, photo)).status).toBe(200)
  })

  it('answers existed for a live name, writes nothing, and counts the put', async () => {
    const s = await session()
    const photo = await name()
    const first = await put(s, photo, randomBytes(700))
    advance(SECOND)
    const again = await put(s, photo, randomBytes(900), {
      // Even a body that doesn't match its digest: only the name matters.
      'x-ww-sha256': await sha256B64u(randomBytes(4)),
    })
    expect(again.status).toBe(200)
    expect(again.body).toEqual({
      ok: true,
      name: photo,
      size: 700,
      sha256: first.body.sha256,
      createdAt: START,
      existed: true,
      usage: { bytes: 700, count: 1, limit: LIMIT },
    })
    expect(h.photoBlobs.calls.filter((call) => call.startsWith('put'))).toHaveLength(1)
    expect(
      h.syncIndexes
        .storage(s.accountId)
        .query("SELECT SUM(n) AS n, SUM(bytes) AS bytes FROM photo_rate WHERE kind = 'put'")
    ).toEqual([{ n: 2, bytes: 700 }])
    expectExactUsage(s)
  })

  it('makes a deleted name live again under a new object the purge can’t take', async () => {
    const s = await session()
    const photo = await name()
    const old = randomBytes(300)
    await put(s, photo, old)
    await del(s, { names: [photo] })
    advance(5 * DAY)
    const bytes = randomBytes(400)
    const later = await session(s.key)
    const back = await put(later, photo, bytes)
    expect(back.body).toMatchObject({
      existed: false,
      size: 400,
      createdAt: START + 5 * DAY,
      usage: { bytes: 400, count: 1 },
    })
    expect((await get(later, photo)).bytes).toEqual(bytes)
    expect(bytesOf(s, photo)).toHaveLength(2)
    // The old delete's purge takes the old object only.
    advance(26 * DAY)
    await slotPut(await session(s.key), PHONE)
    await runRetention(s.accountId)
    expect(bytesOf(s, photo)).toEqual([bytes])
    const again = await session(s.key)
    expect((await get(again, photo)).bytes).toEqual(bytes)
    expect(await usage(again)).toMatchObject({ bytes: 400, count: 1 })
    expectExactUsage(s)
  })

  it('pages the list by name, 1,000 at a time', async () => {
    const s = await session()
    const names = await seed(s, SYNC_PHOTO_LIMITS.listPage + 2)
    await del(s, { names: [names[3]] })
    const first = await list(s)
    expect(first.body.photos).toHaveLength(1_000)
    expect((first.body.photos as { name: string }[]).map((p) => p.name)).toEqual(
      names.filter((_, i) => i !== 3).slice(0, 1_000)
    )
    expect(first.body.cursor).toEqual(expect.any(String))
    expect(first.body.usage).toEqual({
      bytes: 10_010,
      count: 1_001,
      limit: LIMIT,
    })
    const second = await list(s, { cursor: first.body.cursor })
    expect(second.body).toMatchObject({
      photos: [{ name: names[1_001] }],
      cursor: null,
    })
    expect((await list(s, { cursor: 'not a cursor!' })).body).toMatchObject({
      code: 'bad_request',
    })
  })

  it('deletes every photo with all', async () => {
    const s = await session()
    const names = await seed(s, 3)
    expect((await del(s, { all: true })).body).toEqual({
      ok: true,
      usage: { bytes: 0, count: 0, limit: LIMIT },
    })
    expect((await list(s)).body).toMatchObject({ photos: [] })
    for (const photo of names) expect((await get(s, photo)).status).toBe(404)
    expectExactUsage(s)
  })

  it('needs a live session to put or delete photos', async () => {
    const s = await session()
    const [photo] = await seed(s, 1)
    await requestJson(app as never, h.env, 'DELETE', '/sessions/current', undefined, bearer(s.accessToken))
    expect((await del(s, { all: true })).status).toBe(401)
    expect((await del(s, { names: [photo] })).status).toBe(401)
    expect((await put(s, await name())).status).toBe(401)
  })

  it('always reads the body to the end, even when it doesn’t need it', async () => {
    h.env.SYNC_PHOTO_LIMIT_BYTES = '1000'
    const s = await session()
    const photo = await name()
    await put(s, photo, randomBytes(600))
    for (const [label, target, size] of [
      ['existed', photo, 800],
      ['storage_full', await name(), 800],
    ] as const) {
      const bytes = randomBytes(size)
      const body = trackedBody(bytes)
      const response = await request('/sync/photos/put', {
        method: 'POST',
        headers: {
          ...bearer(s.accessToken),
          'content-length': String(size),
          'x-ww-photo-name': target,
          'x-ww-sha256': await sha256B64u(bytes),
          'x-ww-photo-meta': meta(),
        },
        body: body.stream,
      })
      expect(response.status, label).toBe(label === 'existed' ? 200 : 429)
      expect(body.finished(), label).toBe(true)
    }
  })
})

describe('change notices', () => {
  it('tells the account’s other sockets when a photo is stored or deleted', async () => {
    const s = await session()
    const phone = await live(s, PHONE)
    const tablet = await live(s, 'tablet-slot-1')
    const photo = await name()
    await put(s, photo, randomBytes(10), { 'x-ww-slot-id': PHONE })
    expect(phone.messages()).toEqual([{ type: 'hello', seq: 1 }])
    expect(tablet.messages()).toEqual([
      { type: 'hello', seq: 1 },
      { type: 'changed', seq: 2 },
    ])
    // Nothing stored, nothing said.
    await put(s, photo, randomBytes(10), { 'x-ww-slot-id': PHONE })
    await del(s, { names: [await name()] })
    expect(tablet.messages()).toHaveLength(2)
    // A delete without a slot tells everyone.
    await del(s, { names: [photo] })
    expect(phone.messages().at(-1)).toEqual({ type: 'changed', seq: 3 })
    expect(tablet.messages().at(-1)).toEqual({ type: 'changed', seq: 3 })
    await put(s, await name())
    await del(s, { all: true })
    expect(tablet.messages().at(-1)).toEqual({ type: 'changed', seq: 5 })
    expect((await slotList(s)).body).toMatchObject({ seq: 5 })
  })

  it('refuses a malformed x-ww-slot-id', async () => {
    const s = await session()
    expect((await put(s, await name(), randomBytes(10), { 'x-ww-slot-id': 'bad' })).body).toMatchObject({
      code: 'bad_request',
    })
    const response = await postJson(
      app as never,
      h.env,
      '/sync/photos/delete',
      { all: true },
      {
        ...bearer(s.accessToken),
        'x-ww-slot-id': 'bad',
      }
    )
    expect(response.body).toMatchObject({ code: 'bad_request' })
  })
})

describe('storage limit', () => {
  it('refuses a put past the limit with storage_full and the usage', async () => {
    h.env.SYNC_PHOTO_LIMIT_BYTES = '1000'
    const s = await session()
    const kept = await name()
    expect((await put(s, kept, randomBytes(600))).status).toBe(200)
    const full = await put(s, await name(), randomBytes(500))
    expect(full.status).toBe(429)
    expect(full.headers.get('retry-after')).toBeNull()
    expect(full.body).toEqual({
      ok: false,
      error: 'storage_full',
      code: 'storage_full',
      usage: { bytes: 600, count: 1, limit: 1_000 },
    })
    expect(h.photoBlobs.objects.size).toBe(1)
    // Exactly at the limit is fine; deleting frees space at once.
    expect((await put(s, await name(), randomBytes(400))).status).toBe(200)
    expect((await put(s, await name(), randomBytes(1))).status).toBe(429)
    await del(s, { names: [kept] })
    expect((await put(s, await name(), randomBytes(600))).status).toBe(200)
    expect(await usage(s)).toEqual({ bytes: 1_000, count: 2, limit: 1_000 })
    expectExactUsage(s)
  })

  it('counts space a put is uploading, so parallel puts can’t pass it', async () => {
    h.env.SYNC_PHOTO_LIMIT_BYTES = '1000'
    const s = await session()
    const held = holdNextR2Put()
    const first = put(s, await name(), randomBytes(600))
    await vi.waitFor(() => expect(h.photoBlobs.put).toHaveBeenCalled())
    const second = await put(s, await name(), randomBytes(600))
    expect(second.body).toMatchObject({
      code: 'storage_full',
      usage: { bytes: 0, count: 0 },
    })
    held.release()
    expect((await first).status).toBe(200)
    expect(await usage(s)).toEqual({ bytes: 600, count: 1, limit: 1_000 })
  })

  it('checks the limit again when the put commits', async () => {
    h.env.SYNC_PHOTO_LIMIT_BYTES = '1000'
    const s = await session()
    const held = holdNextR2Put()
    const photo = await name()
    const putting = put(s, photo, randomBytes(600))
    await vi.waitFor(() => expect(h.photoBlobs.put).toHaveBeenCalled())
    h.env.SYNC_PHOTO_LIMIT_BYTES = '500'
    held.release()
    const refused = await putting
    expect(refused.status).toBe(429)
    expect(refused.body).toMatchObject({
      code: 'storage_full',
      usage: { bytes: 0, count: 0, limit: 500 },
    })
    expect(keysOf(s, photo)).toEqual([])
    expect((await get(s, photo)).status).toBe(404)
    expectExactUsage(s)
  })

  it('frees the space of a put whose commit never came after 2 minutes', async () => {
    h.env.SYNC_PHOTO_LIMIT_BYTES = '1000'
    const s = await session()
    const index = h.syncIndexes.object(s.accountId)
    const stuck = await name()
    const begun = await index.beginPhotoPut({
      accountId: s.accountId,
      name: stuck,
      size: 800,
      sha256: await name(),
      meta: 'bWV0YQ',
    })
    expect(begun.ok).toBe(true)
    expect((await put(s, await name(), randomBytes(300))).body).toMatchObject({
      code: 'storage_full',
    })
    // One put a name at a time.
    expect((await put(s, stuck)).body).toMatchObject({ code: 'rate_limited' })
    advance(SYNC_PHOTO_LIMITS.putReservationMs + 1)
    // The token expired meanwhile; the same account signs in again.
    const again = await session(s.key)
    expect((await put(again, await name(), randomBytes(300))).status).toBe(200)
    expect((await put(again, stuck, randomBytes(200))).status).toBe(200)
    expect(await usage(again)).toEqual({ bytes: 500, count: 2, limit: 1_000 })
    // The late commit finds its reservation gone.
    if (begun.ok && 'reservation' in begun.value)
      expect(
        await index.commitPhotoPut({
          accountId: s.accountId,
          name: stuck,
          reservation: begun.value.reservation,
        })
      ).toMatchObject({ ok: false, error: 'conflict' })
    expect(await usage(again)).toEqual({ bytes: 500, count: 2, limit: 1_000 })
    expect((await get(again, stuck)).status).toBe(200)
    expectExactUsage(s)
  })

  describe('a put on a slow link', () => {
    const MIB = 1024 * 1024
    const beginBig = async (s: TestSession, size: number) => {
      const index = h.syncIndexes.object(s.accountId)
      const photo = await name()
      const begun = await index.beginPhotoPut({
        accountId: s.accountId,
        name: photo,
        size,
        sha256: await name(),
        meta: 'bWV0YQ',
      })
      if (!begun.ok || !('reservation' in begun.value)) throw new Error('begin')
      return { index, photo, reservation: begun.value.reservation }
    }

    it('keeps the reservation of a large put while its body still arrives', async () => {
      const s = await session()
      const { index, photo, reservation } = await beginBig(s, 20 * MIB)
      // At 100 KB/s the body takes more than three minutes.
      advance(3 * MINUTE + 30 * SECOND)
      // Still in flight: the name is held, and its retry is told when to come.
      const retry = await put(s, photo)
      expect(retry.body).toMatchObject({ code: 'rate_limited' })
      expect(Number(retry.headers.get('retry-after'))).toBeGreaterThan(60)
      expect(
        await index.commitPhotoPut({
          accountId: s.accountId,
          name: photo,
          reservation,
        })
      ).toMatchObject({ ok: true })
    })

    it('sizes the reservation to the body at 50 KiB/s plus a minute, from 2 to 10 minutes', async () => {
      const s = await session()
      for (const [size, minutes] of [
        [1, 2],
        [5 * MIB, 2.7],
        [25 * MIB, 9.5],
      ] as const) {
        const { index, photo, reservation } = await beginBig(s, size)
        advance((minutes - 0.1) * MINUTE)
        expect((await put(s, photo)).body, `${size} held`).toMatchObject({
          code: 'rate_limited',
        })
        advance(0.2 * MINUTE)
        expect(
          await index.commitPhotoPut({
            accountId: s.accountId,
            name: photo,
            reservation,
          }),
          `${size} lapsed`
        ).toMatchObject({ ok: false, error: 'conflict' })
      }
    })

    it('frees a large put’s space when its window lapses, and not before', async () => {
      h.env.SYNC_PHOTO_LIMIT_BYTES = String(30 * MIB)
      const s = await session()
      const { photo } = await beginBig(s, 25 * MIB)
      advance(3 * MINUTE)
      expect((await put(s, await name(), randomBytes(10 * MIB))).body).toMatchObject({
        code: 'storage_full',
      })
      advance(7 * MINUTE)
      const again = await session(s.key)
      expect((await put(again, await name(), randomBytes(10 * MIB))).status).toBe(200)
      expect((await put(again, photo, randomBytes(100))).status).toBe(200)
    })

    it('stores a put whose R2 write ended minutes after it began', async () => {
      const s = await session()
      const original = h.photoBlobs.put.bind(h.photoBlobs)
      vi.spyOn(h.photoBlobs, 'put').mockImplementationOnce(async (...args) => {
        advance(150 * SECOND)
        return original(...args)
      })
      const photo = await name()
      const stored = await put(s, photo, randomBytes(6 * MIB))
      expect(stored.status).toBe(200)
      expect(keysOf(s, photo)).toHaveLength(1)
      expectExactUsage(s)
    })

    it('refuses a put whose upload outlives its window and stores nothing', async () => {
      const s = await session()
      const original = h.photoBlobs.put.bind(h.photoBlobs)
      vi.spyOn(h.photoBlobs, 'put').mockImplementationOnce(async (...args) => {
        advance(4 * MINUTE)
        return original(...args)
      })
      const photo = await name()
      const late = await put(s, photo, randomBytes(6 * MIB))
      expect(late.status).toBe(409)
      expect(late.body).toMatchObject({ code: 'conflict' })
      expect(keysOf(s, photo)).toEqual([])
    })
  })

  it('frees the space of a put whose body or R2 write failed', async () => {
    h.env.SYNC_PHOTO_LIMIT_BYTES = '1000'
    const s = await session()
    const bytes = randomBytes(900)
    const bad = await put(s, await name(), bytes, {
      'x-ww-sha256': await sha256B64u(randomBytes(900)),
    })
    expect(bad.body).toMatchObject({ code: 'bad_request' })
    h.photoBlobs.failNext('put')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect((await put(s, await name(), bytes)).status).toBe(500)
    expect((await put(s, await name(), bytes)).status).toBe(200)
  })

  describe('a put whose body is cut off', () => {
    /** A put whose connection drops after `sent` bytes of `bytes`. */
    const cutOff = async (s: TestSession, photo: string, bytes: Uint8Array, sent: number) => {
      let offset = 0
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= sent) {
            controller.error(new Error('connection lost'))
            return
          }
          controller.enqueue(bytes.slice(offset, offset + 100))
          offset += 100
        },
      })
      return request('/sync/photos/put', {
        method: 'POST',
        headers: {
          ...bearer(s.accessToken),
          'content-length': String(bytes.byteLength),
          'x-ww-photo-name': photo,
          'x-ww-sha256': await sha256B64u(bytes),
          'x-ww-photo-meta': meta(),
        },
        body: stream,
      })
    }

    it('takes an immediate retry of the same name, not a 429 until the window lapses', async () => {
      const s = await session()
      const photo = await name()
      const bytes = randomBytes(800)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      expect((await cutOff(s, photo, bytes, 300)).status).toBeGreaterThanOrEqual(500)
      const retry = await put(s, photo, bytes)
      expect(retry.status).toBe(200)
      expect(retry.body).toMatchObject({ ok: true, existed: false })
      expect(bytesOf(s, photo)).toHaveLength(1)
    })

    it('frees the space it reserved at once', async () => {
      h.env.SYNC_PHOTO_LIMIT_BYTES = '1000'
      const s = await session()
      const bytes = randomBytes(900)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      expect((await cutOff(s, await name(), bytes, 300)).status).toBeGreaterThanOrEqual(500)
      // 900 of 1,000 would be reserved still, and this 900 would be refused.
      const other = await put(s, await name(), bytes)
      expect(other.status).toBe(200)
      expect(other.body).toMatchObject({ usage: { bytes: 900 } })
    })

    it('asks the runtime to finish the release after the client has gone', async () => {
      const s = await session()
      const photo = await name()
      const bytes = randomBytes(800)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      // A disconnect cancels what a request still has pending unless it is
      // handed to waitUntil.
      const waited: Promise<unknown>[] = []
      const ctx = {
        waitUntil: (promise: Promise<unknown>) => waited.push(promise),
        passThroughOnException: () => undefined,
      }
      let offset = 0
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= 300) {
            controller.error(new Error('connection lost'))
            return
          }
          controller.enqueue(bytes.slice(offset, offset + 100))
          offset += 100
        },
      })
      const response = await (app as { request: typeof fetch }).request(
        '/sync/photos/put',
        {
          method: 'POST',
          duplex: 'half',
          headers: {
            ...bearer(s.accessToken),
            'content-length': String(bytes.byteLength),
            'x-ww-photo-name': photo,
            'x-ww-sha256': await sha256B64u(bytes),
            'x-ww-photo-meta': meta(),
          },
          body: stream,
        } as RequestInit,
        h.env as never,
        ctx as never
      )
      expect(response.status).toBeGreaterThanOrEqual(500)
      expect(waited).toHaveLength(1)
      await Promise.all(waited)
      expect((await put(s, photo, bytes)).status).toBe(200)
    })

    it('frees a large put’s reservation before its window lapses', async () => {
      const s = await session()
      const photo = await name()
      const bytes = randomBytes(8 * 1024 * 1024)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      expect((await cutOff(s, photo, bytes, 100_000)).status).toBeGreaterThanOrEqual(500)
      const index = h.syncIndexes.object(s.accountId)
      // Seconds in, nothing of it is held: not the name, not its bytes.
      advance(5 * SECOND)
      const retry = await put(s, photo, bytes)
      expect(retry.status).toBe(200)
      expect((await index.listPhotos({ cursor: null })).usage.bytes).toBe(bytes.byteLength)
    })
  })

  it('uses 2,000,000,000 bytes unless SYNC_PHOTO_LIMIT_BYTES is a positive integer', async () => {
    const s = await session()
    for (const value of ['', 'abc', '-5', '0', '1.5'] as const) {
      h.env.SYNC_PHOTO_LIMIT_BYTES = value
      expect((await usage(s)).limit, value).toBe(LIMIT)
    }
    h.env.SYNC_PHOTO_LIMIT_BYTES = '5000000'
    expect((await usage(s)).limit).toBe(5_000_000)
  })
})

describe('races', () => {
  it('a delete wins over a put of the same name in flight: conflict, nothing stored', async () => {
    const s = await session()
    const photo = await name()
    const held = holdNextR2Put()
    const putting = put(s, photo, randomBytes(500))
    await vi.waitFor(() => expect(h.photoBlobs.put).toHaveBeenCalled())
    expect((await del(s, { names: [photo] })).body).toMatchObject({
      usage: { bytes: 0, count: 0 },
    })
    // The name stays held until that put ends.
    expect((await put(s, photo)).body).toMatchObject({ code: 'rate_limited' })
    held.release()
    const settled = await putting
    expect(settled.status).toBe(409)
    expect(settled.body).toMatchObject({ code: 'conflict' })
    expect((await get(s, photo)).status).toBe(404)
    expect((await list(s)).body).toMatchObject({ photos: [] })
    expect(keysOf(s, photo)).toEqual([])
    expect(await usage(s)).toEqual({ bytes: 0, count: 0, limit: LIMIT })
    // And the name can be put again.
    expect((await put(s, photo)).status).toBe(200)
    expectExactUsage(s)
  })

  it('doesn’t count the space of a put a delete cancelled', async () => {
    h.env.SYNC_PHOTO_LIMIT_BYTES = '1000'
    const s = await session()
    const held = holdNextR2Put()
    const putting = put(s, await name(), randomBytes(600))
    await vi.waitFor(() => expect(h.photoBlobs.put).toHaveBeenCalled())
    await del(s, { all: true })
    expect((await put(s, await name(), randomBytes(600))).status).toBe(200)
    held.release()
    expect((await putting).status).toBe(409)
    expect(await usage(s)).toEqual({ bytes: 600, count: 1, limit: 1_000 })
    expectExactUsage(s)
  })

  it('every photo too', async () => {
    const s = await session()
    const held = holdNextR2Put()
    const putting = put(s, await name(), randomBytes(500))
    await vi.waitFor(() => expect(h.photoBlobs.put).toHaveBeenCalled())
    await del(s, { all: true })
    held.release()
    expect((await putting).status).toBe(409)
    expect(await usage(s)).toMatchObject({ bytes: 0, count: 0 })
    expect(h.photoBlobs.objects.size).toBe(0)
  })

  it('refuses a put on an account with no slot', async () => {
    const s = await bareSession()
    const refused = await put(s, await name())
    expect(refused.status).toBe(409)
    expect(refused.body).toMatchObject({ code: 'no_slot' })
    expect(h.photoBlobs.objects.size).toBe(0)
  })

  it('refuses a put whose account lost its last slot while it uploaded', async () => {
    const s = await session()
    const held = holdNextR2Put()
    const putting = put(s, await name(), randomBytes(500))
    await vi.waitFor(() => expect(h.photoBlobs.put).toHaveBeenCalled())
    await slotDelete(s, { slotId: PHONE })
    held.release()
    expect((await putting).body).toMatchObject({ code: 'no_slot' })
    expect(h.photoBlobs.objects.size).toBe(0)
  })

  it('takes many parallel puts of one name as one photo', async () => {
    const s = await session()
    const photo = await name()
    const results = await Promise.all(Array.from({ length: 8 }, () => put(s, photo, randomBytes(100))))
    const stored = results.filter((r) => r.status === 200)
    expect(stored.length).toBeGreaterThanOrEqual(1)
    for (const r of results) expect([200, 429]).toContain(r.status)
    expect(await usage(s)).toMatchObject({ bytes: 100, count: 1 })
    expect(keysOf(s, photo)).toHaveLength(1)
    expectExactUsage(s)
  })
})

describe('retention', () => {
  it('purges a deleted photo’s object 30 days after the delete', async () => {
    const s = await session()
    const photo = await name()
    const other = await name()
    await put(s, photo)
    await put(s, other)
    advance(DAY)
    expect((await del(await session(s.key), { names: [photo] })).status).toBe(200)
    advance(29 * DAY)
    await runRetention(s.accountId)
    expect(keysOf(s, photo)).toHaveLength(1)
    advance(DAY + 1)
    // The slot's session is live, so the slot stays.
    await runRetention(s.accountId)
    expect(keysOf(s, photo)).toEqual([])
    expect(h.syncIndexes.storage(s.accountId).query('SELECT name FROM photo')).toEqual([{ name: other }])
    expect(keysOf(s, other)).toHaveLength(1)
    expectExactUsage(s)
  })

  it('keeps the alarm while deleted photos wait, after the last slot went', async () => {
    const s = await session()
    const photo = await name()
    await put(s, photo)
    await del(s, { names: [photo] })
    await slotDelete(s, { slotId: PHONE })
    const storage = h.syncIndexes.storage(s.accountId)
    for (let day = 1; day <= 30; day++) {
      advance(DAY)
      await runRetention(s.accountId)
      if (day < 30) expect(storage.alarm(), `day ${day}`).not.toBeNull()
    }
    expect(keysOf(s, photo)).toEqual([])
    expect(storage.query('SELECT name FROM photo')).toEqual([])
    // Nothing left: no more alarms.
    expect(storage.alarm()).toBeNull()
  })

  it('deletes the photos of an account with no slot for a day', async () => {
    const s = await session()
    const tablet = await live(s, 'tablet-slot-1')
    const photo = await name()
    await put(s, photo)
    await slotDelete(s, { slotId: PHONE })
    advance(DAY - MINUTE)
    await runRetention(s.accountId)
    const again = await session(s.key)
    expect(await usage(again)).toMatchObject({ count: 1 })
    advance(MINUTE)
    const seqBefore = tablet.messages().at(-1)
    await runRetention(s.accountId)
    expect(await usage(again)).toMatchObject({ bytes: 0, count: 0 })
    expect((await get(again, photo)).status).toBe(404)
    expect(tablet.messages().at(-1)).not.toEqual(seqBefore)
    // Its object follows 30 days later.
    advance(SYNC_PHOTO_LIMITS.deletedRetentionMs + 1)
    await runRetention(s.accountId)
    expect(h.photoBlobs.objects.size).toBe(0)
    expectExactUsage(s)
  })

  it('restarts the day when a slot is put again', async () => {
    const s = await session()
    await put(s, await name())
    await slotDelete(s, { slotId: PHONE })
    advance(12 * 60 * MINUTE)
    const again = await session(s.key)
    expect((await slotPut(again, PHONE)).status).toBe(200)
    await slotDelete(again, { slotId: PHONE })
    advance(13 * 60 * MINUTE)
    await runRetention(s.accountId)
    // A day since the first delete, not since the last.
    expect(h.syncIndexes.storage(s.accountId).query('SELECT count FROM photo_state')).toEqual([{ count: 1 }])
    advance(11 * 60 * MINUTE)
    await runRetention(s.accountId)
    expect(h.syncIndexes.storage(s.accountId).query('SELECT count FROM photo_state')).toEqual([{ count: 0 }])
  })

  it('keeps the photos when a device comes back before the alarm', async () => {
    const s = await session()
    await put(s, await name())
    await slotDelete(s, { slotId: PHONE })
    advance(DAY + MINUTE)
    // Back just before the alarm runs: it checks again.
    expect((await slotPut(await session(s.key), PHONE)).status).toBe(200)
    await runRetention(s.accountId)
    expect(h.syncIndexes.storage(s.accountId).query('SELECT count FROM photo_state')).toEqual([{ count: 1 }])
  })

  it('deletes every photo with sync/delete without slotId', async () => {
    const s = await session()
    const photo = await name()
    await put(s, photo)
    expect((await slotDelete(s, {})).status).toBe(200)
    expect(await usage(s)).toMatchObject({ bytes: 0, count: 0 })
    expect((await get(s, photo)).status).toBe(404)
    expectExactUsage(s)
  })

  it('sweeps the object of an R2 write that failed but landed', async () => {
    const s = await session()
    const original = h.photoBlobs.put.bind(h.photoBlobs)
    vi.spyOn(h.photoBlobs, 'put').mockImplementationOnce(async (...args) => {
      await original(...args)
      throw new Error('r2 timeout')
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const photo = await name()
    expect((await put(s, photo)).status).toBe(500)
    expect(keysOf(s, photo)).toHaveLength(1)
    advance(SYNC_PHOTO_LIMITS.putReservationMs + 1)
    await runRetention(s.accountId)
    expect(keysOf(s, photo)).toEqual([])
  })

  it('keeps a sweep asked for while one runs', async () => {
    const s = await session()
    const index = h.syncIndexes.object(s.accountId)
    await index.abortPhotoPut({
      name: await name(),
      reservation: 'gone',
      wrote: true,
    })
    const original = h.photoBlobs.list.bind(h.photoBlobs)
    vi.spyOn(h.photoBlobs, 'list').mockImplementationOnce(async (...args) => {
      await index.abortPhotoPut({
        name: await name(),
        reservation: 'gone',
        wrote: true,
      })
      return original(...args)
    })
    await runRetention(s.accountId)
    expect(h.syncIndexes.storage(s.accountId).query('SELECT sweep FROM photo_state')).toEqual([{ sweep: 2 }])
    await runRetention(s.accountId)
    expect(h.syncIndexes.storage(s.accountId).query('SELECT sweep FROM photo_state')).toEqual([{ sweep: 0 }])
  })

  it('sweeps the object of a put abandoned after its R2 write', async () => {
    const s = await session()
    const index = h.syncIndexes.object(s.accountId)
    const photo = await name()
    const begun = await index.beginPhotoPut({
      accountId: s.accountId,
      name: photo,
      size: 4,
      sha256: photo,
      meta: 'bQ',
    })
    if (!begun.ok || !('reservation' in begun.value)) throw new Error('begin')
    // The Worker wrote R2, then died before the commit.
    const orphan = `v1/${s.accountId}/${photo}/${begun.value.reservation}`
    h.photoBlobs.objects.set(orphan, {
      bytes: randomBytes(4),
      uploaded: Date.now(),
    })
    const kept = await name()
    await put(s, kept)
    await runRetention(s.accountId)
    // Still in flight: kept.
    expect(h.photoBlobs.objects.has(orphan)).toBe(true)
    advance(SYNC_PHOTO_LIMITS.putReservationMs + 1)
    await runRetention(s.accountId)
    expect(h.photoBlobs.objects.has(orphan)).toBe(false)
    expect(keysOf(s, kept)).toHaveLength(1)
    expect(h.syncIndexes.storage(s.accountId).query('SELECT sweep FROM photo_state')).toEqual([{ sweep: 0 }])
  })
})

describe('switches', () => {
  it('turns off with sync:enabled, except delete and usage', async () => {
    const s = await session()
    const photo = await name()
    await put(s, photo)
    await h.kv.put('sync:enabled', 'false')
    for (const response of [await put(s, await name()), await list(s), await get(s, photo)]) {
      expect(response.status).toBe(503)
      expect(code(response.body)).toBe('disabled')
      expect(response.headers.get('retry-after')).toBe('60')
    }
    expect(await usage(s)).toMatchObject({ count: 1 })
    expect((await del(s, { names: [photo] })).status).toBe(200)
  })

  it('needs an entitled account for put, list, and get', async () => {
    const s = await session()
    const photo = await name()
    await put(s, photo)
    await h.kv.put('sync:entitlement', 'supporter')
    for (const response of [await put(s, await name()), await list(s), await get(s, photo)]) {
      expect(response.status).toBe(403)
      expect(code(response.body)).toBe('supporter_required')
    }
    expect(await usage(s)).toMatchObject({ count: 1 })
    expect((await del(s, { names: [photo] })).status).toBe(200)
  })

  it('refuses only puts while sync:photos is off', async () => {
    const s = await session()
    const photo = await name()
    await put(s, photo)
    expect(await status(s)).toMatchObject({ photos: true })
    await h.kv.put('sync:photos', 'off')
    const off = await put(s, await name())
    expect(off.status).toBe(503)
    expect(off.body).toMatchObject({ code: 'photos_disabled' })
    expect(off.headers.get('retry-after')).toBe('60')
    expect((await list(s)).status).toBe(200)
    expect((await get(s, photo)).status).toBe(200)
    expect(await status(s)).toMatchObject({ photos: false, enabled: true })
    expect((await del(s, { names: [photo] })).status).toBe(200)
    // The rest of Cloud Sync carries on.
    advance(2 * SECOND)
    expect((await slotPut(s, PHONE)).status).toBe(200)
    await h.kv.put('sync:photos', 'on')
    expect((await put(s, await name())).status).toBe(200)
  })

  it('falls back to the SYNC_PHOTOS var, else on', async () => {
    const s = await session()
    h.env.SYNC_PHOTOS = 'off'
    expect((await put(s, await name())).body).toMatchObject({
      code: 'photos_disabled',
    })
    await h.kv.put('sync:photos', 'on')
    expect((await put(s, await name())).status).toBe(200)
    await h.kv.delete('sync:photos')
    h.env.SYNC_PHOTOS = undefined
    expect((await put(s, await name())).status).toBe(200)
  })

  it('says photos_disabled, never disabled, for put and get without the photo bucket', async () => {
    h = await createHarness({ photoBucket: false })
    const s = await session()
    for (const response of [await put(s, await name()), await get(s, await name())]) {
      expect(response.status).toBe(503)
      expect(code(response.body)).toBe('photos_disabled')
      expect(response.headers.get('retry-after')).toBe('60')
    }
    // The index still answers the rest.
    expect((await list(s)).body).toMatchObject({ ok: true, photos: [] })
    expect((await del(s, { all: true })).status).toBe(200)
    expect(await usage(s)).toMatchObject({ bytes: 0, count: 0 })
    expect(await status(s)).toMatchObject({ photos: false, enabled: true })
    // The rest of Cloud Sync carries on.
    advance(2 * SECOND)
    expect((await slotPut(s, PHONE)).status).toBe(200)
  })

  it('keeps a suspended account syncing its photos', async () => {
    const s = await session()
    await h.accountsDb!.prepare("UPDATE accounts SET status = 'suspended'").run()
    expect((await put(s, await name())).status).toBe(200)
    expect((await list(s)).status).toBe(200)
  })
})

describe('refusals', () => {
  it('refuses a declared size over 25 MiB before reading the body', async () => {
    const s = await session()
    const body = trackedBody(randomBytes(1_000))
    const response = await request('/sync/photos/put', {
      method: 'POST',
      headers: {
        ...bearer(s.accessToken),
        'content-length': String(SYNC_PHOTO_LIMITS.blobBytes + 1),
        'x-ww-photo-name': await name(),
        'x-ww-sha256': await sha256B64u(randomBytes(1)),
        'x-ww-photo-meta': meta(),
      },
      body: body.stream,
    })
    expect(response.status).toBe(413)
    expect(code(await response.json())).toBe('too_large')
    expect(body.finished()).toBe(false)
  })

  it('refuses malformed puts and stores nothing', async () => {
    const s = await session()
    const bytes = randomBytes(100)
    for (const headers of [
      { 'x-ww-photo-name': 'short' },
      { 'x-ww-photo-name': `${'a'.repeat(42)}!` },
      { 'x-ww-photo-meta': 'a'.repeat(513) },
      { 'x-ww-photo-meta': 'not base64url!' },
      { 'x-ww-photo-meta': '' },
      { 'x-ww-photo-meta': 'A' },
      { 'x-ww-photo-meta': 'AAAAA' },
      { 'x-ww-sha256': 'nope' },
      { 'x-ww-sha256': await sha256B64u(randomBytes(100)) },
      { 'content-length': '0' },
    ])
      expect((await put(s, await name(), bytes, headers)).body, JSON.stringify(headers)).toMatchObject({
        code: 'bad_request',
      })
    // No digest at all.
    const bare = await request('/sync/photos/put', {
      method: 'POST',
      headers: {
        ...bearer(s.accessToken),
        'content-length': '100',
        'x-ww-photo-name': await name(),
        'x-ww-photo-meta': meta(),
      },
      body: bytes,
    })
    expect(bare.status).toBe(400)
    expect(code(await bare.json())).toBe('bad_request')
    expect(h.photoBlobs.objects.size).toBe(0)
    expect(await usage(s)).toMatchObject({ bytes: 0, count: 0 })
  })

  it('refuses malformed get, list, and delete bodies', async () => {
    const s = await session()
    expect((await get(s, 'bad name')).status).toBe(400)
    for (const body of [
      {},
      { names: [] },
      { names: 'x' },
      { names: ['bad'] },
      {
        names: Array.from({ length: 101 }, (_, i) => `${'a'.repeat(40)}${String(i).padStart(3, '0')}`),
      },
      { all: false },
      { all: true, names: [] },
      [],
    ])
      expect((await del(s, body)).body, JSON.stringify(body)).toMatchObject({
        code: 'bad_request',
      })
    expect((await list(s, { cursor: 7 })).status).toBe(400)
  })

  it('takes 100 names a delete', async () => {
    const s = await session()
    const names = Array.from({ length: 100 }, (_, i) => `${'a'.repeat(40)}${String(i).padStart(3, '0')}`)
    expect((await del(s, { names })).status).toBe(200)
  })

  it('refuses requests without a token', async () => {
    const response = await postJson(app as never, h.env, '/sync/photos/list', {})
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('Bearer')
  })

  it('caps live photos at 20,000 an account, for new names only', async () => {
    const s = await session()
    const [kept] = await seed(s, 1)
    const storage = h.syncIndexes.storage(s.accountId)
    const more = SYNC_PHOTO_LIMITS.livePhotos - 1
    storage.query(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO photo (name, size, sha256, meta, put_id, created_at, deleted_at)
       SELECT printf('%043d', i), 1, 'x', 'm', 'p' || i, 0, NULL FROM n`,
      more
    )
    storage.query('UPDATE photo_state SET count = count + ?, bytes = bytes + ?', more, more)
    const over = await put(s, await name())
    expect(over.status).toBe(429)
    expect(over.body).toMatchObject({ code: 'limit' })
    expect(over.headers.get('retry-after')).toBeNull()
    // A live name still answers existed.
    expect((await put(s, kept)).body).toMatchObject({ existed: true })
    await del(s, { names: [kept] })
    expect((await put(s, await name())).status).toBe(200)
  })

  it('caps puts an account a rolling day', async () => {
    const s = await session()
    h.syncIndexes
      .storage(s.accountId)
      .query(
        "INSERT INTO photo_rate VALUES ('put', ?, ?, 0)",
        Math.floor(START / MINUTE),
        SYNC_PHOTO_LIMITS.accountPutsPerDay
      )
    const over = await put(s, await name())
    expect(over.status).toBe(429)
    expect(over.body).toMatchObject({
      code: 'rate_limited',
      retryAfter: 24 * 60 * 60 + 60,
    })
    expect(over.headers.get('retry-after')).toBe(String(24 * 60 * 60 + 60))
    advance(DAY + MINUTE)
    const again = await session(s.key)
    expect((await put(again, await name())).status).toBe(200)
  })

  it('waits for the bucket that actually frees a put, not the oldest one', async () => {
    const s = await session()
    const now = Math.floor(START / MINUTE)
    const storage = h.syncIndexes.storage(s.accountId)
    // An old bucket with bytes only, and a later one holding every put.
    storage.query("INSERT INTO photo_rate VALUES ('put', ?, 0, 50)", now - 600)
    storage.query("INSERT INTO photo_rate VALUES ('put', ?, ?, 0)", now - 300, SYNC_PHOTO_LIMITS.accountPutsPerDay)
    const over = await put(s, await name())
    expect(over.body).toMatchObject({
      code: 'rate_limited',
      retryAfter: (DAY - 300 * MINUTE + MINUTE) / SECOND,
    })
    // Bytes: the oldest bucket frees 50, the put needs 100 freed.
    storage.query('DELETE FROM photo_rate')
    storage.query("INSERT INTO photo_rate VALUES ('put', ?, 1, 50)", now - 600)
    storage.query(
      "INSERT INTO photo_rate VALUES ('put', ?, 1, ?)",
      now - 300,
      SYNC_PHOTO_LIMITS.accountPutBytesPerDay - 150
    )
    const heavy = await put(s, await name(), randomBytes(200))
    expect(heavy.body).toMatchObject({
      code: 'rate_limited',
      retryAfter: (DAY - 300 * MINUTE + MINUTE) / SECOND,
    })
    const light = await put(s, await name(), randomBytes(120))
    expect(light.body).toMatchObject({
      code: 'rate_limited',
      retryAfter: (DAY - 600 * MINUTE + MINUTE) / SECOND,
    })
  })

  it('counts stored and existed puts, not refused ones', async () => {
    h.env.SYNC_PHOTO_LIMIT_BYTES = '1000'
    const s = await session()
    const photo = await name()
    await put(s, photo, randomBytes(600))
    await put(s, photo, randomBytes(600))
    await put(s, await name(), randomBytes(600))
    await put(s, await name(), randomBytes(10), { 'x-ww-photo-meta': '!' })
    expect(
      h.syncIndexes
        .storage(s.accountId)
        .query("SELECT SUM(n) AS n, SUM(bytes) AS bytes FROM photo_rate WHERE kind = 'put'")
    ).toEqual([{ n: 2, bytes: 600 }])
  })

  it('caps the bytes puts store an account a rolling day', async () => {
    const s = await session()
    h.syncIndexes
      .storage(s.accountId)
      .query(
        "INSERT INTO photo_rate VALUES ('put', ?, 1, ?)",
        Math.floor(START / MINUTE),
        SYNC_PHOTO_LIMITS.accountPutBytesPerDay - 150
      )
    expect((await put(s, await name(), randomBytes(200))).body).toMatchObject({
      code: 'rate_limited',
    })
    expect((await put(s, await name(), randomBytes(100))).status).toBe(200)
    expect((await put(s, await name(), randomBytes(100))).body).toMatchObject({
      code: 'rate_limited',
    })
  })

  it('caps gets an account a rolling day', async () => {
    const s = await session()
    const photo = await name()
    await put(s, photo)
    h.syncIndexes
      .storage(s.accountId)
      .query(
        "INSERT INTO photo_rate VALUES ('get', ?, ?, 0)",
        Math.floor(START / MINUTE) - 1,
        SYNC_PHOTO_LIMITS.accountGetsPerDay - 1
      )
    expect((await get(s, photo)).status).toBe(200)
    const over = await get(s, photo)
    expect(over.status).toBe(429)
    expect(over.body).toMatchObject({ code: 'rate_limited' })
    expect(Number(over.headers.get('retry-after'))).toBe(24 * 60 * 60)
    advance(DAY + MINUTE)
    const again = await session(s.key)
    expect((await get(again, photo)).status).toBe(200)
  })

  it('counts puts in the photo-upload edge tier and the rest in the read tier', async () => {
    const s = await session()
    vi.spyOn(h.env.BUDDIES_BLOB_PUT_LIMITER, 'limit').mockResolvedValueOnce({
      success: false,
    })
    const limited = await put(s, await name())
    expect(limited.status).toBe(429)
    expect(limited.body).toMatchObject({
      code: 'rate_limited',
      retryAfter: 60,
    })
    const read = vi.spyOn(h.env.BUDDIES_READ_LIMITER, 'limit')
    await list(s)
    await usage(s)
    await del(s, { all: true })
    await get(s, await name())
    expect(read).toHaveBeenCalledTimes(4)
  })
})

describe('the status', () => {
  it('says whether photos are on', async () => {
    const s = await session()
    expect(await status(s)).toMatchObject({ ok: true, photos: true })
  })
})

describe('privacy', () => {
  it('never logs names, metas, account ids, or tokens', async () => {
    const logs: unknown[] = []
    for (const level of ['log', 'warn', 'error', 'info'] as const)
      vi.spyOn(console, level).mockImplementation((...args) => logs.push(args))
    h.env.SYNC_PHOTO_LIMIT_BYTES = '2000'
    const s = await session()
    const photo = await name()
    const sealed = meta()
    await put(s, photo, randomBytes(1_500), { 'x-ww-photo-meta': sealed })
    await put(s, photo)
    await put(s, await name(), randomBytes(1_000))
    await list(s)
    await get(s, photo)
    await del(s, { names: [photo] })
    await usage(s)
    h.photoBlobs.failNext('put')
    await put(s, await name())
    await slotDelete(s, { slotId: PHONE })
    advance(SYNC_LIMITS.retentionCheckMs * 31)
    await runRetention(s.accountId)
    const text = JSON.stringify(logs)
    for (const secret of [photo, sealed, s.accountId, s.accessToken]) expect(text).not.toContain(secret)
  })
})

describe('sessions without sync-everyone', () => {
  it('refuses photo put, list and get', async () => {
    const s = await session()
    const photo = await name()
    expect((await put(s, photo)).status).toBe(200)
    supporterStatus.mockResolvedValue({
      supporter: false,
      expiresAt: null,
      customers: 0,
    })
    // The same account's session from an app that never sent the capability.
    const old = await openTestSession(app as never, h.env, s.key)
    expect(code((await put(old, await name())).body)).toBe('supporter_required')
    expect(code((await list(old)).body)).toBe('supporter_required')
    expect(code((await get(old, photo)).body)).toBe('supporter_required')
  })
})

// The window table in witness-work's docs/cloud-sync-photos.md ("The window").
// The app waits the same window (less 10 s for a put), and its tests hold the
// same numbers, so the two formulas can't drift.
describe('the put reservation window', () => {
  it.each([
    [1, 120_000],
    [5 * 1_024 * 1_024, 162_400],
    [25 * 1_024 * 1_024, 572_000],
  ])('is %i bytes → %i ms', (size, windowMs) => {
    expect(photoPutReservationMs(size)).toBe(windowMs)
  })
})
