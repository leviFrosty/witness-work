import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { ed25519 } from '@noble/curves/ed25519.js'
import { concatBytes, fromB64u, fromUtf8, utf8 } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import {
  type AccountAuthorize,
  type ServerAccountInfo,
  fetchAccountInfo,
  sendSignedAccountOp,
} from '@/lib/serverAccount/client'
import {
  deriveAccountSigningKey,
  signInboxLink,
} from '@/lib/serverAccount/keys'
import {
  ACCOUNTS_UNAVAILABLE_RETRY_MS,
  type CachedServerAccount,
  createServerAccount,
  type ServerAccountDeps,
} from '@/lib/serverAccount/serverAccount'
import {
  AccountSessionError,
  type AccountSessionInfo,
} from '@/lib/serverAccount/session'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
const network = vi.hoisted(() => ({ online: null as boolean | null }))
vi.mock('@/lib/http/online', () => ({
  getOnline: () => network.online,
  isKnownOffline: () => network.online === false,
}))

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const ACCOUNT_ID = 'AAAAAAAAAAAAAAAAAAAAAA'

function memoryStorage() {
  let value: CachedServerAccount | null = null
  return {
    get: () => value,
    set: (next: CachedServerAccount | null) => {
      value = next
    },
  }
}

describe('account keys', () => {
  it('derive the same signing key from the same account key, and differ from Buddies keys', () => {
    const accountKey = random(32)
    const a = deriveAccountSigningKey(accountKey)
    expect(deriveAccountSigningKey(accountKey).publicKey).toBe(a.publicKey)
    expect(deriveAccountSigningKey(random(32)).publicKey).not.toBe(a.publicKey)
    expect(() => deriveAccountSigningKey(random(16))).toThrow()
  })

  it('sign an inbox link the account key verifies', () => {
    const key = deriveAccountSigningKey(random(32))
    const signature = signInboxLink(key, ACCOUNT_ID, 'inbox', 'owner')
    expect(
      ed25519.verify(
        fromB64u(signature),
        utf8(`ww-account/v1\ninbox/link\n${ACCOUNT_ID}\ninbox\nowner`),
        fromB64u(key.publicKey)
      )
    ).toBe(true)
  })
})

describe('fetchAccountInfo', () => {
  const key = deriveAccountSigningKey(random(32))
  const authorize: AccountAuthorize = (run) => run('Bearer access')
  const options = (fetchImpl: unknown) => ({
    baseUrl: 'https://api.test',
    authorize,
    fetchImpl: fetchImpl as typeof fetch,
  })
  const record = {
    ok: true,
    accountId: ACCOUNT_ID,
    accountPub: key.publicKey,
    status: 'suspended',
    createdAt: 500,
    inboxIds: ['inbox'],
    statusChanges: [{ status: 'suspended', createdAt: 900 }],
  }

  it('reads the account with the session token and no body', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer access'
      )
      expect(init?.method).toBe('GET')
      expect(init?.body).toBeUndefined()
      return Response.json(record)
    })
    const { ok: _ok, ...expected } = record
    await expect(fetchAccountInfo(options(fetchImpl))).resolves.toEqual(
      expected
    )
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.test/accounts/v1/account'
    )
  })

  it('throws the server code, and on a bad shape', async () => {
    const unknown = vi.fn(async () =>
      Response.json(
        { ok: false, error: 'unknown_account', code: 'unknown_account' },
        { status: 404 }
      )
    )
    await expect(fetchAccountInfo(options(unknown))).rejects.toMatchObject({
      serverCode: 'unknown_account',
    })
    const malformed = vi.fn(async () =>
      Response.json({ ...record, statusChanges: [{ status: 'gone' }] })
    )
    await expect(fetchAccountInfo(options(malformed))).rejects.toBeInstanceOf(
      HttpError
    )
  })
})

describe('sendSignedAccountOp', () => {
  const key = deriveAccountSigningKey(random(32))
  const options = (fetchImpl: unknown) => ({
    baseUrl: 'https://api.test',
    key,
    now: () => 1_000,
    randomBytes: random,
    fetchImpl: fetchImpl as typeof fetch,
  })

  it('signs the op and its fields under the account context', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(Object.keys(body)).toEqual(['payload', 'signature'])
      const payload = fromB64u(body.payload)
      expect(JSON.parse(fromUtf8(payload))).toMatchObject({
        slotId: 'slot',
        accountPub: key.publicKey,
        ts: 1_000,
      })
      expect(
        ed25519.verify(
          fromB64u(body.signature),
          concatBytes(utf8('ww-account/v1\nbackup/delete\n'), payload),
          fromB64u(key.publicKey)
        )
      ).toBe(true)
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer access'
      )
      return Response.json({ ok: true })
    })
    await sendSignedAccountOp(
      'backup/delete',
      { slotId: 'slot' },
      options(fetchImpl),
      { headers: { authorization: 'Bearer access' } }
    )
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.test/accounts/v1/backup/delete'
    )
  })

  it("signs again once on the server's clock after `stale`", async () => {
    const stamps: number[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const { payload } = JSON.parse(String(init?.body))
      stamps.push(JSON.parse(fromUtf8(fromB64u(payload))).ts)
      return stamps.length === 1
        ? Response.json(
            { ok: false, error: 'stale', code: 'stale', serverTime: 9_000 },
            { status: 401 }
          )
        : Response.json({ ok: true })
    })
    await sendSignedAccountOp('session/open', {}, options(fetchImpl))
    expect(stamps).toEqual([1_000, 9_000])
    // Signed as `session/open`, sent to the REST route.
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.test/accounts/v1/sessions'
    )
  })
})

