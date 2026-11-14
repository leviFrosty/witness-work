import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DAY_MS,
  Owner,
  SigningKey,
  blobPutHeaders,
  createHarness,
  envelope,
  photoBlob,
  randomBytes,
  randomId,
  relayError,
  b64u,
  type Harness,
  type PhotoBlob,
} from '../test/buddies'
import { BUDDIES_LIMITS } from './contracts'
import { BUDDIES_ABUSE_LIMITS as ABUSE } from './limits'
import { isBuddiesPhotosEnabled } from './killSwitch'

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
const MINUTE_MS = 60_000
const MIB = 1_024 * 1_024

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)

let h: Harness

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  h = await createHarness()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const keyOf = (owner: Owner, blob: PhotoBlob) =>
  `v1/${owner.inboxId}/${blob.blobId}`

/** An inbox with a buddy (a slot), as `blob/put` requires. */
const photoOwner = async () => {
  const owner = await Owner.create(h)
  await owner.addWriter()
  return owner
}

const blobRows = (owner: Owner) =>
  h.inboxes
    .storage(owner.inboxId)
    .query(
      'SELECT blob_id AS blobId, bytes, token_hash AS tokenHash, expires_at AS expiresAt, written_at AS writtenAt FROM blob ORDER BY blob_id'
    )

const CHUNK = 64 * 1_024

/** A body that counts how many bytes the server pulled from it. */
const countingStream = (total: number, chunk = CHUNK) => {
  let pulled = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= total) {
        controller.close()
        return
      }
      const size = Math.min(chunk, total - pulled)
      pulled += size
      controller.enqueue(randomBytes(size))
    },
  })
  return { stream, pulled: () => pulled }
}

/** A distinct caller per request, so the per-IP edge limit stays out of the way. */
let ip = 0
const fresh = () => ({ 'cf-connecting-ip': `198.51.${++ip >> 8}.${ip & 255}` })

