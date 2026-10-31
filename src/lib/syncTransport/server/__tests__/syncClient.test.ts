import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromB64u } from '@/lib/bytes'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  askSyncRequest,
  fetchSyncStatus,
  listSyncSlots,
  photoUploadTimeoutMs,
  putSyncPhoto,
  putSyncSlot,
  type SyncPhotoPut,
  withdrawSyncRequest,
} from '@/lib/syncTransport/server/syncClient'
import { createFakeSyncServer } from './fakeSyncServer'

// The Cloud Sync request (docs/cloud-sync-photos.md, "The Cloud Sync
// request"): `POST /accounts/v1/sync/request` and `requestedAt` in the status.

const SLOT = 'slot-aaaaaaaa'

function setup(account = 'family') {
  const server = createFakeSyncServer()
  server.state.supporters.add(account)
  const accountKey = new Uint8Array(32).fill(account.length)
  let nonce = 0
  const options = {
    baseUrl: 'https://api.test',
    authorize: <T>(run: (authorization: string) => Promise<T>) =>
      run(`Bearer ${account}`),
    fetchImpl: server.fetch,
    sign: {
      baseUrl: 'https://api.test',
      key: deriveAccountSigningKey(accountKey),
      now: () => 1_000,
      randomBytes: (length: number) => new Uint8Array(length).fill(++nonce),
      fetchImpl: server.fetch,
    },
  }
  return { server, options }
}

describe('the Cloud Sync request', () => {
  it('reads no request from a status without one, or from an older server', async () => {
    const { options } = setup()
    expect((await fetchSyncStatus(options)).requestedAt).toBeNull()

    const older = {
      ...options,
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            ok: true,
            enabled: true,
            entitled: true,
            entitlement: 'everyone',
            supporter: false,
          }),
          { headers: { 'content-type': 'application/json' } }
        )) as typeof fetch,
    }
    expect((await fetchSyncStatus(older)).requestedAt).toBeNull()
  })

  it('asks with the session and the account key’s envelope, and keeps the first time', async () => {
    const { server, options } = setup()
    server.state.now = 5_000
    expect(await askSyncRequest(options)).toBe(5_000)
    server.state.now = 9_000
    expect(await askSyncRequest(options)).toBe(5_000)
    expect((await fetchSyncStatus(options)).requestedAt).toBe(5_000)

    const sent = server.state.requestBodies.at(-1)!
    expect(sent.requested).toBe(true)
    expect(sent.authorization).toBe('Bearer family')
    const payload = JSON.parse(
      new TextDecoder().decode(fromB64u(sent.payload as string))
    )
    expect(Object.keys(payload).sort()).toEqual(['accountPub', 'nonce', 'ts'])
    expect(payload.accountPub).toBe(options.sign.key.publicKey)
    expect(typeof sent.signature).toBe('string')
  })

  it('signs every ask afresh, and never resends one the server may have used', async () => {
    const { server, options } = setup()
    await askSyncRequest(options)
    await askSyncRequest(options)
    const [first, second] = server.state.requestBodies
    expect(first.payload).not.toBe(second.payload)

    // The answer is lost after the server took the envelope: no retry with the
    // same one (a 409 `replay`); the User taps Turn On again.
    server.state.dropNextAnswer = true
    await expect(askSyncRequest(options)).rejects.toBeDefined()
    expect(server.state.requestBodies).toHaveLength(3)
  })

  it('refuses an envelope used before', async () => {
    const { server, options } = setup()
    await askSyncRequest(options)
    const used = server.state.requestBodies[0]
    const response = await server.fetch(
      'https://api.test/accounts/v1/sync/request',
      {
        method: 'POST',
        headers: { authorization: 'Bearer family' },
        body: JSON.stringify({
          requested: true,
          payload: used.payload,
          signature: used.signature,
        }),
      }
    )
    expect(response.status).toBe(409)
  })

  it('refuses an ask without the envelope', async () => {
    const { server, options } = setup()
    const response = await server.fetch(
      'https://api.test/accounts/v1/sync/request',
      {
        method: 'POST',
        headers: { authorization: 'Bearer family' },
        body: JSON.stringify({ requested: true }),
      }
    )
    expect(response.status).toBe(400)
    expect((await fetchSyncStatus(options)).requestedAt).toBeNull()
  })

  it('withdraws it with the session alone, every time', async () => {
    const { server, options } = setup()
    await askSyncRequest(options)
    await withdrawSyncRequest(options)
    await withdrawSyncRequest(options)
    expect((await fetchSyncStatus(options)).requestedAt).toBeNull()
    expect(server.state.requestBodies.at(-1)).toMatchObject({
      requested: false,
    })
  })

  it('keeps accounts apart', async () => {
    const family = setup('family')
    const other = {
      ...family.options,
      authorize: <T>(run: (authorization: string) => Promise<T>) =>
        run('Bearer other'),
    }
    family.server.state.supporters.add('other')
    await askSyncRequest(family.options)
    expect((await fetchSyncStatus(other)).requestedAt).toBeNull()
  })

  it('throws the server’s refusal when it can’t ask', async () => {
    const { server, options } = setup()
    server.state.supporters.clear()
    await expect(askSyncRequest(options)).rejects.toMatchObject({
      serverCode: 'supporter_required',
    })
    server.state.enabled = false
    await expect(askSyncRequest(options)).rejects.toMatchObject({
      serverCode: 'disabled',
    })
    // Withdrawing always works.
    await expect(withdrawSyncRequest(options)).resolves.toBeUndefined()
  })
})

