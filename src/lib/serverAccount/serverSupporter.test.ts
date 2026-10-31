import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http/request'
import type { RevenueCatLinkOutcome } from '@/lib/serverAccount/revenueCatLink'
import {
  accountFingerprint,
  createServerSupporter,
  nextServerSupporterChange,
  parseServerSupporterEntry,
  SERVER_SUPPORTER_REFRESH_MS,
  serverSupporterActive,
  type ServerSupporterEntry,
} from '@/lib/serverAccount/serverSupporter'

const ACCOUNT = 'acct_one'
const OTHER = 'acct_two'
const HOUR = 60 * 60_000

const entry = (
  overrides: Partial<ServerSupporterEntry> = {}
): ServerSupporterEntry => ({
  account: accountFingerprint(ACCOUNT),
  supporter: true,
  expiresAt: null,
  readAt: 0,
  ...overrides,
})

describe('serverSupporterActive', () => {
  const fp = accountFingerprint(ACCOUNT)

  it('is a Supporter with no end', () => {
    expect(serverSupporterActive(entry(), fp, 10)).toBe(true)
  })

  it('is a Supporter until it expires', () => {
    const e = entry({ expiresAt: 100 })
    expect(serverSupporterActive(e, fp, 99)).toBe(true)
    expect(serverSupporterActive(e, fp, 100)).toBe(false)
  })

  it('is not when the server said not', () => {
    expect(serverSupporterActive(entry({ supporter: false }), fp, 1)).toBe(
      false
    )
  })

  it('is only for the account it was read for', () => {
    expect(serverSupporterActive(entry(), accountFingerprint(OTHER), 1)).toBe(
      false
    )
  })

  it('is not without a session', () => {
    expect(serverSupporterActive(entry(), null, 1)).toBe(false)
  })

  it('trusts the last answer while the session is still loading', () => {
    expect(serverSupporterActive(entry(), undefined, 1)).toBe(true)
  })

  it('is not without an answer', () => {
    expect(serverSupporterActive(null, fp, 1)).toBe(false)
  })
})

describe('nextServerSupporterChange', () => {
  it('is the expiry while it lasts', () => {
    expect(nextServerSupporterChange(entry({ expiresAt: 50 }), 10)).toBe(50)
    expect(nextServerSupporterChange(entry({ expiresAt: 50 }), 50)).toBeNull()
    expect(nextServerSupporterChange(entry(), 10)).toBeNull()
    expect(nextServerSupporterChange(null, 10)).toBeNull()
  })
})

describe('parseServerSupporterEntry', () => {
  it('round-trips', () => {
    const e = entry({ expiresAt: 5, readAt: 3 })
    expect(parseServerSupporterEntry(JSON.stringify(e))).toEqual(e)
  })

  it.each(['', 'nope', '{}', '{"account":"a","supporter":"yes"}'])(
    'drops %j',
    (raw) => {
      expect(parseServerSupporterEntry(raw)).toBeNull()
    }
  )
})

const setup = (
  options: {
    account?: string | null
    link?: RevenueCatLinkOutcome
    status?: () => Promise<{ supporter: boolean; expiresAt: number | null }>
    stored?: ServerSupporterEntry | null
    now?: number
  } = {}
) => {
  let stored = options.stored ?? null
  let account: string | null | undefined = undefined
  let now = options.now ?? 10 * HOUR
  const deps = {
    currentAccount: vi.fn(async () =>
      options.account === undefined ? ACCOUNT : options.account
    ),
    link: vi.fn(
      async (): Promise<RevenueCatLinkOutcome> =>
        options.link ?? { result: 'skipped' }
    ),
    fetchStatus: vi.fn(
      options.status ?? (async () => ({ supporter: true, expiresAt: null }))
    ),
    store: {
      entry: () => stored,
      setEntry: vi.fn((e: ServerSupporterEntry | null) => {
        stored = e
      }),
      setAccount: vi.fn((fp: string | null) => {
        account = fp
      }),
    },
    now: () => now,
  }
  const supporter = createServerSupporter(deps)
  return {
    supporter,
    deps,
    stored: () => stored,
    account: () => account,
    advance: (ms: number) => (now += ms),
  }
}