describe('blob/put and blob/get', () => {
  it('stores a sealed blob once and serves its exact bytes to the token holder', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob(4_096)
    const expiresAt = START + 30 * DAY_MS

    const put = await owner.putBlob(blob, { expiresAt })
    expect(put).toMatchObject({ status: 200, body: { ok: true, expiresAt } })
    expect([...h.r2.objects.keys()]).toEqual([keyOf(owner, blob)])
    // Only the token's hash is kept, never the token or any key.
    expect(blobRows(owner)).toEqual([
      {
        blobId: blob.blobId,
        bytes: 4_096,
        tokenHash: blob.readTokenHash,
        expiresAt,
        writtenAt: START,
      },
    ])

    const got = await owner.getBlob(blob)
    expect(got.status).toBe(200)
    expect(got.bytes).toEqual(blob.bytes)
    expect(got.headers.get('content-type')).toBe('application/octet-stream')
    expect(got.headers.get('cache-control')).toBe('no-store')
    expect(got.headers.get('content-length')).toBe('4096')
    expect(got.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('refuses an inbox with no buddies, since nobody could read the photo', async () => {
    const owner = await Owner.create(h)
    const blob = await photoBlob()
    expect(await owner.putBlob(blob)).toMatchObject({
      status: 403,
      body: relayError('no_buddies'),
    })
    expect(h.r2.objects.size).toBe(0)
    expect(blobRows(owner)).toEqual([])
    expect(
      h.inboxes
        .storage(owner.inboxId)
        .query('SELECT COUNT(*) AS n FROM blob_upload')
    ).toEqual([{ n: 0 }])

    await owner.addWriter()
    expect((await owner.putBlob(blob)).status).toBe(200)
  })

  // Hashes, signs and compares a whole MiB: 2 to 4 seconds on a shared CI
  // runner, too close to the 5-second default.
  it('accepts exactly 1 MiB', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob(BUDDIES_LIMITS.blobBytes)
    expect((await owner.putBlob(blob)).status).toBe(200)
    expect((await owner.getBlob(blob)).bytes).toEqual(blob.bytes)
  }, 15_000)

  it('counts as owner activity for the 180-day wipe, but reads do not', async () => {
    const owner = await photoOwner()
    const storage = h.inboxes.storage(owner.inboxId)
    const blob = await photoBlob()
    advance(DAY_MS)
    await owner.putBlob(blob)
    expect(storage.query('SELECT last_active_at AS at FROM meta')).toEqual([
      { at: START + DAY_MS },
    ])
    advance(DAY_MS)
    await owner.getBlob(blob)
    expect(storage.query('SELECT last_active_at AS at FROM meta')).toEqual([
      { at: START + DAY_MS },
    ])
  })

  it('refuses bytes that do not hash to blobId, storing nothing', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    const other = randomBytes(blob.bytes.byteLength)
    const response = await owner.putBlob(blob, {}, { body: other })
    expect(response).toMatchObject({
      status: 400,
      body: relayError('bad_request'),
    })
    expect(h.r2.objects.size).toBe(0)
    expect(blobRows(owner)).toEqual([])
  })

  it('refuses a body whose length is not the signed `bytes`', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob(1_000)
    // Content-Length disagrees with `bytes`.
    expect(
      await owner.putBlob(blob, {}, { headers: { 'content-length': '999' } })
    ).toMatchObject({ status: 400, body: relayError('bad_request') })
    // No Content-Length; the stream is shorter, then longer, than `bytes`.
    for (const size of [999, 1_001]) {
      const { stream } = countingStream(size)
      expect(
        await owner.putBlob(
          blob,
          {},
          {
            body: stream,
            headers: { 'content-length': '' },
          }
        )
      ).toMatchObject({ status: 400, body: relayError('bad_request') })
    }
    expect(h.r2.objects.size).toBe(0)
  })

  it('refuses more than 1 MiB as too_large, declared or streamed, without reading it all', async () => {
    const owner = await photoOwner()
    const max = BUDDIES_LIMITS.blobBytes
    const tooLarge = { status: 413, body: relayError('too_large') }

    // Signed `bytes` over the limit: refused before the body is touched.
    const big = await photoBlob(16)
    const declaredBytes = countingStream(2 * max)
    expect(
      await owner.putBlob(
        big,
        { bytes: max + 1 },
        {
          body: declaredBytes.stream,
          headers: { 'content-length': '' },
        }
      )
    ).toMatchObject(tooLarge)
    // At most what the stream buffers on its own before anyone reads.
    expect(declaredBytes.pulled()).toBeLessThanOrEqual(2 * CHUNK)

    // Content-Length over the limit: refused before the body is read.
    const declaredLength = countingStream(2 * max)
    expect(
      await owner.putBlob(
        big,
        { bytes: max },
        {
          body: declaredLength.stream,
          headers: { 'content-length': String(max + 1) },
        }
      )
    ).toMatchObject(tooLarge)
    expect(declaredLength.pulled()).toBeLessThanOrEqual(2 * CHUNK)

    // No Content-Length and a body that keeps going: cut off just past 1 MiB.
    const streamed = countingStream(8 * max)
    expect(
      await owner.putBlob(
        big,
        { bytes: max },
        {
          body: streamed.stream,
          headers: { 'content-length': '' },
        }
      )
    ).toMatchObject(tooLarge)
    expect(streamed.pulled()).toBeGreaterThan(max)
    expect(streamed.pulled()).toBeLessThanOrEqual(max + 2 * CHUNK)
    expect(h.r2.objects.size).toBe(0)
    expect(blobRows(owner)).toEqual([])
  })

  it('refuses bad signatures, stale and replayed requests, and malformed headers', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    const stranger = await SigningKey.generate()
    const payload = {
      inboxId: owner.inboxId,
      blobId: blob.blobId,
      bytes: blob.bytes.byteLength,
      expiresAt: Date.now() + DAY_MS,
      readTokenHash: blob.readTokenHash,
      ts: Date.now(),
      nonce: randomId(),
    }
    const put = async (headers: Record<string, string>) => {
      const response = await h.request('/blob/put', {
        method: 'POST',
        headers: { ...fresh(), ...headers },
        body: blob.bytes,
      })
      return { status: response.status, body: await response.json() }
    }

    // Signed by someone else.
    expect(await put(await blobPutHeaders(payload, stranger))).toEqual({
      status: 401,
      body: relayError('bad_signature'),
    })
    // Signed as another op (the op is part of the signed message).
    const liveSigned = await blobPutHeaders(payload, owner.key)
    const signedAsOther = {
      ...liveSigned,
      'x-buddies-signature': (await envelope('inbox/live', payload, owner.key))
        .signature as string,
    }
    expect(await put(signedAsOther)).toEqual({
      status: 401,
      body: relayError('bad_signature'),
    })
    // A payload swapped under the owner's signature.
    const forged = {
      ...liveSigned,
      'x-buddies-payload': (
        await blobPutHeaders(
          { ...payload, expiresAt: payload.expiresAt + 1 },
          owner.key
        )
      )['x-buddies-payload'],
    }
    expect(await put(forged)).toEqual({
      status: 401,
      body: relayError('bad_signature'),
    })
    // Missing or malformed envelope headers.
    expect(await put({})).toEqual({
      status: 400,
      body: relayError('bad_request'),
    })
    expect(
      await put({
        'x-buddies-payload': '!!',
        'x-buddies-signature': liveSigned['x-buddies-signature'],
      })
    ).toEqual({ status: 400, body: relayError('bad_request') })
    expect(await put({ ...liveSigned, 'x-buddies-signature': 'A'.repeat(85) })).toEqual(
      { status: 401, body: relayError('bad_signature') }
    )
    // Stale on either side.
    for (const ts of [Date.now() - 6 * MINUTE_MS, Date.now() + 6 * MINUTE_MS]) {
      const stale = await put(
        await blobPutHeaders({ ...payload, ts, nonce: randomId() }, owner.key)
      )
      expect(stale.status).toBe(401)
      expect(stale.body).toEqual(relayError('stale'))
    }
    expect(h.r2.objects.size).toBe(0)

    // The real one, then its replay.
    expect((await put(liveSigned)).status).toBe(200)
    expect(await put(liveSigned)).toEqual({
      status: 409,
      body: relayError('replay'),
    })
  })

  it('validates the signed payload', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    const bad = { status: 400, body: relayError('bad_request') }
    for (const fields of [
      { blobId: blob.blobId.slice(1) },
      { blobId: `${blob.blobId.slice(0, 42)}!` },
      { readTokenHash: 'A'.repeat(42) },
      { readTokenHash: null },
      { bytes: 0 },
      { bytes: 1.5 },
      { bytes: '2048' },
      { expiresAt: Date.now() },
      { expiresAt: Date.now() + BUDDIES_LIMITS.maxBlobLifetimeMs + 1 },
      { expiresAt: '1' },
      { inboxId: 'short' },
    ]) {
      expect(
        await owner.putBlob(blob, fields),
        JSON.stringify(fields)
      ).toMatchObject(bad)
    }
    // At the lifetime ceiling is fine.
    expect(
      (
        await owner.putBlob(blob, {
          expiresAt: Date.now() + BUDDIES_LIMITS.maxBlobLifetimeMs,
        })
      ).status
    ).toBe(200)
  })

  it('answers not_found for an unknown inbox and stores nothing there', async () => {
    const stranger = await SigningKey.generate()
    const inboxId = randomId()
    const blob = await photoBlob()
    const response = await h.request('/blob/put', {
      method: 'POST',
      headers: {
        ...fresh(),
        ...(await blobPutHeaders(
          {
            inboxId,
            blobId: blob.blobId,
            bytes: blob.bytes.byteLength,
            expiresAt: Date.now() + DAY_MS,
            readTokenHash: blob.readTokenHash,
            ts: Date.now(),
            nonce: randomId(),
          },
          stranger
        )),
      },
      body: blob.bytes,
    })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual(relayError('not_found'))
    const got = await h.getBlob({
      inboxId,
      blobId: blob.blobId,
      token: blob.token,
    })
    expect(got.status).toBe(404)
    expect(h.inboxes.storage(inboxId).tables()).toEqual([])
    expect(h.r2.objects.size).toBe(0)
  })
})