/** Sessions that open once per account key until forgotten or closed. */
function fakeSessions(
  open: (accountKey: Uint8Array) => Promise<AccountSessionInfo> = async () => ({
    accountId: ACCOUNT_ID,
    status: 'active',
    sessionId: 'session',
  })
) {
  let live: { accountPub: string; info: Promise<AccountSessionInfo> } | null =
    null
  const opens = vi.fn(open)
  const sessions = {
    ensure: vi.fn(async (accountKey: Uint8Array) => {
      const accountPub = deriveAccountSigningKey(accountKey).publicKey
      if (live?.accountPub !== accountPub) {
        const info = opens(accountKey)
        live = { accountPub, info }
        // A failed open isn't kept.
        info.catch(() => {
          if (live?.info === info) live = null
        })
      }
      return live.info
    }),
    forget: vi.fn(() => {
      live = null
    }),
    close: vi.fn(async () => {
      live = null
    }),
    changeKey: async <T>(swap: () => Promise<T>) => {
      live = null
      return swap()
    },
    noteStatus: vi.fn(),
  } satisfies ServerAccountDeps['sessions']
  return { sessions, opens }
}

const failing = (error: Error) =>
  fakeSessions(async () => {
    throw error
  })

describe('createServerAccount', () => {
  it('opens one session per account key and remembers the id', async () => {
    const { sessions, opens } = fakeSessions()
    const storage = memoryStorage()
    const account = createServerAccount({ sessions, storage, now: () => 0 })
    const accountKey = random(32)
    const [first, second] = await Promise.all([
      account.ensure(accountKey),
      account.ensure(accountKey),
    ])
    expect(first?.accountId).toBe(ACCOUNT_ID)
    expect(second?.accountId).toBe(ACCOUNT_ID)
    await account.ensure(accountKey)
    expect(opens).toHaveBeenCalledTimes(1)
    expect(storage.get()).toEqual({
      accountPub: deriveAccountSigningKey(accountKey).publicKey,
      accountId: ACCOUNT_ID,
      status: 'active',
    })
  })

  it('opens again for a different account key, or after forget', async () => {
    const { sessions, opens } = fakeSessions()
    const account = createServerAccount({
      sessions,
      storage: memoryStorage(),
      now: () => 0,
    })
    const accountKey = random(32)
    await account.ensure(accountKey)
    await account.ensure(random(32))
    expect(opens).toHaveBeenCalledTimes(2)
    account.forget()
    expect(sessions.forget).toHaveBeenCalledTimes(1)
    await account.ensure(accountKey)
    expect(opens).toHaveBeenCalledTimes(3)
  })

  it('closes the session and forgets the account, never throwing', async () => {
    const { sessions } = fakeSessions()
    sessions.close.mockRejectedValueOnce(new Error('offline'))
    const storage = memoryStorage()
    const account = createServerAccount({ sessions, storage, now: () => 0 })
    await account.ensure(random(32))
    await expect(account.close()).resolves.toBeUndefined()
    expect(sessions.close).toHaveBeenCalledTimes(1)
    expect(storage.get()).toBeNull()
  })

  it('keeps a status a call reported, for this account key only', async () => {
    const { sessions } = fakeSessions()
    const storage = memoryStorage()
    const account = createServerAccount({ sessions, storage, now: () => 0 })
    const accountKey = random(32)
    const pub = deriveAccountSigningKey(accountKey).publicKey
    await account.ensure(accountKey)

    account.noteStatus(pub, 'suspended')
    expect(account.cached(accountKey)?.status).toBe('suspended')
    account.noteStatus(deriveAccountSigningKey(random(32)).publicKey, 'active')
    expect(account.cached(accountKey)?.status).toBe('suspended')
    account.noteStatus(pub, 'active')
    expect(account.cached(accountKey)).toEqual({
      accountPub: pub,
      accountId: ACCOUNT_ID,
      status: 'active',
    })
  })

  it('waits a day after the server says accounts are off, unless retried', async () => {
    let now = 0
    const { sessions, opens } = failing(
      new HttpError('server', 503, 'disabled')
    )
    const account = createServerAccount({
      sessions,
      storage: memoryStorage(),
      now: () => now,
    })
    const accountKey = random(32)
    expect(await account.ensure(accountKey)).toBeNull()
    expect(await account.ensure(accountKey)).toBeNull()
    expect(opens).toHaveBeenCalledTimes(1)
    await expect(
      account.connect(accountKey, { retry: true })
    ).rejects.toMatchObject({ failure: 'unavailable' })
    expect(opens).toHaveBeenCalledTimes(2)
    now += ACCOUNTS_UNAVAILABLE_RETRY_MS + 1
    await account.ensure(accountKey)
    expect(opens).toHaveBeenCalledTimes(3)
  })

  it('tries again next time after a failure that may pass', async () => {
    const { sessions, opens } = failing(new HttpError('offline'))
    const account = createServerAccount({
      sessions,
      storage: memoryStorage(),
      now: () => 0,
    })
    const accountKey = random(32)
    expect(await account.ensure(accountKey)).toBeNull()
    await expect(account.connect(accountKey)).rejects.toMatchObject({
      failure: 'offline',
    })
    expect(opens).toHaveBeenCalledTimes(2)
  })
})

