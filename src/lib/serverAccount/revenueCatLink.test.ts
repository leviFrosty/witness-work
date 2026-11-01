import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError, type RequestOptions } from '@/lib/http/request'
import {
  LINK_REFRESH_MS,
  UNAVAILABLE_DEFAULT_MS,
  createRevenueCatLink,
  linkKey,
  toRevenueCatAppUserId,
  type RevenueCatLinkDeps,
} from '@/lib/serverAccount/revenueCatLink'
import { AccountSessionError } from '@/lib/serverAccount/session'

const ACCOUNT = 'AAAAAAAAAAAAAAAAAAAAAA'
const RC_ID = 'install-uuid-1234'

let now: number
let stored: string | null
let account: string | null
let appUserId: string | null
let answer: () => Promise<unknown>
let requests: RequestOptions[]
let opened: number
let deps: RevenueCatLinkDeps

beforeEach(() => {
  now = Date.UTC(2026, 9, 18, 12)
  stored = null
  account = ACCOUNT
  appUserId = RC_ID
  requests = []
  opened = 0
  answer = async () => ({ ok: true, supporter: true, expiresAt: null })
  deps = {
    baseUrl: 'https://api.test',
    request: (async (options: RequestOptions) => {
      requests.push(options)
      return { data: await answer(), status: 200, headers: new Headers() }
    }) as RevenueCatLinkDeps['request'],
    currentAccount: async () => account,
    openAccount: async () => {
      opened++
      return ACCOUNT
    },
    appUserId: async () => appUserId,
    storage: {
      get: () => stored,
      set: (value) => {
        stored = value
      },
    },
    now: () => now,
  }
})

describe('toRevenueCatAppUserId', () => {
  it.each(['install-uuid-1234', 'A1B2C3D4-0000-4000-8000-000000000001'])(
    'accepts %s',
    (id) => expect(toRevenueCatAppUserId(id)).toBe(id)
  )

  it.each([
    '$RCAnonymousID:0123456789abcdef',
    'short',
    '',
    'a'.repeat(65),
    null,
    undefined,
  ])('refuses %s', (id) => expect(toRevenueCatAppUserId(id)).toBeUndefined())
})