describe('blob/get', () => {
  it('gives the same 404 for a wrong token, an unknown blob or inbox, and an expired blob', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    await owner.putBlob(blob, { expiresAt: START + DAY_MS })
    const other = await photoBlob()

    const misses = [
      await owner.getBlob(blob, b64u(randomBytes(32))),
      await owner.getBlob(other),
      await h.getBlob({
        inboxId: randomId(),
        blobId: blob.blobId,
        token: blob.token,
      }),
      // The token hash in place of the token.
      await owner.getBlob(blob, blob.readTokenHash),
    ]
    advance(DAY_MS)
    misses.push(await owner.getBlob(blob))
    for (const miss of misses) {
      expect(miss.status).toBe(404)
      expect(miss.body).toEqual(relayError('not_found'))
      expect(miss.bytes).toBeNull()
    }
  })

  it('refuses malformed requests', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    await owner.putBlob(blob)
    const bad = { status: 400, body: relayError('bad_request') }
    for (const payload of [
      { inboxId: owner.inboxId, blobId: blob.blobId },
      {
        inboxId: owner.inboxId,
        blobId: blob.blobId,
        token: blob.token.slice(1),
      },
      { inboxId: owner.inboxId, blobId: 'x', token: blob.token },
      { inboxId: 'x', blobId: blob.blobId, token: blob.token },
    ]) {
      expect(await h.getBlob(payload)).toMatchObject(bad)
    }
    expect(await h.getBlob('{"p":"!!"}')).toMatchObject(bad)
    expect(await h.getBlob('not json')).toMatchObject(bad)
  })

  it('never sends the token to the inbox, only its hash', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    await owner.putBlob(blob)
    const inbox = h.inboxes.object(owner.inboxId)
    const spy = vi.spyOn(inbox, 'authorizeBlobRead')
    await owner.getBlob(blob)
    expect(spy).toHaveBeenCalledWith({
      inboxId: owner.inboxId,
      blobId: blob.blobId,
      tokenHash: blob.readTokenHash,
    })
  })

  it('answers not_found when the object is missing from the bucket', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    await owner.putBlob(blob)
    h.r2.objects.clear()
    expect(await owner.getBlob(blob)).toMatchObject({
      status: 404,
      body: relayError('not_found'),
    })
  })
})

