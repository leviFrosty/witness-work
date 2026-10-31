import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromB64u } from '@/lib/bytes'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  askSyncRequest,
  fetchSyncStatus,
  getSyncPhoto,
  listSyncSlots,
  photoDownloadTimeoutMs,
  photoPutWindowMs,
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
  const KIB = 1024
  const MIB = 1024 * KIB

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

  it('uploads 20 MiB at 120 KIB/s, which takes about three minutes', async () => {
    const { put, error, server } = await upload(20 * MIB, 120 * KIB)
    expect(error).toBeUndefined()
    expect(put).toMatchObject({ size: 20 * MIB, existed: false })
    expect(server.state.photoWrites).toHaveLength(1)
  })

  it('uploads the largest photo at the slowest link it allows for', async () => {
    const { put, error } = await upload(25 * MIB, 50 * KIB)
    expect(error).toBeUndefined()
    expect(put).toMatchObject({ size: 25 * MIB })
  })

  it('gives up on a link slower than that, as a timeout the engine retries', async () => {
    const { put, error, server } = await upload(25 * MIB, 40 * KIB)
    expect(put).toBeUndefined()
    expect(error).toMatchObject({ kind: 'timeout' })
    expect(server.state.photoWrites).toHaveLength(0)
  })

  it('times out before the server lets the reservation lapse', () => {
    for (const bytes of [1, MIB, 5 * MIB, 20 * MIB, 25 * MIB]) {
      expect(photoUploadTimeoutMs(bytes)).toBeLessThan(photoPutWindowMs(bytes))
    }
  })

  it('waits at least as long for a small photo as it always has', () => {
    expect(photoUploadTimeoutMs(100 * KIB)).toBeGreaterThanOrEqual(100_000)
  })

  it('waits the same window for a download, from the listed size', async () => {
    expect(photoDownloadTimeoutMs(20 * MIB)).toBe(photoPutWindowMs(20 * MIB))
    // Size unknown (not listed yet): the two-minute floor it always had.
    expect(photoDownloadTimeoutMs(undefined)).toBe(120_000)
  })

  const download = async (
    bytes: number,
    bytesPerSecond: number,
    sizeKnown: boolean
  ) => {
    vi.useFakeTimers()
    const { server, options } = setup()
    await putSyncSlot(options, SLOT, new Uint8Array([1]))
    await putSyncPhoto(options, {
      name: NAME,
      meta: 'bWV0YQ',
      blob: new Uint8Array(bytes).fill(7),
    })
    server.state.photoDownloadBytesPerSecond = bytesPerSecond
    server.state.log.length = 0
    const getting = getSyncPhoto(
      options,
      NAME,
      sizeKnown ? bytes : undefined
    ).then(
      (got): { got?: { blob: Uint8Array }; error?: unknown } => ({ got }),
      (error: unknown): { got?: { blob: Uint8Array }; error?: unknown } => ({
        error,
      })
    )
    await vi.advanceTimersByTimeAsync(25 * 60_000)
    return { server, ...(await getting) }
  }

  it('downloads 20 MiB at 120 KiB/s, which takes about three minutes', async () => {
    const { got, error } = await download(20 * MIB, 120 * KIB, true)
    expect(error).toBeUndefined()
    expect(got?.blob).toHaveLength(20 * MIB)
  })

  it('downloads the largest photo at the slowest link the window allows for', async () => {
    const { got, error } = await download(25 * MIB, 50 * KIB, true)
    expect(error).toBeUndefined()
    expect(got?.blob).toHaveLength(25 * MIB)
  })

  it('keeps the two-minute floor for a photo of unknown size', async () => {
    const { got, error } = await download(20 * MIB, 120 * KIB, false)
    expect(got).toBeUndefined()
    expect(error).toMatchObject({ kind: 'timeout' })
  })

  it('tries a download that timed out once, leaving the retry to the engine', async () => {
    const { server, error } = await download(25 * MIB, 40 * KIB, true)
    expect(error).toMatchObject({ kind: 'timeout' })
    expect(
      server.state.log.filter((line) => line.endsWith('sync/photos/get'))
    ).toHaveLength(1)
  })
})

// docs/cloud-sync-photos.md, "Slow links": the app's window and ww-api's
// reservation are the same formula, so both repos assert this table.
describe('the put window table in docs/cloud-sync-photos.md', () => {
  const unit = { B: 1, KiB: 1024, MiB: 1024 * 1024 } as const
  const rows = readFileSync(
    join(__dirname, '../../../../../docs/cloud-sync-photos.md'),
    'utf8'
  )
    .split('\n')
    .flatMap((line) => {
      const row =
        /^\|\s*(\d+) (B|KiB|MiB)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|$/.exec(line)
      return row
        ? [
            {
              bytes: Number(row[1]) * unit[row[2] as keyof typeof unit],
              window: Number(row[3]),
              timeout: Number(row[4]),
            },
          ]
        : []
    })

  it('lists the sizes, and the window and put timeout for each', () => {
    expect(rows.map(({ bytes }) => bytes)).toEqual([
      1,
      5 * 1024 ** 2,
      25 * 1024 ** 2,
    ])
    for (const { bytes, window, timeout } of rows) {
      expect(photoPutWindowMs(bytes)).toBe(window)
      expect(photoUploadTimeoutMs(bytes)).toBe(timeout)
    }
  })
})
