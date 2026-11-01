import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { describe, expect, it, type Mock, vi } from 'vitest'
import { concatBytes, fromB64u, fromUtf8, toB64u, utf8 } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import {
  deleteBackup,
  getBackup,
  listBackups,
  putBackup,
} from '@/lib/serverAccount/backupClient'
import type { AccountAuthorize } from '@/lib/serverAccount/client'
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
  const authorize = vi.fn(<T>(run: (authorization: string) => Promise<T>) =>
    run('Bearer access')
  ) as AccountAuthorize & Mock
  const options = {
    baseUrl: 'https://api.test',
    authorize,
    fetchImpl,
    sign: {
      baseUrl: 'https://api.test',
      key,
      now: () => 1_000_000,
      randomBytes: (length: number) => new Uint8Array(length).fill(1),
      fetchImpl,
    },
  }
  return { seen, options, authorize }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

function verified(op: string, payload: string, signature: string) {
  const payloadBytes = fromB64u(payload)
  expect(
    ed25519.verify(
      fromB64u(signature),
      concatBytes(utf8(`ww-account/v1\n${op}\n`), payloadBytes),
      fromB64u(key.publicKey)
    )
  ).toBe(true)
  return JSON.parse(fromUtf8(payloadBytes)) as Record<string, unknown>
}

describe('backup client', () => {
  it('puts the blob as the raw body with its slot and digest in headers', async () => {
    const blob = new Uint8Array([1, 2, 3, 4, 5])
    const { seen, options, authorize } = fakeFetch(() =>
      json(200, { ok: true, uploadedAt: 42 })
    )
    expect(await putBackup(options, SLOT, blob)).toEqual({ uploadedAt: 42 })
    expect(authorize).toHaveBeenCalledTimes(1)
    const [request] = seen
    expect(request.url).toBe('https://api.test/accounts/v1/backup/put')
    expect(request.headers).toMatchObject({
      authorization: 'Bearer access',
      'content-type': 'application/octet-stream',
      'x-ww-slot-id': SLOT,
      'x-ww-sha256': toB64u(sha256(blob)),
    })
    expect(request.headers).not.toHaveProperty('x-ww-payload')
    expect(request.body).toBe(blob)
  })

  it('surfaces the server’s codes', async () => {
    for (const [status, code] of [
      [413, 'too_large'],
      [429, 'limit'],
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

  it('lists and gets with the session token and JSON bodies', async () => {
    const blob = new Uint8Array([7, 8, 9])
    const { seen, options } = fakeFetch(({ url }) => {
      if (url.endsWith('/backup/list'))
        return json(200, {
          ok: true,
          slots: [{ slotId: SLOT, size: 3, uploadedAt: 10 }],
        })
      return new Response(blob, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      })
    })
    expect(await listBackups(options)).toEqual([
      { slotId: SLOT, size: 3, uploadedAt: 10 },
    ])
    expect(await getBackup(options, SLOT)).toEqual(blob)
    expect(seen.map((request) => request.headers.authorization)).toEqual([
      'Bearer access',
      'Bearer access',
    ])
    expect(seen.map((request) => JSON.parse(request.body as string))).toEqual([
      {},
      { slotId: SLOT },
    ])
  })

  it('deletes with the session token and the account key’s envelope', async () => {
    const { seen, options } = fakeFetch(() => json(200, { ok: true }))
    await deleteBackup(options, SLOT)
    await deleteBackup(options)
    const bodies = seen.map((request) => {
      expect(request.url).toBe('https://api.test/accounts/v1/backup/delete')
      expect(request.headers.authorization).toBe('Bearer access')
      const { payload, signature } = JSON.parse(request.body as string) as {
        payload: string
        signature: string
      }
      return verified('backup/delete', payload, signature)
    })
    expect(bodies[0]).toMatchObject({
      slotId: SLOT,
      accountPub: key.publicKey,
      ts: 1_000_000,
    })

    expect(bodies[1]).not.toHaveProperty('slotId')
  })

  it('signs a delete again with the server’s clock after `stale`', async () => {
    const { seen, options } = fakeFetch((_, index) =>
      index === 0
        ? json(401, { ok: false, code: 'stale', serverTime: 5_000_000 })
        : json(200, { ok: true })
    )
    await deleteBackup(options, SLOT)
    expect(seen).toHaveLength(2)
    const { payload, signature } = JSON.parse(seen[1].body as string) as {
      payload: string
      signature: string
    }
    expect(verified('backup/delete', payload, signature).ts).toBe(5_000_000)
  })

  it('refuses a malformed slot list', async () => {
    const { options } = fakeFetch(() =>
      json(200, { ok: true, slots: [{ slotId: 'short', size: 1 }] })
    )
    await expect(listBackups(options)).rejects.toBeInstanceOf(HttpError)
  })
})