describe('re-putting a blob', () => {
  it('is idempotent: it keeps the first token and moves the expiry only later', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    // All before the first weekly sweep, so they're the alarm's deadlines.
    const first = START + 3 * DAY_MS
    expect((await owner.putBlob(blob, { expiresAt: first })).body).toEqual({
      ok: true,
      expiresAt: first,
    })
    const writes = () => h.r2.calls.filter((call) => call.startsWith('put'))
    expect(writes()).toHaveLength(1)

    // An earlier expiry (and a new token) changes nothing and writes nothing.
    const otherToken = await photoBlob()
    expect(
      (
        await owner.putBlob(blob, {
          expiresAt: START + 2 * DAY_MS,
          readTokenHash: otherToken.readTokenHash,
        })
      ).body
    ).toEqual({ ok: true, expiresAt: first })
    expect(writes()).toHaveLength(1)

    // A later expiry rewrites the object, so its age restarts with it.
    advance(DAY_MS)
    const later = START + 5 * DAY_MS
    expect(
      (
        await owner.putBlob(blob, {
          expiresAt: later,
          readTokenHash: otherToken.readTokenHash,
        })
      ).body
    ).toEqual({ ok: true, expiresAt: later })
    expect(writes()).toHaveLength(2)
    expect(blobRows(owner)).toEqual([
      expect.objectContaining({
        tokenHash: blob.readTokenHash,
        expiresAt: later,
        writtenAt: START + DAY_MS,
      }),
    ])
    expect(h.r2.objects.get(keyOf(owner, blob))?.uploaded).toBe(START + DAY_MS)

    // The first token still reads it; the ignored one never does.
    expect((await owner.getBlob(blob)).status).toBe(200)
    expect((await owner.getBlob(blob, otherToken.token)).status).toBe(404)

    // The old expiry's alarm finds nothing due and moves to the new one.
    const storage = h.inboxes.storage(owner.inboxId)
    expect(storage.alarm()).toBe(first)
    vi.setSystemTime(first)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect((await owner.getBlob(blob)).status).toBe(200)
    expect(storage.alarm()).toBe(later)
  })

  it('finishes a blob whose first write never completed', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    h.r2.failNext('put')
    const failed = await owner.putBlob(blob)
    expect(failed).toMatchObject({
      status: 500,
      body: { ok: false, code: 'internal' },
    })
    // No upload counted; the row stays, unwritten and unreadable, for ten
    // minutes in case the object landed anyway.
    const storage = h.inboxes.storage(owner.inboxId)
    expect(storage.query('SELECT COUNT(*) AS n FROM blob_upload')).toEqual([
      { n: 0 },
    ])
    expect(blobRows(owner)).toEqual([
      expect.objectContaining({
        expiresAt: START + 10 * MINUTE_MS,
        writtenAt: null,
      }),
    ])
    expect(storage.alarm()).toBe(START + 10 * MINUTE_MS)
    expect((await owner.getBlob(blob)).status).toBe(404)

    // A retry completes it, with its own expiry.
    const expiresAt = START + 30 * DAY_MS
    expect((await owner.putBlob(blob, { expiresAt })).body).toEqual({
      ok: true,
      expiresAt,
    })
    expect((await owner.getBlob(blob)).bytes).toEqual(blob.bytes)
  })

  it('deletes an object a failed put left behind', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    const put = h.r2.put
    h.r2.put = async (...args) => {
      // The object lands, but R2 reports a failure (a timeout).
      await put(...args)
      throw new Error('r2 put timed out')
    }
    expect((await owner.putBlob(blob)).status).toBe(500)
    h.r2.put = put
    expect(h.r2.objects.has(keyOf(owner, blob))).toBe(true)
    expect((await owner.getBlob(blob)).status).toBe(404)

    advance(10 * MINUTE_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(h.r2.objects.size).toBe(0)
    expect(blobRows(owner)).toEqual([])
  })

  it('deletes the object when its blob was deleted mid-write', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    const put = h.r2.put
    h.r2.put = async (...args) => {
      const stored = await put(...args)
      // The owner's other device deletes the blob while this one uploads.
      await owner.send('blob/delete', { blobIds: [blob.blobId] })
      return stored
    }
    expect(await owner.putBlob(blob)).toMatchObject({
      status: 404,
      body: relayError('not_found'),
    })
    h.r2.put = put
    expect(h.r2.objects.size).toBe(0)
    expect(blobRows(owner)).toEqual([])
  })
})