describe('sync/list', () => {
  it('says which platform last wrote each slot, and whether its session is live', async () => {
    const { server, options } = setup()
    server.state.platform = 'android'
    await putSyncSlot(options, SLOT, new Uint8Array([1, 2, 3]))
    expect((await listSyncSlots(options)).slots).toEqual([
      expect.objectContaining({
        slotId: SLOT,
        platform: 'android',
        live: true,
      }),
    ])
    server.endSessions('family')
    expect((await listSyncSlots(options)).slots[0]).toMatchObject({
      live: false,
    })
  })

  it('reads a slot from an older server as of no known platform', async () => {
    const older = {
      baseUrl: 'https://api.test',
      authorize: <T>(run: (authorization: string) => Promise<T>) =>
        run('Bearer family'),
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            ok: true,
            seq: 1,
            slots: [{ slotId: SLOT, etag: 'e', size: 1, updatedAt: 1 }],
          }),
          { headers: { 'content-type': 'application/json' } }
        )) as typeof fetch,
    }
    expect((await listSyncSlots(older)).slots[0]).toMatchObject({
      platform: null,
      live: false,
    })
  })
})

describe('a photo over a slow link', () => {
  const NAME = 'a'.repeat(43)
  const KB = 1024
  const MIB = 1024 * KB

  afterEach(() => vi.useRealTimers())

  const upload = async (bytes: number, bytesPerSecond: number) => {
    vi.useFakeTimers()
    const { server, options } = setup()
    server.state.photoUploadBytesPerSecond = bytesPerSecond
    await putSyncSlot(options, SLOT, new Uint8Array([1]))
    const blob = new Uint8Array(bytes).fill(7)
    const putting = putSyncPhoto(options, { name: NAME, meta: 'bWV0YQ', blob })
    const outcome = putting.then(
      (put): { put?: SyncPhotoPut; error?: unknown } => ({ put }),
      (error: unknown): { put?: SyncPhotoPut; error?: unknown } => ({ error })
    )
    await vi.advanceTimersByTimeAsync(11 * 60_000)
    return { server, ...(await outcome) }
  }

  it('uploads 20 MiB at 120 KB/s, which takes about three minutes', async () => {
    const { put, error, server } = await upload(20 * MIB, 120 * KB)
    expect(error).toBeUndefined()
    expect(put).toMatchObject({ size: 20 * MIB, existed: false })
    expect(server.state.photoWrites).toHaveLength(1)
  })

  it('uploads the largest photo at the slowest link it allows for', async () => {
    const { put, error } = await upload(25 * MIB, 50 * KB)
    expect(error).toBeUndefined()
    expect(put).toMatchObject({ size: 25 * MIB })
  })

  it('gives up on a link slower than that, as a timeout the engine retries', async () => {
    const { put, error, server } = await upload(25 * MIB, 40 * KB)
    expect(put).toBeUndefined()
    expect(error).toMatchObject({ kind: 'timeout' })
    expect(server.state.photoWrites).toHaveLength(0)
  })

  it('times out before the server lets the reservation lapse', () => {
    for (const bytes of [1, MIB, 5 * MIB, 20 * MIB, 25 * MIB]) {
      const window = Math.min(
        10 * 60_000,
        Math.max(2 * 60_000, 60_000 + (bytes / (50 * KB)) * 1000)
      )
      expect(photoUploadTimeoutMs(bytes)).toBeLessThan(window)
    }
  })

  it('waits at least as long for a small photo as it always has', () => {
    expect(photoUploadTimeoutMs(100 * KB)).toBeGreaterThanOrEqual(100_000)
  })
})