describe('createServerSupporter', () => {
  it('reads the status when the link made no new answer', async () => {
    const { supporter, deps, stored, account } = setup()
    await supporter.refresh({ reason: 'launch' })
    expect(deps.link).toHaveBeenCalledWith('launch')
    expect(deps.fetchStatus).toHaveBeenCalledOnce()
    expect(stored()).toEqual(entry({ readAt: 10 * HOUR }))
    expect(account()).toBe(accountFingerprint(ACCOUNT))
  })

  it("takes the link's answer without asking again", async () => {
    const { supporter, deps, stored } = setup({
      link: { result: 'linked', supporter: true, expiresAt: 99 * HOUR },
    })
    await supporter.refresh({ reason: 'launch' })
    expect(deps.fetchStatus).not.toHaveBeenCalled()
    expect(stored()).toMatchObject({ supporter: true, expiresAt: 99 * HOUR })
  })

  it('reads at most every few hours unless forced', async () => {
    const { supporter, deps, advance } = setup()
    await supporter.refresh({ reason: 'foreground' })
    advance(SERVER_SUPPORTER_REFRESH_MS - 1)
    await supporter.refresh({ reason: 'foreground' })
    expect(deps.fetchStatus).toHaveBeenCalledOnce()
    await supporter.refresh({ reason: 'session_opened', force: true })
    expect(deps.fetchStatus).toHaveBeenCalledTimes(2)
    advance(SERVER_SUPPORTER_REFRESH_MS)
    await supporter.refresh({ reason: 'foreground' })
    expect(deps.fetchStatus).toHaveBeenCalledTimes(3)
  })

  it('reads again once the last answer has expired', async () => {
    const { supporter, deps } = setup({
      stored: entry({ expiresAt: 10 * HOUR - 1, readAt: 10 * HOUR - HOUR }),
    })
    await supporter.refresh({ reason: 'foreground' })
    expect(deps.fetchStatus).toHaveBeenCalledOnce()
  })

  it('never opens a session, and drops the answer without one', async () => {
    const { supporter, deps, stored, account } = setup({
      account: null,
      stored: entry(),
    })
    await supporter.refresh({ reason: 'launch' })
    expect(deps.link).not.toHaveBeenCalled()
    expect(deps.fetchStatus).not.toHaveBeenCalled()
    expect(stored()).toBeNull()
    expect(account()).toBeNull()
  })

  it("reads again for another account, even when it's fresh", async () => {
    const { supporter, deps, stored } = setup({
      stored: entry({ account: accountFingerprint(OTHER), readAt: 10 * HOUR }),
      status: async () => ({ supporter: false, expiresAt: null }),
    })
    await supporter.refresh({ reason: 'foreground' })
    expect(deps.fetchStatus).toHaveBeenCalledOnce()
    expect(stored()).toMatchObject({
      account: accountFingerprint(ACCOUNT),
      supporter: false,
    })
  })

  it('keeps the last answer offline', async () => {
    const { supporter, stored } = setup({
      stored: entry({ readAt: 0 }),
      status: async () => {
        throw new HttpError('offline')
      },
    })
    await supporter.refresh({ reason: 'foreground' })
    expect(stored()).toEqual(entry({ readAt: 0 }))
  })

  it("doesn't ask when the link is offline", async () => {
    const { supporter, deps, stored } = setup({
      link: { result: 'offline' },
      stored: entry(),
    })
    await supporter.refresh({ reason: 'foreground' })
    expect(deps.fetchStatus).not.toHaveBeenCalled()
    expect(stored()).toEqual(entry())
  })

  it('records a link answered elsewhere for its account', () => {
    const { supporter, stored } = setup()
    supporter.record(ACCOUNT, { supporter: true, expiresAt: 7 })
    expect(stored()).toEqual(entry({ expiresAt: 7, readAt: 10 * HOUR }))
  })

  it('drops the answer when the account key changes, then reads', async () => {
    const { supporter, deps, stored } = setup({
      stored: entry(),
      status: async () => ({ supporter: false, expiresAt: null }),
    })
    const done = supporter.accountChanged()
    expect(deps.store.setEntry).toHaveBeenCalledWith(null)
    await done
    expect(stored()).toMatchObject({ supporter: false })
  })
})