describe('blob/delete', () => {
  it('deletes rows and objects at once, idempotently', async () => {
    const owner = await photoOwner()
    const [a, b, c] = await Promise.all([photoBlob(), photoBlob(), photoBlob()])
    for (const blob of [a, b, c]) await owner.putBlob(blob)

    const unknown = await photoBlob()
    expect(
      (
        await owner.send('blob/delete', {
          blobIds: [a.blobId, b.blobId, unknown.blobId],
        })
      ).body
    ).toEqual({ ok: true })
    expect(blobRows(owner).map((row) => row.blobId)).toEqual([c.blobId])
    expect([...h.r2.objects.keys()]).toEqual([keyOf(owner, c)])
    expect((await owner.getBlob(a)).status).toBe(404)
    expect((await owner.getBlob(c)).status).toBe(200)
    // One batched R2 call for the whole request.
    expect(h.r2.calls.filter((call) => call.startsWith('delete'))).toHaveLength(
      1
    )

    expect(
      (await owner.send('blob/delete', { blobIds: [a.blobId, a.blobId] })).body
    ).toEqual({ ok: true })
    expect(
      h.inboxes
        .storage(owner.inboxId)
        .query('SELECT * FROM pending_blob_delete')
    ).toEqual([])
  })

  it('validates its ids and the owner signature', async () => {
    const owner = await photoOwner()
    const ids = (n: number) =>
      Array.from({ length: n }, () => b64u(randomBytes(32)))
    const bad = { status: 400, body: relayError('bad_request') }
    expect(await owner.send('blob/delete', { blobIds: [] })).toEqual(bad)
    expect(
      await owner.send('blob/delete', {
        blobIds: ids(BUDDIES_LIMITS.blobDeleteIds + 1),
      })
    ).toEqual(bad)
    expect(await owner.send('blob/delete', { blobIds: ['x'] })).toEqual(bad)
    expect(await owner.send('blob/delete', { blobIds: 'x' })).toEqual(bad)
    expect(
      (
        await owner.send('blob/delete', {
          blobIds: ids(BUDDIES_LIMITS.blobDeleteIds),
        })
      ).body
    ).toEqual({ ok: true })

    const stranger = await SigningKey.generate()
    expect(
      await h.send('blob/delete', stranger, {
        inboxId: owner.inboxId,
        blobIds: ids(1),
      })
    ).toEqual({ status: 401, body: relayError('bad_signature') })
  })

  it('retries object deletions R2 refused from the alarm', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    await owner.putBlob(blob, { expiresAt: START + 30 * DAY_MS })
    h.r2.failNext('delete')
    expect(
      (await owner.send('blob/delete', { blobIds: [blob.blobId] })).body
    ).toEqual({ ok: true })
    // Unreadable at once, though the object is still there.
    expect((await owner.getBlob(blob)).status).toBe(404)
    const storage = h.inboxes.storage(owner.inboxId)
    expect(
      storage.query('SELECT object_key AS key FROM pending_blob_delete')
    ).toEqual([{ key: keyOf(owner, blob) }])
    expect(storage.alarm()).toBe(START + MINUTE_MS)

    advance(MINUTE_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(h.r2.objects.size).toBe(0)
    expect(storage.query('SELECT * FROM pending_blob_delete')).toEqual([])
    // Next: the weekly sweep of the inbox's prefix.
    expect(storage.alarm()).toBe(START + 7 * DAY_MS)
  })

  it('waits twice as long after each failed retry, up to six hours', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    await owner.putBlob(blob, { expiresAt: START + 30 * DAY_MS })
    const storage = h.inboxes.storage(owner.inboxId)
    h.r2.failNext('delete')
    await owner.send('blob/delete', { blobIds: [blob.blobId] })
    const waits: number[] = []
    for (let i = 0; i < 11; i++) {
      const wait = storage.alarm()! - Date.now()
      waits.push(wait / MINUTE_MS)
      vi.setSystemTime(storage.alarm()!)
      h.r2.failNext('delete')
      await h.inboxes.fireAlarm(owner.inboxId)
    }
    expect(waits).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 256, 360, 360])
    expect(h.r2.objects.size).toBe(1)

    // A retry that works starts over.
    vi.setSystemTime(storage.alarm()!)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(h.r2.objects.size).toBe(0)
    expect(storage.query('SELECT * FROM blob_delete_backoff')).toEqual([])
  })
})

