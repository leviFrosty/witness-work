import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { ed25519 } from '@noble/curves/ed25519.js'
import { concatBytes, fromB64u, fromUtf8, utf8 } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import { registerAccount } from '@/lib/serverAccount/client'
import {
  deriveAccountSigningKey,
  signInboxLink,
} from '@/lib/serverAccount/keys'
import {
  ACCOUNTS_UNAVAILABLE_RETRY_MS,
  type CachedServerAccount,
  createServerAccount,
} from '@/lib/serverAccount/serverAccount'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

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

describe('registerAccount', () => {
  const key = deriveAccountSigningKey(random(32))

  it('sends a self-signed payload under the account context', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const { p, s } = JSON.parse(String(init?.body))
      const payload = fromB64u(p)
      expect(JSON.parse(fromUtf8(payload))).toMatchObject({
        accountPub: key.publicKey,
        ts: 1_000,
      })
      expect(
        ed25519.verify(
          fromB64u(s),
          concatBytes(utf8('ww-account/v1\naccount/register\n'), payload),
          fromB64u(key.publicKey)
        )
      ).toBe(true)
      return Response.json({
        ok: true,
        accountId: ACCOUNT_ID,
        status: 'active',
      })
    })
    await expect(
      registerAccount({
        baseUrl: 'https://api.test',
        key,
        now: () => 1_000,
        randomBytes: random,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ accountId: ACCOUNT_ID, status: 'active' })
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.test/accounts/v1/account/register'
    )
  })

  it("signs again once on the server's clock after `stale`", async () => {
    const stamps: number[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const { p } = JSON.parse(String(init?.body))
      stamps.push(JSON.parse(fromUtf8(fromB64u(p))).ts)
      return stamps.length === 1
        ? Response.json(
            { ok: false, error: 'stale', code: 'stale', serverTime: 9_000 },
            { status: 401 }
          )
        : Response.json({ ok: true, accountId: ACCOUNT_ID, status: 'active' })
    })
    await registerAccount({
      baseUrl: 'https://api.test',
      key,
      now: () => 1_000,
      randomBytes: random,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(stamps).toEqual([1_000, 9_000])
  })
})

describe('createServerAccount', () => {
  const registered = (accountId = ACCOUNT_ID) =>
    vi.fn(async () => ({ accountId, status: 'active' as const }))

  it('registers once per account key and remembers the id', async () => {
    const register = registered()
    const storage = memoryStorage()
    const account = createServerAccount({ register, storage, now: () => 0 })
    const accountKey = random(32)
    const [first, second] = await Promise.all([
      account.ensure(accountKey),
      account.ensure(accountKey),
    ])
    expect(first?.accountId).toBe(ACCOUNT_ID)
    expect(second?.accountId).toBe(ACCOUNT_ID)
    expect(register).toHaveBeenCalledTimes(1)
    await account.ensure(accountKey)
    expect(register).toHaveBeenCalledTimes(1)
    expect(storage.get()).toEqual({
      accountPub: deriveAccountSigningKey(accountKey).publicKey,
      accountId: ACCOUNT_ID,
    })
  })

  it('registers again for a different account key, or after forget', async () => {
    const register = registered()
    const account = createServerAccount({
      register,
      storage: memoryStorage(),
      now: () => 0,
    })
    const accountKey = random(32)
    await account.ensure(accountKey)
    await account.ensure(random(32))
    expect(register).toHaveBeenCalledTimes(2)
    account.forget()
    await account.ensure(accountKey)
    expect(register).toHaveBeenCalledTimes(3)
  })

  it('waits a day after the server says accounts are off', async () => {
    let now = 0
    const register = vi.fn(async () => {
      throw new HttpError('server', 503, 'disabled')
    })
    const account = createServerAccount({
      register,
      storage: memoryStorage(),
      now: () => now,
    })
    const accountKey = random(32)
    expect(await account.ensure(accountKey)).toBeNull()
    expect(await account.ensure(accountKey)).toBeNull()
    expect(register).toHaveBeenCalledTimes(1)
    now += ACCOUNTS_UNAVAILABLE_RETRY_MS + 1
    await account.ensure(accountKey)
    expect(register).toHaveBeenCalledTimes(2)
  })

  it('tries again next time after a failure that may pass', async () => {
    const register = vi.fn(async () => {
      throw new HttpError('offline')
    })
    const account = createServerAccount({
      register,
      storage: memoryStorage(),
      now: () => 0,
    })
    const accountKey = random(32)
    expect(await account.ensure(accountKey)).toBeNull()
    expect(await account.ensure(accountKey)).toBeNull()
    expect(register).toHaveBeenCalledTimes(2)
  })
})
