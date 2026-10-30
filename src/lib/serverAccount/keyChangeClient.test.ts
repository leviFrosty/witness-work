import { ed25519 } from '@noble/curves/ed25519.js'
import { describe, expect, it, vi } from 'vitest'
import { concatBytes, fromB64u, fromUtf8, utf8 } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import {
  type AccountAuthorize,
  fetchAccountInfo,
} from '@/lib/serverAccount/client'
import {
  appendKeyHistory,
  historyKeys,
  historyPhotoKeys,
  keyHistoryEntry,
} from '@/lib/serverAccount/keyHistory'
import { sendSessionOpen } from '@/lib/serverAccount/sessionClient'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  fetchKeyHistory,
  rekeyAccount,
} from '@/lib/serverAccount/keyChangeClient'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))

const K1 = new Uint8Array(32).fill(1)
const K2 = new Uint8Array(32).fill(2)
const old = deriveAccountSigningKey(K1)
const next = deriveAccountSigningKey(K2)

type Seen = { url: string; method: string; headers: Record<string, string> }

function fakeWorker(respond: (seen: Seen, body: unknown) => Response) {
  const seen: (Seen & { body: unknown })[] = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const entry = {
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    }
    seen.push(entry)
    return respond(entry, entry.body)
  }) as unknown as typeof fetch
  const authorize: AccountAuthorize = (run) => run('Bearer access')
  return {
    seen,
    options: {
      baseUrl: 'https://api.test',
      authorize,
      fetchImpl,
      now: () => 1_000_000,
      randomBytes: (length: number) => new Uint8Array(length).fill(4),
    },
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const verifies = (
  context: string,
  payload: Uint8Array,
  signature: string,
  publicKey: string
) =>
  ed25519.verify(
    fromB64u(signature),
    concatBytes(utf8(context), payload),
    fromB64u(publicKey)
  )

const request = {
  oldKey: K1,
  newKey: K2,
  keyEpoch: 3,
  history: 'sealed-history',
  device: 'sealed-label',
}

describe('account/rekey', () => {
  it('sends a payload both keys sign, with the session’s token', async () => {
    const { seen, options } = fakeWorker(() =>
      json(200, {
        ok: true,
        keyEpoch: 4,
        accessToken: 'new-access',
        accessExpiresAt: 2_000_000,
      })
    )
    expect(await rekeyAccount(request, options)).toEqual({
      outcome: 'committed',
      keyEpoch: 4,
      accessToken: 'new-access',
      accessExpiresAt: 2_000_000,
    })
    const [sent] = seen
    expect(sent.url).toBe('https://api.test/accounts/v1/account/rekey')
    expect(sent.method).toBe('POST')
    expect(sent.headers.authorization).toBe('Bearer access')
    const body = sent.body as {
      payload: string
      signature: string
      newSignature: string
    }
    const payload = fromB64u(body.payload)
    expect(
      verifies(
        'ww-account/v1\naccount/rekey\n',
        payload,
        body.signature,
        old.publicKey
      )
    ).toBe(true)
    expect(
      verifies(
        'ww-account/v1\naccount/rekey/new\n',
        payload,
        body.newSignature,
        next.publicKey
      )
    ).toBe(true)
    // Neither signature verifies in the other's context.
    expect(
      verifies(
        'ww-account/v1\naccount/rekey\n',
        payload,
        body.newSignature,
        next.publicKey
      )
    ).toBe(false)
    expect(JSON.parse(fromUtf8(payload))).toEqual({
      accountPub: old.publicKey,
      newAccountPub: next.publicKey,
      keyEpoch: 3,
      history: 'sealed-history',
      device: 'sealed-label',
      ts: 1_000_000,
      nonce: 'BAQEBAQEBAQEBAQEBAQEBA',
    })
  })

  it('carries a passkey wrap when there is one', async () => {
    const { seen, options } = fakeWorker(() =>
      json(200, {
        ok: true,
        keyEpoch: 1,
        accessToken: 'a',
        accessExpiresAt: 5,
      })
    )
    const passkeyWrap = { credentialId: 'c', wrapId: 'w', wrap: 'x' }
    await rekeyAccount({ ...request, device: undefined, passkeyWrap }, options)
    const payload = JSON.parse(
      fromUtf8(fromB64u((seen[0].body as { payload: string }).payload))
    )
    expect(payload.passkeyWrap).toEqual(passkeyWrap)
    expect(payload).not.toHaveProperty('device')
  })

  it('answers the refusals a key change expects as outcomes', async () => {
    const cases: [number, unknown, unknown][] = [
      [
        409,
        { ok: false, error: 'conflict', keyEpoch: 5 },
        { outcome: 'conflict', keyEpoch: 5 },
      ],
      [
        403,
        { ok: false, error: 'key_retired', changedAt: 77 },
        { outcome: 'keyRetired', changedAt: 77 },
      ],
      [
        403,
        { ok: false, error: 'session_too_new' },
        { outcome: 'sessionTooNew' },
      ],
      [
        403,
        { ok: false, error: 'step_up_required' },
        { outcome: 'stepUpRequired' },
      ],
    ]
    for (const [status, body, outcome] of cases) {
      const { options } = fakeWorker(() => json(status, body))
      expect(await rekeyAccount(request, options)).toEqual(outcome)
    }
  })

  it('reads 401 key_changed as a change to check, never signing it again', async () => {
    const { seen, options } = fakeWorker(() =>
      json(401, { ok: false, error: 'unauthorized', reason: 'key_changed' })
    )
    // As the session client does: a 401 for the token refreshes and runs again.
    const authorize: AccountAuthorize = async (run) => {
      try {
        return await run('Bearer access')
      } catch (error) {
        if (
          error instanceof HttpError &&
          error.status === 401 &&
          error.serverCode === 'unauthorized'
        )
          return run('Bearer refreshed')
        throw error
      }
    }
    expect(await rekeyAccount(request, { ...options, authorize })).toEqual({
      outcome: 'keyChanged',
    })
    expect(seen).toHaveLength(1)
  })

  it('throws anything else', async () => {
    for (const [status, body] of [
      [403, { ok: false, error: 'forbidden' }],
      [429, { ok: false, error: 'rate_limited' }],
      [200, { ok: true }],
    ] as const) {
      const { options } = fakeWorker(() => json(status, body))
      await expect(rekeyAccount(request, options)).rejects.toBeInstanceOf(
        HttpError
      )
    }
  })

  it('refuses to move the account to the key it already has', async () => {
    const { options, seen } = fakeWorker(() => json(200, {}))
    await expect(
      rekeyAccount({ ...request, newKey: K1 }, options)
    ).rejects.toThrow()
    expect(seen).toHaveLength(0)
  })
})

describe('account/key-history', () => {
  it('reads the stored history and the account’s epoch', async () => {
    const { seen, options } = fakeWorker(() =>
      json(200, { ok: true, keyEpoch: 2, history: 'blob' })
    )
    expect(await fetchKeyHistory(options)).toEqual({
      keyEpoch: 2,
      history: 'blob',
    })
    expect(seen[0].url).toBe('https://api.test/accounts/v1/account/key-history')
    expect(seen[0].method).toBe('GET')
  })

  it('reads an account whose key never changed', async () => {
    const { options } = fakeWorker(() =>
      json(200, { ok: true, keyEpoch: 0, history: null })
    )
    expect(await fetchKeyHistory(options)).toEqual({
      keyEpoch: 0,
      history: null,
    })
  })

  it('throws an answer it can’t read', async () => {
    const { options } = fakeWorker(() => json(200, { ok: true, history: 3 }))
    await expect(fetchKeyHistory(options)).rejects.toBeInstanceOf(HttpError)
  })
})

describe('GET /account', () => {
  const info = {
    ok: true,
    accountId: 'A'.repeat(22),
    accountPub: old.publicKey,
    status: 'active',
    createdAt: 1,
    inboxIds: [],
    statusChanges: [],
  }

  it('reads the account’s key epoch', async () => {
    const { options } = fakeWorker(() => json(200, { ...info, keyEpoch: 2 }))
    expect((await fetchAccountInfo(options)).keyEpoch).toBe(2)
  })

  it('reads a server without key epochs as epoch 0', async () => {
    const { options } = fakeWorker(() => json(200, info))
    expect((await fetchAccountInfo(options)).keyEpoch).toBe(0)
  })
})

describe('POST /sessions into a known account', () => {
  const opened = {
    ok: true,
    accountId: 'A'.repeat(22),
    status: 'active',
    sessionId: 's1',
    accessToken: 'a',
    accessExpiresAt: 2,
    refreshToken: 'r',
    sessionExpiresAt: 3,
  }
  const open = (accountId?: string) => {
    const worker = fakeWorker(() => json(201, opened))
    return sendSessionOpen(
      { proof: { kind: 'devBypass', token: 'dev' }, accountId },
      { ...worker.options, key: next }
    ).then(() => {
      const body = worker.seen[0].body as { payload: string }
      return JSON.parse(fromUtf8(fromB64u(body.payload)))
    })
  }

  it('names the account in the signed payload when it’s known', async () => {
    expect((await open('A'.repeat(22))).accountId).toBe('A'.repeat(22))
    expect(await open()).not.toHaveProperty('accountId')
  })

  it('reads 404 unknown_account as the key not being that account’s', async () => {
    const worker = fakeWorker(() =>
      json(404, { ok: false, error: 'unknown_account' })
    )
    const error = await sendSessionOpen(
      { proof: { kind: 'devBypass', token: 'dev' }, accountId: 'A'.repeat(22) },
      { ...worker.options, key: next }
    ).catch((failure: unknown) => failure)
    expect((error as HttpError).serverCode).toBe('unknown_account')
  })
})

describe('key history photo keys', () => {
  it('pairs each older key’s photo name key with its photo key, newest first', () => {
    const history = appendKeyHistory(
      appendKeyHistory(null, keyHistoryEntry(K1, 0, 1)),
      keyHistoryEntry(K2, 1, 2)
    )
    expect(historyPhotoKeys(history)).toEqual([
      {
        name: historyKeys(history, 'syncPhotoName')[0],
        photo: historyKeys(history, 'syncPhoto')[0],
      },
      {
        name: historyKeys(history, 'syncPhotoName')[1],
        photo: historyKeys(history, 'syncPhoto')[1],
      },
    ])
  })
})
