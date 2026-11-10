import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http/request'
import type { RevenueCatLinkOutcome } from '@/lib/serverAccount/revenueCatLink'
import {
  accountFingerprint,
  createServerSupporter,
  nextServerSupporterChange,
  parseServerSupporterEntry,
  PEER_CLAIM_RETRY_MS,
  SERVER_SUPPORTER_ONLY_SOURCE_REFRESH_MS,
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
    adoptedFor?: string | null
    now?: number
    refreshMs?: number
  } = {}
) => {
  const scheduled: { run: () => void; afterMs: number }[] = []
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
      adoptedFor: () => options.adoptedFor ?? null,
    },
    onAccountSwitched: vi.fn(),
    now: () => now,
    ...(options.refreshMs === undefined
      ? {}
      : { refreshMs: () => options.refreshMs as number }),
    schedule: (run: () => void, afterMs: number) => {
      scheduled.push({ run, afterMs })
    },
  }
  const supporter = createServerSupporter(deps)
  return {
    supporter,
    deps,
    stored: () => stored,
    account: () => account,
    bound: () => bound,
    scheduled,
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

  it.each(['unavailable', 'failed'] as const)(
    'reads the stored answer when the link is %s',
    async (result) => {
      const { supporter, deps, stored } = setup({ link: { result } })
      await supporter.refresh({ reason: 'account_changed' })
      expect(deps.fetchStatus).toHaveBeenCalledWith(ACCOUNT)
      expect(stored()).toMatchObject({ supporter: true })
    }
  )

  describe("during the link's backoff (RevenueCat down)", () => {
    it("doesn't read again with this account's answer, however old", async () => {
      const { supporter, deps, stored } = setup({
        link: { result: 'backoff' },
        bound: accountFingerprint(ACCOUNT),
        stored: entry({ supporter: false, readAt: 0 }),
      })
      await supporter.refresh({ reason: 'foreground' })
      expect(deps.fetchStatus).not.toHaveBeenCalled()
      expect(stored()).toEqual(entry({ supporter: false, readAt: 0 }))
    })

    it("doesn't read without an answer when no account switched", async () => {
      const { supporter, deps } = setup({
        link: { result: 'backoff' },
        bound: accountFingerprint(ACCOUNT),
      })
      await supporter.refresh({ reason: 'foreground' })
      expect(deps.fetchStatus).not.toHaveBeenCalled()
    })

    it('reads once after a switch to an account without an answer', async () => {
      const { supporter, deps, stored } = setup({
        link: { result: 'backoff' },
        bound: accountFingerprint(OTHER),
        stored: entry({ account: accountFingerprint(OTHER) }),
      })
      await supporter.refresh({ reason: 'account_changed' })
      expect(deps.fetchStatus).toHaveBeenCalledOnce()
      expect(stored()).toMatchObject({
        account: accountFingerprint(ACCOUNT),
        supporter: true,
      })
      await supporter.refresh({ reason: 'foreground', force: true })
      expect(deps.fetchStatus).toHaveBeenCalledOnce()
    })

    it('reads once when told another account was bound', async () => {
      const { supporter, deps } = setup({
        link: { result: 'backoff' },
        bound: accountFingerprint(ACCOUNT),
      })
      await supporter.accountSwitched()
      expect(deps.fetchStatus).toHaveBeenCalledOnce()
    })

    it('reads again after a switch whose read failed', async () => {
      let fail = true
      const { supporter, deps } = setup({
        link: { result: 'backoff' },
        bound: accountFingerprint(OTHER),
        status: async () => {
          if (fail) throw new Error('server')
          return { supporter: true, expiresAt: null }
        },
      })
      await supporter.refresh({ reason: 'account_changed' })
      fail = false
      await supporter.refresh({ reason: 'foreground' })
      expect(deps.fetchStatus).toHaveBeenCalledTimes(2)
    })
  })

  describe('after another account is bound', () => {
    it('reads once the read under way ended without an answer', async () => {
      let failRead = true
      const { supporter, deps, stored } = setup({
        status: async () => {
          if (failRead) throw new Error('server')
          return { supporter: true, expiresAt: null }
        },
      })
      let finishLink!: () => void
      deps.link.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishLink = () => resolve({ result: 'failed' })
          })
      )
      const underWay = supporter.refresh({ reason: 'account_changed' })
      const switched = supporter.accountSwitched()
      await vi.waitFor(() => expect(finishLink).toBeDefined())
      finishLink()
      await underWay
      failRead = false
      await switched
      expect(deps.fetchStatus).toHaveBeenCalledTimes(2)
      expect(stored()).toMatchObject({ supporter: true })
    })

    it("doesn't read again when the read under way answered", async () => {
      const { supporter, deps } = setup()
      const underWay = supporter.refresh({ reason: 'account_changed' })
      await supporter.accountSwitched()
      await underWay
      expect(deps.fetchStatus).toHaveBeenCalledOnce()
    })
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
      expect(deps.onAccountSwitched).toHaveBeenCalledWith(
        accountFingerprint(ACCOUNT)
      )
      expect(stored()).toBeNull()
      expect(bound()).toBe(accountFingerprint(OTHER))
    })

    it('treats an id adopted for another account as a switch, bound or not', async () => {
      const { supporter, deps, bound } = setup({
        account: OTHER,
        adoptedFor: accountFingerprint(ACCOUNT),
      })
      await supporter.refresh({ reason: 'launch' })
      expect(deps.onAccountSwitched).toHaveBeenCalledWith(
        accountFingerprint(ACCOUNT)
      )
      expect(bound()).toBe(accountFingerprint(OTHER))
    })

    it("binds the first account an adopted id is already for, as it's its own", async () => {
      const { supporter, deps } = setup({
        adoptedFor: accountFingerprint(ACCOUNT),
      })
      await supporter.refresh({ reason: 'launch' })
      expect(deps.onAccountSwitched).not.toHaveBeenCalled()
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

describe('when another device changes the account', () => {
  const notSupporter = async () => ({ supporter: false, expiresAt: null })
  const supporterNow = async () => ({ supporter: true, expiresAt: null })

  it('reads again as soon as a peer says Supporter, however fresh the answer', async () => {
    const status = vi.fn(notSupporter)
    const { supporter, deps, stored, advance } = setup({ status })
    await supporter.refresh({ reason: 'session_opened' })
    expect(stored()).toMatchObject({ supporter: false })

    advance(60_000)
    status.mockImplementation(supporterNow)
    await supporter.peerClaimsChanged(true)

    expect(deps.link).toHaveBeenLastCalledWith('peer_claim')
    expect(deps.fetchStatus).toHaveBeenCalledTimes(2)
    expect(stored()).toMatchObject({ supporter: true })
  })

  it("asks once more when the peer's link hasn't reached the server yet", async () => {
    const status = vi.fn(notSupporter)
    const { supporter, deps, stored, scheduled } = setup({ status })
    await supporter.peerClaimsChanged(true)
    expect(stored()).toMatchObject({ supporter: false })
    expect(scheduled.map((s) => s.afterMs)).toEqual([PEER_CLAIM_RETRY_MS])

    status.mockImplementation(supporterNow)
    scheduled[0].run()
    await vi.waitFor(() => expect(stored()).toMatchObject({ supporter: true }))
    expect(deps.fetchStatus).toHaveBeenCalledTimes(2)
    expect(scheduled).toHaveLength(1)
  })

  it('skips the second ask when the answer came in the meantime', async () => {
    const { supporter, deps, scheduled } = setup({ status: notSupporter })
    await supporter.peerClaimsChanged(true)
    await supporter.record(ACCOUNT, { supporter: true, expiresAt: null })
    scheduled[0].run()
    expect(deps.fetchStatus).toHaveBeenCalledOnce()
  })

  it('reads again when no peer says Supporter any more', async () => {
    const status = vi.fn(supporterNow)
    const { supporter, deps, stored, scheduled } = setup({ status })
    await supporter.refresh({ reason: 'launch' })

    status.mockImplementation(notSupporter)
    await supporter.peerClaimsChanged(false)

    expect(deps.fetchStatus).toHaveBeenCalledTimes(2)
    expect(stored()).toMatchObject({ supporter: false })
    expect(scheduled).toHaveLength(0)
  })

  it("doesn't ask when the peers agree with the answer", async () => {
    const { supporter, deps } = setup()
    await supporter.refresh({ reason: 'launch' })
    await supporter.peerClaimsChanged(true)
    expect(deps.fetchStatus).toHaveBeenCalledOnce()

    const none = setup({ status: notSupporter })
    await none.supporter.refresh({ reason: 'launch' })
    await none.supporter.peerClaimsChanged(false)
    expect(none.deps.fetchStatus).toHaveBeenCalledOnce()
  })

  it('counts an answer past its end as not a Supporter', async () => {
    const { supporter, deps } = setup({
      stored: entry({ expiresAt: 10 * HOUR - 1, readAt: 9 * HOUR }),
    })
    await supporter.peerClaimsChanged(true)
    expect(deps.fetchStatus).toHaveBeenCalledOnce()
  })
})

describe('when the answer reaches its end', () => {
  it('reads again at once, to tell a renewal from a lapse', async () => {
    const { supporter, deps, stored, advance } = setup({
      status: async () => ({ supporter: true, expiresAt: 35 * HOUR }),
      stored: entry({ expiresAt: 11 * HOUR, readAt: 10 * HOUR }),
    })
    await supporter.expired()
    expect(deps.fetchStatus).not.toHaveBeenCalled()

    advance(HOUR)
    await supporter.expired()
    expect(deps.link).toHaveBeenLastCalledWith('expired')
    expect(stored()).toMatchObject({ supporter: true, expiresAt: 35 * HOUR })
  })
})

describe('where the server is the only source', () => {
  it('reads again after minutes, not hours', async () => {
    const { supporter, deps, advance } = setup({
      status: async () => ({ supporter: false, expiresAt: null }),
      refreshMs: SERVER_SUPPORTER_ONLY_SOURCE_REFRESH_MS,
    })
    await supporter.refresh({ reason: 'launch' })
    advance(SERVER_SUPPORTER_ONLY_SOURCE_REFRESH_MS - 1)
    await supporter.refresh({ reason: 'interval' })
    expect(deps.fetchStatus).toHaveBeenCalledOnce()
    advance(1)
    await supporter.refresh({ reason: 'interval' })
    expect(deps.fetchStatus).toHaveBeenCalledTimes(2)
    expect(SERVER_SUPPORTER_ONLY_SOURCE_REFRESH_MS).toBeLessThan(
      SERVER_SUPPORTER_REFRESH_MS
    )
  })
})