describe('blob retention', () => {
  it('deletes blobs and their objects at expiresAt via the alarm', async () => {
    const owner = await photoOwner()
    const soon = await photoBlob()
    const later = await photoBlob()
    await owner.putBlob(soon, { expiresAt: START + DAY_MS })
    await owner.putBlob(later, { expiresAt: START + 3 * DAY_MS })
    const storage = h.inboxes.storage(owner.inboxId)
    expect(storage.alarm()).toBe(START + DAY_MS)

    advance(DAY_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(blobRows(owner).map((row) => row.blobId)).toEqual([later.blobId])
    expect([...h.r2.objects.keys()]).toEqual([keyOf(owner, later)])
    expect(storage.alarm()).toBe(START + 3 * DAY_MS)

    advance(2 * DAY_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(blobRows(owner)).toEqual([])
    expect(h.r2.objects.size).toBe(0)
    // One more sweep a week after the first upload, then nothing.
    expect(storage.alarm()).toBe(START + 7 * DAY_MS)
    advance(4 * DAY_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(storage.alarm()).toBe(START + 180 * DAY_MS)
  })

  it('deletes expired objects in batches of 100', async () => {
    const owner = await photoOwner()
    const storage = h.inboxes.storage(owner.inboxId)
    for (let i = 0; i < 250; i++) {
      const blobId = b64u(randomBytes(32))
      storage.query(
        `INSERT INTO blob (blob_id, bytes, token_hash, expires_at, created_at, written_at)
         VALUES (?, 10, ?, ?, ?, ?)`,
        blobId,
        b64u(randomBytes(32)),
        START + DAY_MS,
        START,
        START
      )
      h.r2.objects.set(`v1/${owner.inboxId}/${blobId}`, {
        bytes: new Uint8Array(10),
        uploaded: START,
      })
    }
    advance(DAY_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(h.r2.objects.size).toBe(0)
    expect(
      h.r2.calls
        .filter((call) => call.startsWith('delete'))
        .map((call) => call.split(',').length)
    ).toEqual([100, 100, 50])
  })

  for (const [name, wipe] of [
    [
      'inbox/delete',
      async (owner: Owner) => {
        expect((await owner.send('inbox/delete')).body).toEqual({ ok: true })
      },
    ],
    [
      'the 180-day inactivity wipe',
      async (owner: Owner) => {
        advance(180 * DAY_MS)
        await h.inboxes.fireAlarm(owner.inboxId)
      },
    ],
  ] as const) {
    it(`purges every blob on ${name}`, async () => {
      const owner = await photoOwner()
      const blobs = await Promise.all([photoBlob(), photoBlob()])
      for (const blob of blobs)
        await owner.putBlob(blob, { expiresAt: START + 90 * DAY_MS })
      const other = await photoOwner()
      const kept = await photoBlob()
      await other.putBlob(kept, { expiresAt: START + 90 * DAY_MS })
      // An object under the inbox's prefix that no row knows goes too.
      h.r2.objects.set(`v1/${owner.inboxId}/${b64u(randomBytes(32))}`, {
        bytes: new Uint8Array(10),
        uploaded: START,
      })

      await wipe(owner)

      expect([...h.r2.objects.keys()]).toEqual([keyOf(other, kept)])
      const storage = h.inboxes.storage(owner.inboxId)
      expect(storage.tables()).toEqual(['owner_tombstone'])
      expect(storage.alarm()).toBeNull()
      for (const blob of blobs)
        expect((await owner.getBlob(blob)).status).toBe(404)
    })
  }

  it('finishes a wipe’s object deletions from the alarm when R2 fails', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    await owner.putBlob(blob)
    h.r2.failNext('delete')
    expect((await owner.send('inbox/delete')).body).toEqual({ ok: true })
    const storage = h.inboxes.storage(owner.inboxId)
    expect(
      storage.query('SELECT object_key AS key FROM pending_blob_delete')
    ).toEqual([{ key: keyOf(owner, blob) }])
    expect(h.r2.objects.size).toBe(1)
    // Still bound to the owner's key meanwhile.
    const intruder = await SigningKey.generate()
    expect(
      (
        await h.send('inbox/register', intruder, {
          inboxId: owner.inboxId,
          ownerPub: intruder.publicKey,
        })
      ).status
    ).toBe(409)

    advance(MINUTE_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(h.r2.objects.size).toBe(0)
    expect(storage.tables()).toEqual(['owner_tombstone'])
    expect(storage.alarm()).toBeNull()
  })

  it('adds the blob tables to inboxes from before photos', async () => {
    const owner = await photoOwner()
    const storage = h.inboxes.storage(owner.inboxId)
    for (const table of [
      'blob',
      'blob_upload',
      'pending_blob_delete',
      'blob_delete_backoff',
      'blob_sweep',
    ])
      storage.query(`DROP TABLE ${table}`)
    h.inboxes.restart(owner.inboxId)
    const blob = await photoBlob()
    expect((await owner.putBlob(blob)).status).toBe(200)
    expect((await owner.getBlob(blob)).status).toBe(200)
  })
})

describe('blob sweep', () => {
  /** An object under `owner`'s prefix with no row, as a failed cleanup leaves. */
  const stray = (owner: Owner, uploaded: number) => {
    const key = `v1/${owner.inboxId}/${b64u(randomBytes(32))}`
    h.r2.objects.set(key, { bytes: new Uint8Array(10), uploaded })
    return key
  }

  it('deletes objects no row knows each week, leaving new ones and other inboxes alone', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    await owner.putBlob(blob, { expiresAt: START + 30 * DAY_MS })
    const other = await photoOwner()
    const theirs = stray(other, START)
    const old = stray(owner, START)
    const storage = h.inboxes.storage(owner.inboxId)
    expect(storage.alarm()).toBe(START + 7 * DAY_MS)

    vi.setSystemTime(START + 7 * DAY_MS)
    // Ten minutes old: its upload may still be in flight.
    const fresh = stray(owner, Date.now() - 10 * MINUTE_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(h.r2.objects.has(old)).toBe(false)
    expect(h.r2.objects.has(fresh)).toBe(true)
    expect(h.r2.objects.has(keyOf(owner, blob))).toBe(true)
    expect(h.r2.objects.has(theirs)).toBe(true)
    expect(h.r2.calls).toContain(`list v1/${owner.inboxId}/`)
    // It still stores a photo, so it sweeps again in a week.
    expect(storage.alarm()).toBe(START + 14 * DAY_MS)

    vi.setSystemTime(START + 14 * DAY_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(h.r2.objects.has(fresh)).toBe(false)
  })

  it('sweeps again next week when listing fails', async () => {
    const owner = await photoOwner()
    await owner.putBlob(await photoBlob(), { expiresAt: START + 30 * DAY_MS })
    const old = stray(owner, START)
    const storage = h.inboxes.storage(owner.inboxId)

    vi.setSystemTime(START + 7 * DAY_MS)
    h.r2.failNext('list')
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(h.r2.objects.has(old)).toBe(true)
    expect(storage.alarm()).toBe(START + 14 * DAY_MS)

    vi.setSystemTime(START + 14 * DAY_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(h.r2.objects.has(old)).toBe(false)
  })
})

describe('blob caps', () => {
  /** Rows as if `count` blobs of `bytes` each were stored, expiring at `expiresAt`. */
  const seed = (
    owner: Owner,
    count: number,
    bytes: number,
    expiresAt = START + 10 * DAY_MS
  ) => {
    const storage = h.inboxes.storage(owner.inboxId)
    for (let i = 0; i < count; i++) {
      storage.query(
        `INSERT INTO blob (blob_id, bytes, token_hash, expires_at, created_at, written_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        b64u(randomBytes(32)),
        bytes,
        b64u(randomBytes(32)),
        expiresAt + i,
        START,
        START
      )
    }
  }

  it('caps live blobs per inbox, freeing room as they expire', async () => {
    const owner = await photoOwner()
    seed(owner, ABUSE.inboxBlobs - 1, 10)
    // Expired rows don't count.
    seed(owner, 5, 10, START - 100)
    const last = await photoBlob()
    expect((await owner.putBlob(last)).status).toBe(200)

    const refused = await owner.putBlob(await photoBlob())
    expect(refused).toMatchObject({
      status: 429,
      body: relayError('rate_limited', { retryAfter: 10 * 24 * 60 * 60 }),
    })
    expect(refused.headers.get('retry-after')).toBe(String(10 * 24 * 60 * 60))
    // A re-put of a stored blob isn't a new blob.
    expect((await owner.putBlob(last)).status).toBe(200)
    expect(h.r2.calls.filter((c) => c.startsWith('put'))).toHaveLength(1)

    advance(10 * DAY_MS)
    expect((await owner.putBlob(await photoBlob())).status).toBe(200)
  })

  it('caps live bytes per inbox', async () => {
    const owner = await photoOwner()
    seed(owner, 1, ABUSE.inboxBlobBytes - 2_000)
    expect((await owner.putBlob(await photoBlob(2_000))).status).toBe(200)
    expect(await owner.putBlob(await photoBlob(1))).toMatchObject({
      status: 429,
      body: relayError('rate_limited'),
    })
    expect(ABUSE.inboxBlobBytes).toBe(150 * MIB)
  })

  it('caps object writes per inbox per rolling day, re-puts that extend included', async () => {
    const owner = await photoOwner()
    const first = await photoBlob(64)
    expect((await owner.putBlob(first, {}, { headers: fresh() })).status).toBe(
      200
    )
    advance(HOUR)
    // A re-put that moves the expiry writes again, so it counts.
    expect(
      (
        await owner.putBlob(
          first,
          { expiresAt: START + 60 * DAY_MS },
          { headers: fresh() }
        )
      ).status
    ).toBe(200)
    for (let i = 2; i < ABUSE.blobUploads; i++) {
      const response = await owner.putBlob(
        await photoBlob(64),
        {},
        {
          headers: fresh(),
        }
      )
      expect(response.status).toBe(200)
    }
    const refused = await owner.putBlob(
      await photoBlob(64),
      {},
      {
        headers: fresh(),
      }
    )
    expect(refused).toMatchObject({
      status: 429,
      body: relayError('rate_limited', { retryAfter: 23 * 60 * 60 }),
    })
    // A plain retry of a stored blob writes nothing and still succeeds.
    expect((await owner.putBlob(first, {}, { headers: fresh() })).body).toEqual(
      { ok: true, expiresAt: START + 60 * DAY_MS }
    )
    // The oldest write ages out after a day.
    advance(23 * HOUR)
    expect(
      (await owner.putBlob(await photoBlob(64), {}, { headers: fresh() }))
        .status
    ).toBe(200)
  })

  it('limits uploads and downloads per caller at the edge', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob(16)
    expect((await owner.putBlob(blob)).status).toBe(200)
    for (let i = 0; i < ABUSE.edge.blobGet.perMinute; i++)
      expect((await owner.getBlob(blob)).status).toBe(200)
    const refused = await owner.getBlob(blob)
    expect(refused.status).toBe(429)
    expect(refused.body).toEqual(relayError('rate_limited'))
    expect(refused.headers.get('retry-after')).toBe('60')
  })
})

describe('photos switch', () => {
  it('turns blob ops off with photos_disabled and says so in inbox/sync', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    await owner.putBlob(blob)

    await h.kv.put('buddies:photos', 'off')
    const off = { status: 503, body: relayError('photos_disabled') }
    const put = await owner.putBlob(await photoBlob())
    expect(put).toMatchObject(off)
    expect(put.headers.get('retry-after')).toBe('60')
    expect(await owner.getBlob(blob)).toMatchObject(off)
    expect(await owner.send('blob/delete', { blobIds: [blob.blobId] })).toEqual(
      off
    )
    expect((await owner.sync()).body.capabilities).toEqual({ photos: false })
    // Everything else, and the stored blob, carry on.
    expect((await owner.send('roster/put', { blob: 'AAAA' })).status).toBe(200)

    await h.kv.put('buddies:photos', 'on')
    expect((await owner.sync()).body.capabilities).toEqual({ photos: true })
    expect((await owner.getBlob(blob)).bytes).toEqual(blob.bytes)
  })

  it('answers disabled first when Buddies itself is off', async () => {
    const owner = await photoOwner()
    const blob = await photoBlob()
    await owner.putBlob(blob)
    await h.kv.put('buddies:enabled', 'false')
    const disabled = { status: 503, body: relayError('disabled') }
    expect(await owner.putBlob(await photoBlob())).toMatchObject(disabled)
    expect(await owner.getBlob(blob)).toMatchObject(disabled)
    expect(await owner.send('blob/delete', { blobIds: [blob.blobId] })).toEqual(
      disabled
    )
    // inbox/delete still works, and takes the blobs with it.
    expect((await owner.send('inbox/delete')).body).toEqual({ ok: true })
    expect(h.r2.objects.size).toBe(0)
  })

  it('is off without the bucket binding, whatever the switch says', async () => {
    const harness = await createHarness({ blobBucket: false, kvPhotos: 'on' })
    const owner = await Owner.create(harness)
    expect((await owner.sync()).body.capabilities).toEqual({ photos: false })
    expect(await owner.putBlob(await photoBlob())).toMatchObject({
      status: 503,
      body: relayError('photos_disabled'),
    })
  })

  it('reads KV first and falls back to BUDDIES_PHOTOS when the key is absent', async () => {
    const photos = async (options: Parameters<typeof createHarness>[0]) => {
      const harness = await createHarness(options)
      const owner = await Owner.create(harness)
      return (await owner.sync()).body.capabilities.photos
    }
    expect(await photos({ photos: 'on' })).toBe(true)
    expect(await photos({ photos: '' })).toBe(false)
    expect(await photos({ photos: 'off' })).toBe(false)
    expect(await photos({ photos: '', kvPhotos: 'on' })).toBe(true)
    expect(await photos({ photos: '', kvPhotos: ' true ' })).toBe(true)
    expect(await photos({ photos: 'on', kvPhotos: 'off' })).toBe(false)
    expect(await photos({ photos: 'on', kvPhotos: 'yes' })).toBe(false)

    const kv = (value: string | Error | null) =>
      ({
        get: vi.fn(async () => {
          if (value instanceof Error) throw value
          return value
        }),
      }) as unknown as KVNamespace
    const store = kv('on')
    expect(await isBuddiesPhotosEnabled({ NOTES_KV: store })).toBe(true)
    expect(store.get).toHaveBeenCalledWith('buddies:photos', { cacheTtl: 60 })
    expect(
      await isBuddiesPhotosEnabled({
        NOTES_KV: kv(new Error('kv down')),
        BUDDIES_PHOTOS: 'on',
      })
    ).toBe(true)
    expect(await isBuddiesPhotosEnabled({ NOTES_KV: kv(null) })).toBe(false)
  })
})

const HOUR = 60 * MINUTE_MS