describe('ensure', () => {
  it('links the RevenueCat id to the account and remembers only a hash', async () => {
    const link = createRevenueCatLink(deps)
    await expect(link.ensure({ reason: 'launch' })).resolves.toEqual({
      result: 'linked',
      supporter: true,
      expiresAt: null,
    })
    expect(requests).toEqual([
      expect.objectContaining({
        url: 'https://api.test/accounts/v1/revenuecat-customers',
        method: 'POST',
        json: { appUserId: RC_ID },
      }),
    ])
    expect(stored).not.toContain(RC_ID)
    expect(stored).not.toContain(ACCOUNT)
    expect(JSON.parse(stored!)).toEqual({
      key: linkKey(ACCOUNT, RC_ID),
      at: now,
    })
  })

  it('repeats a link at most daily unless forced', async () => {
    const link = createRevenueCatLink(deps)
    await link.ensure({ reason: 'launch' })
    now += LINK_REFRESH_MS - 1
    await expect(link.ensure({ reason: 'foreground' })).resolves.toEqual({
      result: 'skipped',
    })
    await link.ensure({ force: true, reason: 'entitlements' })
    expect(requests).toHaveLength(2)
    now += LINK_REFRESH_MS
    await link.ensure({ reason: 'foreground' })
    expect(requests).toHaveLength(3)
  })

  it('links again when the account or RevenueCat id changes', async () => {
    const link = createRevenueCatLink(deps)
    await link.ensure({ reason: 'launch' })
    appUserId = 'adopted-shared-id-0001'
    await link.ensure({ reason: 'adopted' })
    account = 'BBBBBBBBBBBBBBBBBBBBBB'
    await link.ensure({ reason: 'account_changed' })
    expect(requests).toHaveLength(3)
  })

  it('never opens a session unless asked', async () => {
    account = null
    const link = createRevenueCatLink(deps)
    await expect(link.ensure({ reason: 'launch' })).resolves.toEqual({
      result: 'no_session',
    })
    expect(opened).toBe(0)
    await link.ensure({ open: true, reason: 'paid_call' })
    expect(opened).toBe(1)
    expect(requests).toHaveLength(1)
  })

  it('sends nothing without a RevenueCat id the server accepts', async () => {
    appUserId = '$RCAnonymousID:0123456789abcdef'
    const link = createRevenueCatLink(deps)
    await expect(link.ensure({ reason: 'launch' })).resolves.toEqual({
      result: 'no_customer',
    })
    expect(requests).toHaveLength(0)
  })

  it('runs one link at a time, and runs a forced one after a routine one', async () => {
    let release!: () => void
    answer = () =>
      new Promise((resolve) => {
        release = () => resolve({ ok: true, supporter: false, expiresAt: null })
      })
    const link = createRevenueCatLink(deps)
    const first = link.ensure({ reason: 'launch' })
    const second = link.ensure({ reason: 'foreground' })
    const forced = link.ensure({ force: true, reason: 'entitlements' })
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    release()
    expect(await first).toBe(await second)
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    release()
    await expect(forced).resolves.toMatchObject({ result: 'linked' })
  })

  it('waits out a 503 Retry-After, except when the User asks', async () => {
    answer = async () => {
      throw new HttpError('server', 503, 'unavailable', 30_000)
    }
    const link = createRevenueCatLink(deps)
    await expect(link.ensure({ reason: 'launch' })).resolves.toEqual({
      result: 'unavailable',
    })
    now += 29_000
    await expect(
      link.ensure({ force: true, reason: 'entitlements' })
    ).resolves.toEqual({ result: 'backoff' })

    await link.ensure({ reason: 'tools' })
    expect(requests).toHaveLength(2)
    now += 30_001
    await link.ensure({ reason: 'launch' })
    expect(requests).toHaveLength(3)
    expect(stored).toBeNull()
  })

  it('waits a minute after a 503 without Retry-After', async () => {
    answer = async () => {
      throw new HttpError('server', 503, 'unavailable', null)
    }
    const link = createRevenueCatLink(deps)
    await link.ensure({ reason: 'launch' })
    now += UNAVAILABLE_DEFAULT_MS - 1
    await expect(link.ensure({ reason: 'launch' })).resolves.toEqual({
      result: 'backoff',
    })
  })

  it('never throws: offline, a refused session, or a surprise', async () => {
    const onError = vi.fn()
    const link = createRevenueCatLink({ ...deps, onError })
    answer = async () => {
      throw new HttpError('offline')
    }
    await expect(link.ensure({ reason: 'launch' })).resolves.toEqual({
      result: 'offline',
    })
    answer = async () => {
      throw new AccountSessionError('attestation', { attestation: 'device' })
    }
    await expect(link.ensure({ reason: 'launch' })).resolves.toEqual({
      result: 'failed',
    })
    const surprise = new Error('boom')
    answer = async () => {
      throw surprise
    }
    await expect(link.ensure({ reason: 'launch' })).resolves.toEqual({
      result: 'failed',
    })
    expect(onError).toHaveBeenCalledExactlyOnceWith(surprise)
    expect(stored).toBeNull()
  })

  it('reports each outcome with its reason', async () => {
    const onOutcome = vi.fn()
    await createRevenueCatLink({ ...deps, onOutcome }).ensure({
      reason: 'session_opened',
    })
    expect(onOutcome).toHaveBeenCalledWith(
      { result: 'linked', supporter: true, expiresAt: null },
      'session_opened'
    )
  })
})

describe('fetchStatus', () => {
  it('reads the account’s Supporter status', async () => {
    answer = async () => ({
      ok: true,
      supporter: true,
      expiresAt: 1_800_000_000_000,
      customers: 2,
    })
    await expect(createRevenueCatLink(deps).fetchStatus()).resolves.toEqual({
      supporter: true,
      expiresAt: 1_800_000_000_000,
      customers: 2,
    })
    expect(requests[0]).toMatchObject({
      url: 'https://api.test/accounts/v1/supporter',
      method: 'GET',
    })
  })

  it('throws on a malformed answer', async () => {
    answer = async () => ({ ok: true })
    await expect(createRevenueCatLink(deps).fetchStatus()).rejects.toThrow()
  })
})
