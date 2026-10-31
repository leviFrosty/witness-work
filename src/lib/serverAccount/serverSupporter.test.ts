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
    bound?: string | null
    now?: number
  } = {}
) => {
  let stored = options.stored ?? null
  let bound = options.bound === undefined ? null : options.bound
  let account: string | null | undefined = undefined
  let current = options.account === undefined ? ACCOUNT : options.account
  let now = options.now ?? 10 * HOUR
  const deps = {
    currentAccount: vi.fn(async () => current),
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
      bound: () => bound,
      bind: vi.fn((fp: string) => {
        bound = fp
      }),
    },
    onAccountSwitched: vi.fn(),
    now: () => now,
  }
  const supporter = createServerSupporter(deps)
  return {
    supporter,
    deps,
    stored: () => stored,
    account: () => account,
    bound: () => bound,
    signInAs: (id: string | null) => (current = id),
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
      link: {
        result: 'linked',
        supporter: true,
        expiresAt: 99 * HOUR,
        accountId: ACCOUNT,
      },
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

  it('never opens a session, and hides the answer without one', async () => {
    const { supporter, deps, stored, account } = setup({
      account: null,
      stored: entry(),
    })
    await supporter.refresh({ reason: 'launch' })
    expect(deps.link).not.toHaveBeenCalled()
    expect(deps.fetchStatus).not.toHaveBeenCalled()
    expect(account()).toBeNull()
    // Kept for the account: a key changed on another device (ADR 0039) leaves
    // a session for the old key until one opens for the new key.
    expect(stored()).toEqual(entry())
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

  it('records a link answered elsewhere for its account', async () => {
    const { supporter, stored } = setup()
    await supporter.record(ACCOUNT, { supporter: true, expiresAt: 7 })
    expect(stored()).toEqual(entry({ expiresAt: 7, readAt: 10 * HOUR }))
  })

  it('reads again when the account key changes', async () => {
    const { supporter, deps, stored } = setup({
      stored: entry(),
      status: async () => ({ supporter: false, expiresAt: null }),
    })
    await supporter.accountChanged()
    expect(deps.fetchStatus).toHaveBeenCalledOnce()
    expect(stored()).toMatchObject({ supporter: false })
  })

  it('keeps the answer through a key change on the same account', async () => {
    // ADR 0039: the new key's session isn't open yet, then it opens for the
    // same account.
    const { supporter, deps, stored, account, signInAs } = setup({
      account: null,
      bound: accountFingerprint(ACCOUNT),
      stored: entry({ readAt: 10 * HOUR }),
    })
    await supporter.accountChanged()
    expect(account()).toBeNull()
    expect(stored()).toEqual(entry({ readAt: 10 * HOUR }))

    signInAs(ACCOUNT)
    await supporter.refresh({ reason: 'session_opened' })
    expect(deps.onAccountSwitched).not.toHaveBeenCalled()
    expect(account()).toBe(accountFingerprint(ACCOUNT))
    expect(stored()).toEqual(entry({ readAt: 10 * HOUR }))
  })

  it('reads on the account it confirmed', async () => {
    const { supporter, deps } = setup()
    await supporter.refresh({ reason: 'launch' })
    expect(deps.fetchStatus).toHaveBeenCalledWith(ACCOUNT)
  })

  it('runs one forced read after the one under way, however many ask', async () => {
    let release!: () => void
    const { supporter, deps } = setup({
      status: () =>
        new Promise((resolve) => {
          release = () => resolve({ supporter: true, expiresAt: null })
        }),
    })
    const first = supporter.refresh({ reason: 'launch' })
    await vi.waitFor(() => expect(deps.fetchStatus).toHaveBeenCalledOnce())
    const forced = [1, 2, 3].map(() =>
      supporter.refresh({ force: true, reason: 'session_opened' })
    )
    release()
    await first
    await vi.waitFor(() => expect(deps.fetchStatus).toHaveBeenCalledTimes(2))
    release()
    await Promise.all(forced)
    expect(deps.fetchStatus).toHaveBeenCalledTimes(2)
  })

  describe('keeps each answer with its account', () => {
    it("doesn't record a late answer for the previous account", async () => {
      const { supporter, stored, account } = setup({ account: OTHER })
      await supporter.record(ACCOUNT, { supporter: true, expiresAt: null })
      expect(stored()).toBeNull()
      expect(account()).not.toBe(accountFingerprint(ACCOUNT))
    })

    it("doesn't take a link made for another account", async () => {
      const { supporter, deps, stored } = setup({
        account: OTHER,
        link: {
          result: 'linked',
          supporter: true,
          expiresAt: null,
          accountId: ACCOUNT,
        },
        status: async () => ({ supporter: false, expiresAt: null }),
      })
      await supporter.refresh({ reason: 'launch' })
      expect(deps.fetchStatus).toHaveBeenCalledOnce()
      expect(stored()).toMatchObject({
        account: accountFingerprint(OTHER),
        supporter: false,
      })
    })

    it("doesn't record a read the account changed under", async () => {
      const { supporter, stored, signInAs } = setup({
        status: async () => {
          // The request opened the new key's session on the way.
          signInAs(OTHER)
          return { supporter: true, expiresAt: null }
        },
      })
      await supporter.refresh({ reason: 'launch' })
      expect(stored()).toBeNull()
    })

    it('reads again when forced while a read is under way', async () => {
      let answer!: (s: { supporter: boolean; expiresAt: null }) => void
      const { supporter, deps, stored, signInAs } = setup({
        status: () => new Promise((resolve) => (answer = resolve)),
      })
      const first = supporter.refresh({ reason: 'launch' })
      await vi.waitFor(() => expect(deps.fetchStatus).toHaveBeenCalledOnce())
      signInAs(OTHER)
      const forced = supporter.refresh({
        force: true,
        reason: 'session_opened',
      })
      answer({ supporter: true, expiresAt: null })
      await first
      await vi.waitFor(() => expect(deps.fetchStatus).toHaveBeenCalledTimes(2))
      answer({ supporter: false, expiresAt: null })
      await forced
      expect(stored()).toMatchObject({
        account: accountFingerprint(OTHER),
        supporter: false,
      })
    })

    it('binds the first account it sees', async () => {
      const { supporter, deps, bound } = setup()
      await supporter.refresh({ reason: 'launch' })
      expect(bound()).toBe(accountFingerprint(ACCOUNT))
      expect(deps.onAccountSwitched).not.toHaveBeenCalled()
    })

    it('leaves the same account alone', async () => {
      const { supporter, deps, stored } = setup({
        bound: accountFingerprint(ACCOUNT),
        stored: entry({ readAt: 10 * HOUR }),
      })
      await supporter.refresh({ reason: 'launch' })
      expect(deps.onAccountSwitched).not.toHaveBeenCalled()
      expect(stored()).toEqual(entry({ readAt: 10 * HOUR }))
    })

    it('drops what the previous account left when another signs in', async () => {
      const { supporter, deps, stored, bound } = setup({
        account: OTHER,
        bound: accountFingerprint(ACCOUNT),
        stored: entry({ readAt: 10 * HOUR }),
        link: { result: 'offline' },
      })
      await supporter.refresh({ reason: 'launch' })
      expect(deps.onAccountSwitched).toHaveBeenCalledOnce()
      expect(stored()).toBeNull()
      expect(bound()).toBe(accountFingerprint(OTHER))
    })

    it("treats an older install's answer for another account as a switch", async () => {
      const { supporter, deps } = setup({
        account: OTHER,
        stored: entry({ readAt: 10 * HOUR }),
      })
      await supporter.refresh({ reason: 'launch' })
      expect(deps.onAccountSwitched).toHaveBeenCalledOnce()
    })

    it('keeps the binding without a session', async () => {
      const { supporter, deps, bound } = setup({
        account: null,
        bound: accountFingerprint(ACCOUNT),
      })
      await supporter.refresh({ reason: 'launch' })
      expect(bound()).toBe(accountFingerprint(ACCOUNT))
      expect(deps.onAccountSwitched).not.toHaveBeenCalled()
    })
  })
})