describe('serverAccount.check', () => {
  const info = (status: 'active' | 'suspended' = 'active') =>
    vi.fn(
      async (): Promise<ServerAccountInfo> => ({
        accountId: ACCOUNT_ID,
        accountPub: '',
        status,
        createdAt: 0,
        inboxIds: [],
        statusChanges: [],
      })
    )

  it('opens the session, then keeps the status the server reads back', async () => {
    const { sessions } = fakeSessions()
    const account = createServerAccount({
      sessions,
      info: info('suspended'),
      storage: memoryStorage(),
      now: () => 0,
    })
    const accountKey = random(32)
    expect(await account.check(accountKey)).toEqual({
      state: 'suspended',
      accountId: ACCOUNT_ID,
    })
    expect(account.cached(accountKey)?.status).toBe('suspended')
    expect(account.cached(random(32))).toBeNull()
    expect(sessions.noteStatus).toHaveBeenCalledWith(
      deriveAccountSigningKey(accountKey).publicKey,
      'suspended'
    )
  })

  it('says offline with what it last knew, and unavailable while accounts are off', async () => {
    const readInfo = info()
    readInfo.mockRejectedValueOnce(new HttpError('offline'))
    const account = createServerAccount({
      sessions: fakeSessions().sessions,
      info: readInfo,
      storage: memoryStorage(),
      now: () => 0,
    })
    const accountKey = random(32)
    expect(await account.check(accountKey)).toEqual({
      state: 'offline',
      accountId: ACCOUNT_ID,
      lastStatus: 'active',
    })

    const off = createServerAccount({
      sessions: failing(new HttpError('server', 503, 'disabled')).sessions,
      info: info(),
      storage: memoryStorage(),
      now: () => 0,
    })
    expect(await off.check(accountKey)).toEqual({
      state: 'unavailable',
      accountId: null,
    })

    const unreachable = createServerAccount({
      sessions: failing(new HttpError('offline')).sessions,
      info: info(),
      storage: memoryStorage(),
      now: () => 0,
    })
    expect(await unreachable.check(accountKey)).toEqual({
      state: 'offline',
      accountId: null,
      lastStatus: null,
    })
  })

  it('says unreachable when the server fails or stays silent while online', async () => {
    network.online = true
    try {
      const accountKey = random(32)
      const checkWith = (error: Error) =>
        createServerAccount({
          sessions: failing(error).sessions,
          info: info(),
          storage: memoryStorage(),
          now: () => 0,
        }).check(accountKey)
      const unreachable = {
        state: 'unreachable',
        accountId: null,
        lastStatus: null,
      }
      expect(await checkWith(new HttpError('server', 503))).toEqual(unreachable)
      expect(await checkWith(new HttpError('timeout'))).toEqual(unreachable)
      expect(await checkWith(new HttpError('rateLimited', 429))).toEqual(
        unreachable
      )
      // Refused while the OS reports a connection: the server, not the phone.
      expect(await checkWith(new HttpError('offline'))).toEqual(unreachable)

      network.online = false
      expect(await checkWith(new HttpError('offline'))).toEqual({
        ...unreachable,
        state: 'offline',
      })
    } finally {
      network.online = null
    }
  })

  it("says when this device couldn't be verified, or needs an update", async () => {
    const accountKey = random(32)
    const storage = memoryStorage()
    await createServerAccount({
      sessions: fakeSessions().sessions,
      storage,
      now: () => 0,
    }).ensure(accountKey)
    const check = (error: Error) =>
      createServerAccount({
        sessions: failing(error).sessions,
        info: info(),
        storage,
        now: () => 0,
      }).check(accountKey)
    expect(
      await check(
        new AccountSessionError('attestation', { attestation: 'device' })
      )
    ).toEqual({ state: 'unverified', problem: 'device', accountId: ACCOUNT_ID })
    expect(
      await check(
        new HttpError('client', 403, 'attestation_failed', null, undefined, {
          ok: false,
          code: 'attestation_failed',
          reason: 'integrity_unavailable',
        })
      )
    ).toEqual({
      state: 'unverified',
      problem: 'temporary',
      accountId: ACCOUNT_ID,
    })
    expect(
      await check(new HttpError('client', 426, 'upgrade_required'))
    ).toEqual({ state: 'updateRequired', accountId: ACCOUNT_ID })
  })
})
