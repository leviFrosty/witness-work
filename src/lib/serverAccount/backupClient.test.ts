import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { describe, expect, it, vi } from 'vitest'
import { concatBytes, fromB64u, fromUtf8, toB64u, utf8 } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import {
  deleteBackup,
  getBackup,
  listBackups,
  putBackup,
} from '@/lib/serverAccount/backupClient'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))

const key = deriveAccountSigningKey(new Uint8Array(32).fill(3))
const SLOT = 'S'.repeat(22)

type Seen = {
  url: string
  headers: Record<string, string>
  body: Uint8Array | string | undefined
}

/** A fake worker: records requests, answers from `respond`. */
function fakeFetch(respond: (seen: Seen, index: number) => Response) {
  const seen: Seen[] = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const entry = {
      url,
      headers: init.headers as Record<string, string>,
      body: init.body as Uint8Array | string | undefined,
    }
    seen.push(entry)
    return respond(entry, seen.length - 1)
  }) as unknown as typeof fetch
  const options = {
    baseUrl: 'https://api.test',
    key,
    now: () => 1_000_000,
    randomBytes: (length: number) => new Uint8Array(length).fill(1),
    fetchImpl,
  }
  return { seen, options }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** Checks the envelope's signature the way the worker does, and returns `p`. */
function verified(op: string, p: string, s: string) {
  const payload = fromB64u(p)
  expect(
    ed25519.verify(
      fromB64u(s),
      concatBytes(utf8(`ww-account/v1\n${op}\n`), payload),
      fromB64u(key.publicKey)
    )
  ).toBe(true)
  return JSON.parse(fromUtf8(payload)) as Record<string, unknown>
}

describe('backup client', () => {
  it('puts the blob as the raw body with the envelope in headers', async () => {
    const blob = new Uint8Array([1, 2, 3, 4, 5])
    const { seen, options } = fakeFetch(() =>
      json(200, { ok: true, uploadedAt: 42 })
    )
    expect(await putBackup(options, SLOT, blob)).toEqual({ uploadedAt: 42 })
    const [request] = seen
    expect(request.url).toBe('https://api.test/accounts/v1/backup/put')
    expect(request.headers['content-type']).toBe('application/octet-stream')
    expect(request.body).toBe(blob)
    const payload = verified(
      'backup/put',
      request.headers['x-ww-p'],
      request.headers['x-ww-s']
    )
    expect(payload).toMatchObject({
      slotId: SLOT,
      size: 5,
      sha256: toB64u(sha256(blob)),
      accountPub: key.publicKey,
      ts: 1_000_000,
    })
  })

  it('signs again with the server’s clock after `stale`', async () => {
    const { seen, options } = fakeFetch((_, index) =>
      index === 0
        ? json(401, { ok: false, code: 'stale', serverTime: 5_000_000 })
        : json(200, { ok: true, uploadedAt: 1 })
    )
    await putBackup(options, SLOT, new Uint8Array([9]))
    expect(seen).toHaveLength(2)
    expect(
      verified(
        'backup/put',
        seen[1].headers['x-ww-p'],
        seen[1].headers['x-ww-s']
      ).ts
    ).toBe(5_000_000)
  })

  it('surfaces the server’s codes', async () => {
    for (const [status, code] of [
      [413, 'too_large'],
      [409, 'limit'],
      [429, 'rate_limited'],
      [503, 'disabled'],
    ] as const) {
      const { options } = fakeFetch(() => json(status, { ok: false, code }))
      const error = await putBackup(options, SLOT, new Uint8Array([1])).catch(
        (failure: unknown) => failure
      )
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).serverCode).toBe(code)
    }
  })

  it('lists, gets, and deletes with JSON envelopes', async () => {
    const blob = new Uint8Array([7, 8, 9])
    const { seen, options } = fakeFetch(({ url }) => {
      if (url.endsWith('/backup/list'))
        return json(200, {
          ok: true,
          slots: [{ slotId: SLOT, size: 3, uploadedAt: 10 }],
        })
      if (url.endsWith('/backup/get'))
        return new Response(blob, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        })
      return json(200, { ok: true })
    })
    expect(await listBackups(options)).toEqual([
      { slotId: SLOT, size: 3, uploadedAt: 10 },
    ])
    expect(await getBackup(options, SLOT)).toEqual(blob)
    await deleteBackup(options, SLOT)
    await deleteBackup(options)
    const bodies = seen.map((request) => {
      const { p, s } = JSON.parse(request.body as string) as {
        p: string
        s: string
      }
      return verified(request.url.split('/v1/')[1], p, s)
    })
    expect(bodies[0]).not.toHaveProperty('slotId')
    expect(bodies[1].slotId).toBe(SLOT)
    expect(bodies[2].slotId).toBe(SLOT)
    // Every slot: no slotId at all.
    expect(bodies[3]).not.toHaveProperty('slotId')
  })

  it('refuses a malformed slot list', async () => {
    const { options } = fakeFetch(() =>
      json(200, { ok: true, slots: [{ slotId: 'short', size: 1 }] })
    )
    await expect(listBackups(options)).rejects.toBeInstanceOf(HttpError)
  })
})
