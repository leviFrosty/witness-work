import { ed25519 } from '@noble/curves/ed25519.js'
import { describe, expect, it, vi } from 'vitest'
import { concatBytes, fromB64u, fromUtf8, utf8 } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import { createWebAccountKey } from '@/lib/accountKey/webAccountKey'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  createSignUpKeyGuard,
  createWebSignUpMarkStore,
} from '@/lib/serverAccount/webSignUp'
import {
  ACCESS_LIFETIME_MS,
  AccountSessionError,
  createAccountSessions,
  type SessionEndReason,
  STORE_ATTEMPTS,
} from '@/lib/serverAccount/session'
import {
  closeSession,
  type OpenedSession,
  sendWebSessionOpen,
} from '@/lib/serverAccount/sessionClient'
import {
  createWebAccount,
  WebSignInError,
} from '@/lib/serverAccount/webAccount'
import { webDeviceLabel } from '@/lib/serverAccount/webDeviceLabel'
import { createSessionTabs } from '@/lib/serverAccount/webTabs'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))

const BASE = 'https://api.test'
const DAY = 24 * 60 * 60 * 1000
const KEY_A = new Uint8Array(32).fill(1)
const KEY_B = new Uint8Array(32).fill(2)
/** Account A's key after a key change on another device. */
const KEY_A2 = new Uint8Array(32).fill(3)
const PUB_A = deriveAccountSigningKey(KEY_A).publicKey
const PUB_B = deriveAccountSigningKey(KEY_B).publicKey
const PUB_A2 = deriveAccountSigningKey(KEY_A2).publicKey
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const unauthorized = (reason?: string, changedAt?: number) =>
  json(401, {
    ok: false,
    error: 'unauthorized',
    code: 'unauthorized',
    ...(reason && { reason }),
    ...(changedAt !== undefined && { changedAt }),
  })

type Session = {
  sessionId: string
  accountId: string
  refreshToken: string
  accessTokens: Set<string>
  expiresAt: number
  ended: SessionEndReason | null
  /** With `ended: 'key_changed'`: when. */
  changedAt?: number
  nonce: string
  /** Refresh tokens it replaced: presenting one ends it as reused. */
  replaced: Set<string>
}

/**
 * Ww-api's web session routes: opening with a ticket (and the same signed
 * request again after a lost answer), sliding refresh with its 401 reasons,
 * closing, and one bearer route.
 */
function fakeWorker(clock: { now: number }, events: string[]) {
  const accounts = new Map([
    [PUB_A, 'acct000000000000000001'],
    [PUB_B, 'acct000000000000000002'],
  ])
  const tickets = new Map([
    ['ticket-a', PUB_A],
    ['ticket-a2', PUB_A],
    ['ticket-a3', PUB_A],
    ['ticket-b', PUB_B],
    ['ticket-b2', PUB_B],
    ['ticket-new-key', PUB_A2],
  ])
  /** Keys a key change retired, with when. */
  const retired = new Map<string, number>()
  const sessions: Session[] = []
  const calls: { op: string; body: Record<string, unknown> | null }[] = []
  let issued = 0
  /** Drops the answer to the next calls of an op, after the server ran it. */
  const lose = new Map<string, number>()
  /** Ops that never answer (offline). */
  const hang = new Set<string>()

  const tokens = (session: Session) => {
    const accessToken = `at-${++issued}`
    session.accessTokens.add(accessToken)
    return {
      accessToken,
      accessExpiresAt: clock.now + ACCESS_LIFETIME_MS,
      refreshToken: session.refreshToken,
      sessionExpiresAt: session.expiresAt,
    }
  }

  const bearer = (init: RequestInit) => {
    const token = (init.headers as Record<string, string>)?.authorization
    return sessions.find(
      (session) =>
        !session.ended &&
        session.accessTokens.has(String(token).replace(/^Bearer /, ''))
    )
  }

  const answer = (
    op: string,
    init: RequestInit,
    body: Record<string, string>
  ): Response => {
    switch (op) {
      case 'POST sessions': {
        const payloadBytes = fromB64u(String(body.payload))
        const payload = JSON.parse(fromUtf8(payloadBytes))
        const signed = ed25519.verify(
          fromB64u(String(body.signature)),
          concatBytes(utf8('ww-account/v1\nsession/open\n'), payloadBytes),
          fromB64u(payload.accountPub)
        )
        if (!signed || payload.attestation) return json(400, { ok: false })
        if (retired.has(payload.accountPub))
          return json(403, {
            ok: false,
            error: 'key_retired',
            code: 'key_retired',
            changedAt: retired.get(payload.accountPub),
          })
        if (
          payload.accountId !== undefined &&
          accounts.get(payload.accountPub) !== payload.accountId
        )
          return json(404, { ok: false, error: 'unknown_account' })
        // The same signed request again: the same session, a new access token.
        const repeat = sessions.find((s) => s.nonce === payload.nonce)
        if (repeat)
          return json(201, {
            ok: true,
            accountId: repeat.accountId,
            status: 'active',
            sessionId: repeat.sessionId,
            ...tokens(repeat),
          })
        if (tickets.get(payload.ticket) !== payload.accountPub)
          return json(403, { ok: false, error: 'ticket_invalid' })
        tickets.delete(payload.ticket)
        const session: Session = {
          sessionId: `sid-${sessions.length + 1}`,
          accountId: accounts.get(payload.accountPub)!,
          refreshToken: `rt-${++issued}`,
          accessTokens: new Set(),
          expiresAt: clock.now + 180 * DAY,
          ended: null,
          nonce: payload.nonce,
          replaced: new Set(),
        }
        sessions.push(session)
        return json(201, {
          ok: true,
          accountId: session.accountId,
          status: 'active',
          sessionId: session.sessionId,
          ...tokens(session),
        })
      }
      case 'POST sessions/refresh': {
        const session = sessions.find(
          (entry) => entry.refreshToken === body.refreshToken
        )
        const reused = sessions.find((entry) =>
          entry.replaced.has(String(body.refreshToken))
        )
        if (reused) reused.ended = 'reused'
        if (!session) return unauthorized('reused')
        if (session.ended) return unauthorized(session.ended, session.changedAt)
        session.replaced.add(session.refreshToken)
        session.refreshToken = `rt-${++issued}`
        // Sliding: 180 days from every refresh.
        session.expiresAt = clock.now + 180 * DAY
        return json(200, { ok: true, ...tokens(session) })
      }
      case 'DELETE sessions/current': {
        const session = bearer(init)
        if (!session) return unauthorized()
        session.ended = 'revoked'
        return json(200, { ok: true })
      }
      case 'GET account': {
        const session = bearer(init)
        if (!session) return unauthorized()
        return json(200, { ok: true, accountId: session.accountId })
      }
    }
    return json(404, { ok: false, error: 'not_found' })
  }

  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const op = `${init.method ?? 'GET'} ${url.replace(`${BASE}/accounts/v1/`, '')}`
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null
    calls.push({ op, body })
    events.push(op)
    if (hang.has(op)) return new Promise<Response>(() => {})
    const response = answer(op, init, body)
    const lost = lose.get(op) ?? 0
    if (lost > 0) {
      lose.set(op, lost - 1)
      throw new TypeError('Failed to fetch')
    }
    return response
  }) as unknown as typeof fetch

  const called = (op: string) => calls.filter((call) => call.op === op)
  /**
   * Another device changes account A's key: every other session still live ends
   * as `key_changed`; one already ended keeps why.
   */
  const changeKeyElsewhere = (changedAt: number) => {
    retired.set(PUB_A, changedAt)
    accounts.delete(PUB_A)
    accounts.set(PUB_A2, 'acct000000000000000001')
    for (const session of sessions)
      if (session.accountId === 'acct000000000000000001' && !session.ended) {
        session.ended = 'key_changed'
        session.changedAt = changedAt
      }
  }
  return { fetchImpl, sessions, calls, called, lose, hang, changeKeyElsewhere }
}

/** Web Locks: one holder at a time, across the page's tabs. */
function fakeLocks() {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    request: (_name: string, run: () => Promise<unknown>) => {
      const result = tail.then(run)
      tail = result.catch(() => undefined)
      return result
    },
  } as unknown as LockManager
}

/** `BroadcastChannel`: what one tab posts reaches the others, later. */
function fakeChannels() {
  const open: FakeChannel[] = []
  class FakeChannel {
    onmessage: ((event: MessageEvent) => void) | null = null
    constructor(readonly name: string) {
      open.push(this)
    }
    postMessage(data: unknown) {
      for (const other of open)
        if (other !== this && other.name === this.name)
          setTimeout(() =>
            other.onmessage?.({ data: structuredClone(data) } as MessageEvent)
          )
    }
    close() {}
  }
  return FakeChannel as unknown as new (name: string) => BroadcastChannel
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

/** One browser: the IndexedDB its tabs share, and the server. */
function browser() {
  const clock = { now: 1_800_000_000_000 }
  /** What happened, in order: requests, wipes, and the wipe-pending mark. */
  const events: string[] = []
  const worker = fakeWorker(clock, events)
  const disk = {
    session: null as string | null,
    secrets: new Map<string, Uint8Array>(),
    /** `secureKv`'s plain entries: the data's owner, marks. */
    kv: new Map<string, unknown>(),
    /** The local stores. */
    stores: new Map<string, string>(),
    /** The stores' copy of the last account (`serverAccount.lastAccountId`). */
    lastAccountId: null as string | null,
    /** `secureKv` entries that can't be read. */
    unreadable: new Set<string>(),
    /** The tab closes as it marks a wipe pending: nothing after it runs. */
    dieMarkingWipe: false,
  }
  const locks = fakeLocks()
  const Channel = fakeChannels()
  let nonce = 0
  const randomBytes = (length: number) =>
    new Uint8Array(length).fill(++nonce % 256)

  function tab() {
    const reload = vi.fn()
    const wipe = vi.fn(async () => {
      events.push('wipe')
      disk.stores.clear()
      disk.session = null
      disk.secrets.clear()
      disk.kv.clear()
      disk.lastAccountId = null
    })
    const kvEntry = <T>(name: string) => ({
      read: async () => {
        if (disk.unreadable.has(name)) throw new Error(`${name}: unreadable`)
        return (disk.kv.get(name) as T | undefined) ?? null
      },
      write: async (value: T | null) => {
        if (value === null) disk.kv.delete(name)
        else disk.kv.set(name, value)
      },
    })
    const onEnded = vi.fn()
    const tabs = createSessionTabs({ locks, Channel })
    const accountKey = createWebAccountKey({
      secrets: {
        read: async (name) => disk.secrets.get(name) ?? null,
        write: async (name, value) => {
          if (value) disk.secrets.set(name, value)
          else disk.secrets.delete(name)
        },
      },
      randomBytes,
      publicKeyOf: (key) => deriveAccountSigningKey(key).publicKey,
    })
    // The app's handling (`handleKeyRetired`); the account forgets the key
    // itself first.
    const onKeyRetired = vi.fn(
      async (_pub: string, _changedAt: number | null) => {}
    )
    const store = {
      read: vi.fn(async () => disk.session),
      write: vi.fn(async (value: string | null) => {
        disk.session = value
      }),
    }
    const sessions = createAccountSessions({
      baseUrl: BASE,
      now: () => clock.now,
      localNow: () => clock.now,
      randomBytes,
      attestation: {
        assert: () => {
          throw new Error('a browser never attests')
        },
      },
      store,
      accountKey: async () => {
        const key = await accountKey.peek()
        if (!key) throw new AccountSessionError('signedOut')
        return key
      },
      deviceLabel: () => webDeviceLabel(CHROME),
      appVersion: () => '9.8.7',
      fetchImpl: worker.fetchImpl,
      web: {
        exclusive: tabs.exclusive,
        publish: tabs.publish,
        decide: (reason, details) => account.decide(reason, details),
        onEnded: (reason, from) => account.ended(reason, from),
        inFlight: kvEntry<string>('refresh-in-flight'),
      },
    })
    const account = createWebAccount({
      sessions,
      accountKey,
      tabs,
      open: (ticket, key, signed) => {
        const signing = deriveAccountSigningKey(key)
        return sendWebSessionOpen(
          {
            ticket,
            device: 'sealed-label',
            appVersion: '9.8.7',
          },
          {
            baseUrl: BASE,
            key: signing,
            now: () => clock.now,
            randomBytes,
            fetchImpl: worker.fetchImpl,
          },
          signed
        )
      },
      closeOpened: (accessToken) =>
        closeSession(accessToken, {
          baseUrl: BASE,
          fetchImpl: worker.fetchImpl,
        }),
      owner: kvEntry<string>('owner'),
      signUpKeyHeld: createSignUpKeyGuard({
        mark: createWebSignUpMarkStore({
          get: async <T>(name: string) =>
            (disk.kv.get(name) as T | undefined) ?? null,
          set: async (name, value) => void disk.kv.set(name, value),
          delete: async (name) => void disk.kv.delete(name),
        }),
        readStoredKey: () => accountKey.readStored(),
        // Another tab signing up holds `ww-signup`.
        lockFree: async () => disk.kv.get('ww-signup-held') !== true,
      }),
      hasLocalData: () => disk.stores.size > 0,
      markWipePending: async () => {
        if (disk.dieMarkingWipe) return new Promise<void>(() => {})
        events.push('wipe-pending')
        disk.kv.set('wipe-pending', true)
      },
      wipe,
      reload,
      onEnded,
      now: () => clock.now,
      closeWaitMs: 50,
      keyRetiredPending: kvEntry<{
        accountPub: string
        changedAt: number | null
      }>('key-retired-pending'),
      onKeyRetired,
      onSignedIn: (_key, accountId) => {
        disk.lastAccountId = accountId
      },
      flushWaitMs: 50,
    })
    const info = () =>
      sessions.request<{ accountId: string }>({
        url: `${BASE}/accounts/v1/account`,
        method: 'GET',
        timeoutMs: 5_000,
      })
    return {
      sessions,
      account,
      accountKey,
      reload,
      wipe,
      onEnded,
      onKeyRetired,
      info,
      store,
    }
  }

  return { clock, worker, disk, tab, events }
}

const openPayload = (body: Record<string, unknown> | null) =>
  JSON.parse(fromUtf8(fromB64u(String(body?.payload))))

describe('web sessions', () => {
  it('opens a session from a ticket, then calls with it', async () => {
    const { worker, disk, tab } = browser()
    const one = tab()
    expect(await one.account.start()).toEqual({
      status: 'signedOut',
      ended: null,
      keptData: false,
    })

    const signedIn = await one.account.openWebSessionWithTicket(
      'ticket-a',
      KEY_A
    )

    expect(signedIn).toEqual({
      accountId: 'acct000000000000000001',
      sessionId: 'sid-1',
      reload: false,
    })
    const payload = openPayload(worker.called('POST sessions')[0].body)
    expect(payload).toMatchObject({
      accountPub: PUB_A,
      ticket: 'ticket-a',
      device: 'sealed-label',
      appVersion: '9.8.7',
      capabilities: ['sync-everyone'],
    })
    expect(payload.attestation).toBeUndefined()
    expect(one.account.state()).toEqual({
      status: 'signedIn',
      accountId: 'acct000000000000000001',
    })
    expect(disk.secrets.get('account-key')).toEqual(KEY_A)
    // The stored session never holds the access token.
    expect(disk.session).toContain('sid-1')
    expect(disk.session).not.toContain('at-')

    expect((await one.info()).data.accountId).toBe('acct000000000000000001')
    // The access token from the open: no refresh needed.
    expect(worker.called('POST sessions/refresh')).toHaveLength(0)
  })

  it('sends the same signed request again when the answer was lost', async () => {
    const { worker, tab } = browser()
    const one = tab()
    await one.account.start()
    worker.lose.set('POST sessions', 1)

    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)

    const [first, second] = worker.called('POST sessions')
    expect(second.body).toEqual(first.body)
    expect(worker.sessions).toHaveLength(1)
  })

  it('refreshes with its capabilities, sliding the session’s expiry', async () => {
    const { worker, clock, tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    clock.now += 100 * DAY

    await one.info()

    const [refresh] = worker.called('POST sessions/refresh')
    expect(refresh.body).toMatchObject({
      appVersion: '9.8.7',
      capabilities: ['sync-everyone'],
    })
    expect(JSON.parse(disk.session!).sessionExpiresAt).toBe(
      clock.now + 180 * DAY
    )
  })

  it('refreshes once for two tabs at once, sharing the new token', async () => {
    const { worker, clock, tab } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    const two = tab()
    await two.account.start()
    expect(two.account.state()).toMatchObject({ status: 'signedIn' })
    clock.now += ACCESS_LIFETIME_MS

    const [a, b] = await Promise.all([one.info(), two.info()])

    expect(a.data.accountId).toBe(b.data.accountId)
    expect(worker.called('POST sessions/refresh')).toHaveLength(1)
    const tokens = worker.called('GET account').length
    // Both used the one refreshed token, and nothing was reused.
    expect(worker.sessions[0].ended).toBeNull()
    expect(tokens).toBe(2)
    expect(one.sessions.snapshot()?.sessionId).toBe('sid-1')
    expect(two.sessions.snapshot()?.sessionId).toBe('sid-1')
  })

  it('never presents a refresh token another tab replaced', async () => {
    const { worker, clock, tab } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    const two = tab()
    await two.account.start()
    await two.info()
    // Tab one refreshes; then, much later, tab two needs to.
    clock.now += ACCESS_LIFETIME_MS
    await one.info()
    await settle()
    clock.now += ACCESS_LIFETIME_MS
    await two.info()

    const refreshes = worker.called('POST sessions/refresh')
    expect(refreshes).toHaveLength(2)
    expect(refreshes[1].body?.refreshToken).not.toBe(
      refreshes[0].body?.refreshToken
    )
    expect(worker.sessions[0].ended).toBeNull()
  })

  it('notes a status without writing back a replaced refresh token', async () => {
    const { clock, tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    const two = tab()
    await two.account.start()
    await two.info()
    clock.now += ACCESS_LIFETIME_MS
    await one.info()
    const newest = JSON.parse(disk.session!).refreshToken

    two.sessions.noteStatus(PUB_A, 'suspended')
    await settle()

    expect(JSON.parse(disk.session!)).toMatchObject({
      refreshToken: newest,
      status: 'suspended',
    })
  })

  it.each(['revoked', 'reused'] as const)(
    'wipes the browser at once when the server says %s',
    async (reason) => {
      const { worker, clock, tab, disk } = browser()
      const one = tab()
      await one.account.start()
      await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
      const two = tab()
      await two.account.start()
      worker.sessions[0].ended = reason
      clock.now += ACCESS_LIFETIME_MS

      const error = await one.info().catch((e: unknown) => e)
      await settle()

      expect(error).toBeInstanceOf(AccountSessionError)
      expect(error).toMatchObject({ failure: 'signedOut', ended: reason })
      expect(one.wipe).toHaveBeenCalledTimes(1)
      expect(one.onEnded).toHaveBeenCalledWith(reason, 'wiped', {
        fromTab: false,
      })
      // The other tab hears why too, so its sign-in screen can say so.
      expect(two.onEnded).toHaveBeenCalledWith(reason, 'wiped', {
        fromTab: true,
      })
      expect(disk.secrets.size).toBe(0)
      expect(disk.session).toBeNull()
      expect(one.reload).toHaveBeenCalled()
      // The other tab finishes the wipe too, and reloads.
      expect(two.reload).toHaveBeenCalled()
      expect(two.accountKey.current()).toBeNull()
    }
  )

  it('marks a wipe pending before telling the other tabs, so one that survives finishes it', async () => {
    const { worker, clock, tab, disk, events } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.stores.set('contacts', 'A')
    const two = tab()
    await two.account.start()
    // The tab whose refresh is refused closes before its wipe is done.
    one.wipe.mockImplementation(() => new Promise<void>(() => {}))
    worker.sessions[0].ended = 'revoked'
    clock.now += ACCESS_LIFETIME_MS

    await one.info().catch(() => undefined)
    await settle()

    expect(events.indexOf('wipe-pending')).toBeGreaterThan(-1)
    expect(events.indexOf('wipe-pending')).toBeLessThan(events.indexOf('wipe'))
    expect(two.wipe).toHaveBeenCalled()
    expect(disk.stores.size).toBe(0)
    expect(disk.secrets.size).toBe(0)
    expect(two.reload).toHaveBeenCalled()
  })

  it('keeps the data when a refresh it sent never had its answer stored', async () => {
    const { worker, clock, tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.stores.set('contacts', 'A')
    clock.now += ACCESS_LIFETIME_MS
    // The refresh reaches ww-api, but the tab closes before keeping the answer.
    worker.lose.set('POST sessions/refresh', 1)
    await one.info().catch(() => undefined)

    // A minute and more later, a new page presents the token it still has.
    clock.now += 2 * 60_000
    const two = tab()
    await two.account.start()
    const error = await two.info().catch((e: unknown) => e)
    await settle()

    const refreshes = worker.called('POST sessions/refresh')
    expect(refreshes).toHaveLength(2)
    expect(refreshes[1].body?.refreshToken).toBe(
      refreshes[0].body?.refreshToken
    )
    expect(worker.sessions[0].ended).toBe('reused')
    expect(error).toMatchObject({ failure: 'signedOut', ended: 'expired' })
    expect(two.wipe).not.toHaveBeenCalled()
    expect(disk.stores.get('contacts')).toBe('A')
    expect(disk.secrets.get('account-key')).toEqual(KEY_A)
    expect(two.account.state()).toEqual({
      status: 'signedOut',
      ended: 'expired',
      keptData: true,
    })
    expect(disk.kv.has('refresh-in-flight')).toBe(false)
  })

  it('presents the token it holds when storing the last one failed', async () => {
    const { worker, clock, tab } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    clock.now += ACCESS_LIFETIME_MS
    for (let attempt = 0; attempt < STORE_ATTEMPTS; attempt++)
      one.store.write.mockRejectedValueOnce(new Error('QuotaExceededError'))
    await one.info()

    // Past the server's grace minute, the replaced token would be reuse.
    clock.now += ACCESS_LIFETIME_MS + 2 * 60_000
    await one.info()

    const refreshes = worker.called('POST sessions/refresh')
    expect(refreshes).toHaveLength(2)
    expect(refreshes[1].body?.refreshToken).not.toBe(
      refreshes[0].body?.refreshToken
    )
    expect(worker.sessions[0].ended).toBeNull()
  })

  it('sends no refresh while the browser says it is offline', async () => {
    const { worker, clock, tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    clock.now += ACCESS_LIFETIME_MS
    vi.stubGlobal('navigator', { onLine: false })
    try {
      await expect(one.info()).rejects.toMatchObject({ failure: 'offline' })
    } finally {
      vi.unstubAllGlobals()
    }
    expect(worker.called('POST sessions/refresh')).toHaveLength(0)
    expect(disk.kv.has('refresh-in-flight')).toBe(false)
  })

  it('clears the in-flight mark once the new refresh token is stored', async () => {
    const { clock, tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    clock.now += ACCESS_LIFETIME_MS

    await one.info()

    expect(disk.kv.has('refresh-in-flight')).toBe(false)
  })

  it.each(['expired', 'replaced'] as const)(
    'keeps the key and data, and asks to sign in, when the server says %s',
    async (reason) => {
      const { worker, clock, tab, disk } = browser()
      const one = tab()
      await one.account.start()
      await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
      const two = tab()
      await two.account.start()
      worker.sessions[0].ended = reason
      clock.now += ACCESS_LIFETIME_MS

      await expect(one.info()).rejects.toMatchObject({
        failure: 'signedOut',
        ended: reason,
      })
      await settle()

      expect(one.wipe).not.toHaveBeenCalled()
      expect(disk.secrets.get('account-key')).toEqual(KEY_A)
      expect(disk.session).toBeNull()
      const signIn = { status: 'signedOut', ended: reason, keptData: true }
      expect(one.account.state()).toEqual(signIn)
      expect(two.account.state()).toEqual(signIn)
      expect(one.onEnded).toHaveBeenCalledWith(reason, 'signIn', {
        fromTab: false,
      })
      expect(two.onEnded).toHaveBeenCalledWith(reason, 'signIn', {
        fromTab: true,
      })
      // Nothing more goes out until the User signs in.
      await expect(two.info()).rejects.toMatchObject({ failure: 'signedOut' })

      // The same account picks up where it was.
      const again = await one.account.openWebSessionWithTicket(
        'ticket-a2',
        KEY_A
      )
      expect(again.reload).toBe(false)
      expect(one.wipe).not.toHaveBeenCalled()
      expect((await one.info()).data.accountId).toBe('acct000000000000000001')
    }
  )

  it('shows sign-in once a session reaches its expiry here', async () => {
    const { clock, tab, worker } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    clock.now += 181 * DAY

    await expect(one.info()).rejects.toMatchObject({
      failure: 'signedOut',
      ended: 'expired',
    })
    expect(worker.called('POST sessions/refresh')).toHaveLength(0)
    expect(one.account.state()).toMatchObject({ ended: 'expired' })
  })

  it('signs in on a fresh browser without wiping, and notes whose data it is', async () => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()

    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)

    expect(one.wipe).not.toHaveBeenCalled()
    expect(disk.kv.get('owner')).toBe('acct000000000000000001')
  })

  it('names no owner when the session couldn’t be kept', async () => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()
    one.store.write.mockRejectedValue(new Error('quota'))

    await expect(
      one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    ).rejects.toMatchObject({ reason: 'storage' })

    expect(disk.kv.has('owner')).toBe(false)
  })

  it('never replaces the key of an account a sign-up may have made', async () => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()
    const theirs = new Uint8Array(32).fill(42)
    disk.secrets.set('account-key', theirs)
    disk.kv.set('web-signup', {
      accountId: 'acct000000000000000009',
      accountPub: deriveAccountSigningKey(theirs).publicKey,
      stage: 'sent',
    })

    await expect(
      one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    ).rejects.toMatchObject({ reason: 'signUpPending' })

    expect(disk.secrets.get('account-key')).toEqual(theirs)
    expect(disk.kv.has('owner')).toBe(false)
  })

  it('says storage failed when it can’t tell whose key is here', async () => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()
    disk.kv.set('web-signup', 'not a mark')
    one.accountKey.readStored = async () => {
      throw new Error('blocked')
    }

    await expect(
      one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    ).rejects.toMatchObject({ reason: 'storage' })
  })

  it('keeps the key of the account the sign-up made', async () => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()
    disk.secrets.set('account-key', KEY_A)
    disk.kv.set('web-signup', {
      accountId: 'acct000000000000000001',
      accountPub: deriveAccountSigningKey(KEY_A).publicKey,
      stage: 'created',
    })

    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)

    expect(disk.kv.get('owner')).toBe('acct000000000000000001')
  })

  it('keeps data made signed out as signed out’s when the session couldn’t be kept', async () => {
    const { tab, disk } = browser()
    disk.kv.set('owner', '')
    const one = tab()
    await one.account.start()
    one.store.write.mockRejectedValue(new Error('quota'))

    await expect(
      one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    ).rejects.toMatchObject({ reason: 'storage' })

    expect(disk.kv.get('owner')).toBe('')
  })

  it('switching accounts closes the old session, wipes, and reloads every tab before the new key is used', async () => {
    const { tab, disk, worker, events } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.stores.set('contacts', 'A')
    const two = tab()
    await two.account.start()
    const seen: (Uint8Array | null)[] = []
    one.accountKey.subscribe((key) => seen.push(key))

    const other = await one.account.openWebSessionWithTicket('ticket-b', KEY_B)
    await settle()

    expect(other).toMatchObject({
      accountId: 'acct000000000000000002',
      reload: true,
    })
    // Account A's session ended before its data went.
    expect(worker.sessions[0].ended).toBe('revoked')
    expect(events.indexOf('DELETE sessions/current')).toBeLessThan(
      events.indexOf('wipe')
    )
    expect(one.wipe).toHaveBeenCalledTimes(1)
    expect(disk.stores.size).toBe(0)
    // Nothing in this page saw B's key: it reloads first.
    expect(seen.every((key) => key === null)).toBe(true)
    expect(one.accountKey.current()).toBeNull()
    expect(one.account.state().status).not.toBe('signedIn')
    expect(one.reload).toHaveBeenCalled()
    expect(two.reload).toHaveBeenCalled()
    expect(disk.secrets.get('account-key')).toEqual(KEY_B)
    expect(JSON.parse(disk.session!).accountPub).toBe(PUB_B)
    expect(disk.kv.get('owner')).toBe('acct000000000000000002')

    // After the reload, the page is account B's.
    const reloaded = tab()
    expect(await reloaded.account.start()).toEqual({
      status: 'signedIn',
      accountId: 'acct000000000000000002',
    })
    expect((await reloaded.info()).data.accountId).toBe(
      'acct000000000000000002'
    )
  })

  it('runs onStored once the new key is stored, before any tab reloads', async () => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.stores.set('contacts', 'A')
    const seen: { key: Uint8Array | undefined; reloaded: boolean }[] = []

    await one.account.openWebSessionWithTicket('ticket-b', KEY_B, {
      onStored: async () => {
        seen.push({
          key: disk.secrets.get('account-key') as Uint8Array | undefined,
          reloaded: one.reload.mock.calls.length > 0,
        })
      },
    })

    expect(seen).toEqual([{ key: KEY_B, reloaded: false }])
    expect(one.reload).toHaveBeenCalled()
  })

  it('reloads anyway when onStored hangs', async () => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.stores.set('contacts', 'A')

    await one.account.openWebSessionWithTicket('ticket-b', KEY_B, {
      onStored: () => new Promise<void>(() => {}),
    })

    expect(one.reload).toHaveBeenCalled()
  })

  it.each([
    [
      'the key won’t open',
      (disk: { secrets: Map<string, Uint8Array> }) =>
        disk.secrets.delete('account-key'),
    ],
    [
      'nothing says whose data it is',
      (disk: { kv: Map<string, unknown> }) => disk.kv.delete('owner'),
    ],
  ])('wipes before another account when %s', async (_, lose) => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.stores.set('contacts', 'A')
    disk.session = null
    lose(disk as never)
    const two = tab()
    await two.account.start()

    const signedIn = await two.account.openWebSessionWithTicket(
      'ticket-b',
      KEY_B
    )

    expect(signedIn.reload).toBe(true)
    expect(two.wipe).toHaveBeenCalledTimes(1)
    expect(disk.stores.size).toBe(0)
    expect(disk.kv.get('owner')).toBe('acct000000000000000002')
  })

  it('keeps data made while signed out, and wipes data nobody owns', async () => {
    const { tab, disk } = browser()
    // The launch found the stores empty: what's made before sign-in is nobody's.
    disk.kv.set('owner', '')
    disk.stores.set('preferences', 'defaults')
    const one = tab()
    expect(await one.account.start()).toMatchObject({ keptData: false })

    const signedIn = await one.account.openWebSessionWithTicket(
      'ticket-a',
      KEY_A
    )

    expect(signedIn.reload).toBe(false)
    expect(one.wipe).not.toHaveBeenCalled()
    expect(disk.stores.get('preferences')).toBe('defaults')
    expect(disk.kv.get('owner')).toBe('acct000000000000000001')
  })

  it('keeps the data for the account it belongs to, even when its key was lost', async () => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.stores.set('contacts', 'A')
    disk.session = null
    disk.secrets.delete('account-key')
    const two = tab()
    expect(await two.account.start()).toMatchObject({ keptData: true })

    const again = await two.account.openWebSessionWithTicket('ticket-a2', KEY_A)

    expect(again.reload).toBe(false)
    expect(two.wipe).not.toHaveBeenCalled()
    expect(disk.stores.get('contacts')).toBe('A')
  })

  it('signs in again while signed in as the same account: keeps the data, and closes the session it replaces', async () => {
    const { tab, disk, worker } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.stores.set('contacts', 'A')
    const before = JSON.parse(disk.session!).sessionId

    const again = await one.account.openWebSessionWithTicket('ticket-a2', KEY_A)

    expect(again.reload).toBe(false)
    expect(again.sessionId).not.toBe(before)
    expect(one.wipe).not.toHaveBeenCalled()
    expect(disk.stores.get('contacts')).toBe('A')
    expect(JSON.parse(disk.session!).sessionId).toBe(again.sessionId)
    // This browser holds one session, not two.
    expect(worker.sessions.find((x) => x.sessionId === before)?.ended).toBe(
      'revoked'
    )
    expect(one.account.state()).toMatchObject({ status: 'signedIn' })
    expect((await one.info()).data.accountId).toBe('acct000000000000000001')
  })

  it('signing in again keeps the new session before closing the one it replaces', async () => {
    const { tab, disk, events } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    one.store.write.mockImplementation(async (value: string | null) => {
      events.push(`store ${value ? JSON.parse(value).sessionId : null}`)
      disk.session = value
    })

    await one.account.openWebSessionWithTicket('ticket-a2', KEY_A)

    const stored = events.indexOf('store sid-2')
    expect(stored).toBeGreaterThan(-1)
    expect(events.indexOf('DELETE sessions/current')).toBeGreaterThan(stored)
    expect(events).not.toContain('store null')
  })

  it('signing in again keeps the session it would replace when the new one can’t be saved', async () => {
    const { tab, disk, worker } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.stores.set('contacts', 'A')
    one.store.write.mockRejectedValue(new Error('quota'))

    const error = await one.account
      .openWebSessionWithTicket('ticket-a2', KEY_A)
      .catch((e: unknown) => e)
    await settle()

    expect(error).toMatchObject({ reason: 'storage' })
    expect(worker.sessions[0].ended).toBeNull()
    expect(worker.sessions[1].ended).toBe('revoked')
    expect(one.account.state()).toMatchObject({ status: 'signedIn' })
    expect(disk.stores.get('contacts')).toBe('A')
    // Still signed in with a session that works.
    expect((await one.info()).data.accountId).toBe('acct000000000000000001')
    expect(worker.sessions[0].ended).toBeNull()
  })

  it('never wipes for another account when asked to keep the data (Sign In Again)', async () => {
    const { tab, disk, worker } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.stores.set('contacts', 'A')

    const error = await one.account
      .openWebSessionWithTicket('ticket-b', KEY_B, { keepData: true })
      .catch((e: unknown) => e)
    await settle()

    expect(error).toBeInstanceOf(WebSignInError)
    expect((error as WebSignInError).reason).toBe('otherAccount')
    expect(one.wipe).not.toHaveBeenCalled()
    expect(one.reload).not.toHaveBeenCalled()
    expect(disk.stores.get('contacts')).toBe('A')
    expect(disk.secrets.get('account-key')).toEqual(KEY_A)
    // B's session closes; A's stays.
    expect(worker.sessions[1].ended).toBe('revoked')
    expect(worker.sessions[0].ended).toBeNull()
    expect(one.account.state()).toMatchObject({
      status: 'signedIn',
      accountId: 'acct000000000000000001',
    })
  })

  it('refuses with the sign-up guard or Sign In Again’s, each in its own case', async () => {
    const { tab, disk, worker } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.stores.set('contacts', 'A')
    const theirs = deriveAccountSigningKey(new Uint8Array(32).fill(9)).publicKey
    const stillA = () => {
      expect(disk.secrets.get('account-key')).toEqual(KEY_A)
      expect(disk.stores.get('contacts')).toBe('A')
      expect(one.account.state()).toMatchObject({
        status: 'signedIn',
        accountId: 'acct000000000000000001',
      })
    }
    const signInAgain = (ticket: string, key: Uint8Array) =>
      one.account
        .openWebSessionWithTicket(ticket, key, { keepData: true })
        .catch((e: unknown) => e)

    // A sign-up that may have made an account: Sign In Again as this
    // browser's own account, which Sign In Again allows, is refused by the
    // sign-up guard.
    disk.kv.set('web-signup', {
      accountId: 'acct000000000000000009',
      accountPub: theirs,
      stage: 'sent',
    })
    expect(await signInAgain('ticket-a2', KEY_A)).toMatchObject({
      reason: 'signUpPending',
    })
    stillA()

    // A sign-up's leftover no tab is making: the sign-up guard lets it
    // through, and Sign In Again refuses another account.
    disk.kv.set('web-signup', {
      accountId: 'acct000000000000000009',
      accountPub: theirs,
      stage: 'key',
    })
    expect(await signInAgain('ticket-b', KEY_B)).toMatchObject({
      reason: 'otherAccount',
    })
    stillA()

    // The same leftover while another tab is still making it: the sign-up
    // guard refuses first.
    disk.kv.set('ww-signup-held', true)
    expect(await signInAgain('ticket-b2', KEY_B)).toMatchObject({
      reason: 'signUpPending',
    })
    stillA()
    await settle()
    // Every refused session was closed on the server.
    expect(
      worker.sessions.slice(1).every((session) => session.ended !== null)
    ).toBe(true)

    // Neither applies: Sign In Again as this browser's account goes through.
    disk.kv.delete('web-signup')
    disk.kv.delete('ww-signup-held')
    const again = await one.account.openWebSessionWithTicket(
      'ticket-a3',
      KEY_A,
      { keepData: true }
    )
    expect(again.accountId).toBe('acct000000000000000001')
    stillA()
  })

  it('sends the same signed request when the User retries after a lost answer', async () => {
    const { worker, tab } = browser()
    const one = tab()
    await one.account.start()
    // The answer and its automatic retry are both lost.
    worker.lose.set('POST sessions', 2)
    await expect(
      one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    ).rejects.toThrow()

    const signedIn = await one.account.openWebSessionWithTicket(
      'ticket-a',
      KEY_A
    )

    expect(signedIn.sessionId).toBe('sid-1')
    const opens = worker.called('POST sessions')
    expect(opens).toHaveLength(3)
    expect(opens[2].body).toEqual(opens[0].body)
    expect(worker.sessions).toHaveLength(1)
  })

  it('closes a session for another account than the approval’s', async () => {
    const { tab, worker, disk } = browser()
    const one = tab()
    await one.account.start()

    const error = await one.account
      .openWebSessionWithTicket('ticket-a', KEY_A, {
        expectAccountId: 'acct000000000000000002',
      })
      .catch((e: unknown) => e)
    await settle()

    expect(error).toBeInstanceOf(WebSignInError)
    expect((error as WebSignInError).reason).toBe('wrongAccount')
    expect(worker.sessions[0].ended).toBe('revoked')
    expect(disk.secrets.size).toBe(0)
    expect(disk.session).toBeNull()
  })

  it('passes on a refused ticket, keeping nothing', async () => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()
    const error = await one.account
      .openWebSessionWithTicket('ticket-b', KEY_A)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).serverCode).toBe('ticket_invalid')
    expect(disk.secrets.size).toBe(0)
  })

  it('keeps web sign-up’s session for the key sign-up made', async () => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()
    const key = await one.accountKey.create()
    const opened: OpenedSession = {
      accountId: 'acct000000000000000009',
      status: 'active',
      sessionId: 'sid-signup',
      accessToken: 'at-signup',
      accessExpiresAt: 1_800_000_000_000 + ACCESS_LIFETIME_MS,
      refreshToken: 'rt-signup',
      sessionExpiresAt: 1_800_000_000_000 + 180 * DAY,
    }

    await one.account.adoptSignupSession(key, opened)

    expect(one.wipe).not.toHaveBeenCalled()
    expect(one.account.state()).toEqual({
      status: 'signedIn',
      accountId: 'acct000000000000000009',
    })
    expect(JSON.parse(disk.session!)).toMatchObject({ sessionId: 'sid-signup' })
  })

  it('signs out: closes the session, wipes, and reloads every tab', async () => {
    const { tab, worker, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    const two = tab()
    await two.account.start()

    await one.account.signOut()
    await settle()

    expect(worker.sessions[0].ended).toBe('revoked')
    expect(one.wipe).toHaveBeenCalledTimes(1)
    expect(disk.secrets.size).toBe(0)
    expect(disk.session).toBeNull()
    expect(one.reload).toHaveBeenCalled()
    expect(two.reload).toHaveBeenCalled()
    expect(two.wipe).not.toHaveBeenCalled()
  })

  it('sends what’s waiting before it signs out, and never waits long', async () => {
    const { tab, worker } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    const seen: Array<string | null> = []
    one.account.beforeSignOut(async () => {
      // The session is still open, so the push can go out.
      seen.push(worker.sessions[0].ended ?? null)
    })
    one.account.beforeSignOut(() => new Promise(() => {}))
    const gone = vi.fn()
    one.account.beforeSignOut(gone)()

    await one.account.signOut()

    expect(seen).toEqual([null])
    expect(gone).not.toHaveBeenCalled()
    expect(worker.sessions[0].ended).toBe('revoked')
    expect(one.wipe).toHaveBeenCalledTimes(1)
  })

  it('signs out offline without waiting on the network', async () => {
    const { tab, worker, clock, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    clock.now += ACCESS_LIFETIME_MS
    worker.hang.add('POST sessions/refresh')
    worker.hang.add('DELETE sessions/current')

    const startedAt = Date.now()
    await one.account.signOut()

    expect(Date.now() - startedAt).toBeLessThan(1_000)
    expect(one.wipe).toHaveBeenCalledTimes(1)
    expect(disk.secrets.size).toBe(0)
    expect(one.reload).toHaveBeenCalled()
  })

  it('opens nothing by itself without a session', async () => {
    const { tab, worker } = browser()
    const one = tab()
    await one.account.start()
    await one.accountKey.save(KEY_A)
    await expect(one.info()).rejects.toMatchObject({ failure: 'signedOut' })
    expect(worker.calls).toHaveLength(0)
  })
})

describe('web sessions across a key change', () => {
  const CHANGED_AT = 1_799_000_000_000

  /** Signed in to account A in `tabs` tabs, then its key changes elsewhere. */
  async function changedElsewhere({ tabs = 1 } = {}) {
    const browserState = browser()
    const { worker, clock, tab } = browserState
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    const others = []
    for (let i = 1; i < tabs; i++) {
      const other = tab()
      await other.account.start()
      others.push(other)
    }
    worker.changeKeyElsewhere(CHANGED_AT)
    clock.now += ACCESS_LIFETIME_MS
    await expect(one.info()).rejects.toMatchObject({
      failure: 'signedOut',
      ended: 'key_changed',
    })
    await settle()
    return { ...browserState, one, others }
  }

  /** `session/open`s without a ticket: none, now that nothing probes. */
  const ticketless = (worker: ReturnType<typeof browser>['worker']) =>
    worker
      .called('POST sessions')
      .filter(({ body }) => openPayload(body).ticket === undefined)

  it('keeps local data and forgets only the retired key, on the refusal alone', async () => {
    const { one, disk, worker } = await changedElsewhere()

    expect(ticketless(worker)).toHaveLength(0)
    expect(one.wipe).not.toHaveBeenCalled()
    expect(one.reload).not.toHaveBeenCalled()
    expect(one.onKeyRetired).toHaveBeenCalledWith(PUB_A, CHANGED_AT)
    expect(disk.secrets.has('account-key')).toBe(false)
    expect(disk.session).toBeNull()
    expect(disk.kv.get('owner')).toBe('acct000000000000000001')
    expect(disk.kv.has('key-retired-pending')).toBe(false)
    expect(one.onEnded).toHaveBeenCalledWith('key_changed', 'keyChanged', {
      fromTab: false,
    })
    expect(one.account.state()).toEqual({
      status: 'signedOut',
      ended: 'key_changed',
      changedAt: CHANGED_AT,
      keptData: true,
    })
  })

  it('reports the kept outcome only once the key is forgotten', async () => {
    const { one } = await changedElsewhere()
    expect(one.onKeyRetired.mock.invocationCallOrder[0]).toBeLessThan(
      one.onEnded.mock.invocationCallOrder[0]
    )
  })

  it('wipes a browser signed out before the key changed', async () => {
    const { worker, clock, tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    // The lost browser is signed out first, then the key changes.
    worker.sessions[0].ended = 'revoked'
    worker.changeKeyElsewhere(CHANGED_AT)
    clock.now += ACCESS_LIFETIME_MS
    await expect(one.info()).rejects.toMatchObject({ ended: 'revoked' })
    await settle()

    expect(one.onKeyRetired).not.toHaveBeenCalled()
    expect(one.wipe).toHaveBeenCalledTimes(1)
    expect(one.onEnded).toHaveBeenCalledWith('revoked', 'wiped', {
      fromTab: false,
    })
    expect(disk.secrets.size).toBe(0)
  })

  it('decides in the tab whose refresh was refused; the others follow it', async () => {
    const { one, others, disk } = await changedElsewhere({ tabs: 2 })
    const [two] = others

    expect(one.reload).not.toHaveBeenCalled()
    expect(two.onKeyRetired).not.toHaveBeenCalled()
    // The other tab reloads into the signed-out browser, data kept.
    expect(two.reload).toHaveBeenCalledTimes(1)
    for (const each of [one, two]) expect(each.wipe).not.toHaveBeenCalled()
    expect(two.onEnded).not.toHaveBeenCalled()
    expect(disk.secrets.has('account-key')).toBe(false)
    expect(disk.kv.get('owner')).toBe('acct000000000000000001')
  })

  it('reaches the same outcome when two tabs are refused at once', async () => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    const two = tab()
    await two.account.start()
    const ending = { accountPub: PUB_A, changedAt: CHANGED_AT }

    await Promise.all(
      [one, two].map(async (each) => {
        await each.account.decide('key_changed', ending)
        each.account.ended('key_changed', { fromTab: false })
      })
    )
    await settle()

    for (const each of [one, two]) expect(each.wipe).not.toHaveBeenCalled()
    expect(disk.secrets.has('account-key')).toBe(false)
    expect(disk.kv.get('owner')).toBe('acct000000000000000001')
    expect(disk.kv.has('key-retired-pending')).toBe(false)
  })

  it('wipes when two tabs disagree', async () => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.stores.set('contacts', '[…]')
    const two = tab()
    await two.account.start()

    await Promise.all([
      (async () => {
        await one.account.decide('key_changed', {
          accountPub: PUB_A,
          changedAt: CHANGED_AT,
        })
        one.account.ended('key_changed', { fromTab: false })
      })(),
      (async () => {
        await two.account.decide('revoked', {
          accountPub: PUB_A,
          changedAt: null,
        })
        two.account.ended('revoked', { fromTab: false })
      })(),
    ])
    await settle()

    expect(disk.secrets.size).toBe(0)
    expect(disk.stores.size).toBe(0)
    expect(disk.kv.has('owner')).toBe(false)
    // The next launch shows a plain signed-out browser, nothing kept.
    const three = tab()
    expect(await three.account.start()).toEqual({
      status: 'signedOut',
      ended: null,
      keptData: false,
    })
    expect(three.onKeyRetired).not.toHaveBeenCalled()
    expect(disk.kv.has('key-retired-pending')).toBe(false)
  })

  it('follows a wipe it hears while waiting for the refused tab', async () => {
    const { tab } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    const two = tab()
    await two.account.start()

    two.account.ended('key_changed', { fromTab: true })
    await settle()
    expect(two.reload).not.toHaveBeenCalled()
    await one.account.signOut()
    await settle()

    expect(two.reload).toHaveBeenCalledTimes(1)
    expect(two.accountKey.current()).toBeNull()
    expect(two.onKeyRetired).not.toHaveBeenCalled()
  })

  it('applies the decision at the next launch when the tab died before finishing', async () => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.stores.set('contacts', '[…]')

    // Refused, decided, then the tab closed before anything else.
    await one.account.decide('key_changed', {
      accountPub: PUB_A,
      changedAt: CHANGED_AT,
    })
    expect(disk.kv.get('key-retired-pending')).toEqual({
      accountPub: PUB_A,
      changedAt: CHANGED_AT,
    })

    const next = tab()
    expect(await next.account.start()).toEqual({
      status: 'signedOut',
      ended: 'key_changed',
      changedAt: CHANGED_AT,
      keptData: true,
    })
    expect(next.onKeyRetired).toHaveBeenCalledWith(PUB_A, CHANGED_AT)
    expect(disk.secrets.has('account-key')).toBe(false)
    expect(disk.stores.get('contacts')).toBe('[…]')
    expect(disk.kv.has('key-retired-pending')).toBe(false)
    expect(next.wipe).not.toHaveBeenCalled()
  })

  it('wipes instead of staying signed in when there is no data to keep', async () => {
    const { worker, clock, tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    // Nothing says whose the data is, so there's nothing to keep it for.
    disk.kv.delete('owner')
    worker.changeKeyElsewhere(CHANGED_AT)
    clock.now += ACCESS_LIFETIME_MS
    await expect(one.info()).rejects.toMatchObject({ ended: 'key_changed' })
    await settle()

    expect(one.wipe).toHaveBeenCalledTimes(1)
    expect(one.reload).toHaveBeenCalled()
    expect(one.onEnded).toHaveBeenCalledWith('key_changed', 'wiped', {
      fromTab: false,
    })
    expect(one.onKeyRetired).not.toHaveBeenCalled()
    expect(disk.secrets.size).toBe(0)
    expect(disk.kv.has('key-retired-pending')).toBe(false)
  })

  /** Refused, decided, then the tab closed before it cleared the session. */
  async function diedAfterDeciding() {
    const browserState = browser()
    const one = browserState.tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    browserState.disk.stores.set('contacts', '[…]')
    await one.account.decide('key_changed', {
      accountPub: PUB_A,
      changedAt: CHANGED_AT,
    })
    return browserState
  }

  it('wipes at launch too when there is no data to keep', async () => {
    const { tab, disk } = await diedAfterDeciding()
    disk.kv.delete('owner')

    const next = tab()
    await next.account.start()
    await settle()

    expect(next.wipe).toHaveBeenCalledTimes(1)
    expect(next.reload).toHaveBeenCalled()
    expect(next.onEnded).toHaveBeenCalledWith('key_changed', 'wiped', {
      fromTab: false,
    })
    expect(next.onKeyRetired).not.toHaveBeenCalled()
    expect(next.account.state().status).not.toBe('signedIn')
    expect(disk.secrets.size).toBe(0)
  })

  it('shows sign-in, keeping the note, when the note can’t be read at launch', async () => {
    const { tab, disk, worker } = await diedAfterDeciding()
    disk.unreadable.add('key-retired-pending')

    const next = tab()
    expect(await next.account.start()).toMatchObject({
      status: 'signedOut',
    })
    expect(next.wipe).not.toHaveBeenCalled()
    expect(disk.secrets.has('account-key')).toBe(true)
    expect(disk.kv.has('key-retired-pending')).toBe(true)
    await settle()
    expect(worker.called('POST sessions/refresh')).toHaveLength(0)
  })

  it('still wipes at the next launch when the refused tab closed as it decided to wipe', async () => {
    const { worker, clock, tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.stores.set('contacts', '[…]')
    // Nothing says whose the data is, so the refusal wipes.
    disk.kv.delete('owner')
    disk.dieMarkingWipe = true
    worker.changeKeyElsewhere(CHANGED_AT)
    clock.now += ACCESS_LIFETIME_MS
    await expect(one.info()).rejects.toMatchObject({ ended: 'key_changed' })
    await settle()
    expect(one.wipe).not.toHaveBeenCalled()

    disk.dieMarkingWipe = false
    const next = tab()
    await next.account.start()
    await settle()
    expect(next.account.state().status).not.toBe('signedIn')
    expect(next.wipe).toHaveBeenCalledTimes(1)
    expect(disk.stores.size).toBe(0)
    expect(disk.secrets.size).toBe(0)
  })

  it('still wipes at the next launch when a launch closed as it decided to wipe', async () => {
    const { tab, disk } = await diedAfterDeciding()
    disk.kv.delete('owner')
    disk.dieMarkingWipe = true
    const second = tab()
    await second.account.start()
    await settle()
    expect(second.wipe).not.toHaveBeenCalled()

    disk.dieMarkingWipe = false
    const third = tab()
    await third.account.start()
    await settle()
    expect(third.account.state().status).not.toBe('signedIn')
    expect(third.wipe).toHaveBeenCalledTimes(1)
    expect(disk.secrets.size).toBe(0)
  })

  it('forgets the dead session along with the key at launch', async () => {
    const { tab, disk, worker } = await diedAfterDeciding()
    expect(disk.session).not.toBeNull()

    const next = tab()
    await next.account.start()
    await settle()
    expect(disk.session).toBeNull()
    // Nothing refreshes it again, so the change is handled once.
    await expect(next.info()).rejects.toMatchObject({ failure: 'signedOut' })
    await settle()
    expect(next.onKeyRetired).toHaveBeenCalledTimes(1)
    expect(next.onEnded).not.toHaveBeenCalled()
    expect(worker.called('POST sessions/refresh')).toHaveLength(0)
  })

  it('keeps the note at launch until the app has handled the retired key', async () => {
    const { tab, disk } = await diedAfterDeciding()
    const next = tab()
    let handled!: () => void
    next.onKeyRetired.mockImplementationOnce(
      () => new Promise<void>((resolve) => (handled = resolve))
    )

    // The app's handling loads after `start`, which doesn't wait for it.
    expect(await next.account.start()).toMatchObject({
      status: 'signedOut',
      ended: 'key_changed',
    })
    expect(disk.kv.has('key-retired-pending')).toBe(true)
    handled()
    await settle()
    expect(disk.kv.has('key-retired-pending')).toBe(false)
  })

  it('wipes, and says so, when deciding what a refusal means fails', async () => {
    const { worker, clock, tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    disk.unreadable.add('key-retired-pending')
    worker.changeKeyElsewhere(CHANGED_AT)
    clock.now += ACCESS_LIFETIME_MS
    await expect(one.info()).rejects.toMatchObject({ ended: 'key_changed' })
    await settle()

    expect(one.wipe).toHaveBeenCalledTimes(1)
    expect(one.onEnded).toHaveBeenCalledWith('key_changed', 'wiped', {
      fromTab: false,
    })
  })

  it('never signs out a browser on another key for a leftover note', async () => {
    const { tab, disk, worker } = browser()
    worker.changeKeyElsewhere(CHANGED_AT)
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-new-key', KEY_A2)
    // A note for the key this browser held before (its sign-in with the new
    // key raced a closed tab's note).
    disk.kv.set('key-retired-pending', {
      accountPub: PUB_A,
      changedAt: CHANGED_AT,
    })

    const next = tab()
    expect(await next.account.start()).toEqual({
      status: 'signedIn',
      accountId: 'acct000000000000000001',
    })
    expect(next.onKeyRetired).not.toHaveBeenCalled()
    expect(disk.secrets.get('account-key')).toEqual(KEY_A2)
    expect(disk.kv.has('key-retired-pending')).toBe(false)
  })

  it('still signs out as changed at launch when the key was forgotten before the tab died', async () => {
    const { tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    await one.account.decide('key_changed', {
      accountPub: PUB_A,
      changedAt: CHANGED_AT,
    })
    // The key went; the tab closed before it cleared the note.
    await one.accountKey.retire(PUB_A)

    const next = tab()
    expect(await next.account.start()).toEqual({
      status: 'signedOut',
      ended: 'key_changed',
      changedAt: CHANGED_AT,
      keptData: true,
    })
    expect(next.onKeyRetired).toHaveBeenCalledWith(PUB_A, CHANGED_AT)
    expect(disk.kv.has('key-retired-pending')).toBe(false)
  })

  it('signing in clears a note no launch picked up', async () => {
    const { tab, disk, worker } = browser()
    worker.changeKeyElsewhere(CHANGED_AT)
    const one = tab()
    await one.account.start()
    disk.kv.set('key-retired-pending', {
      accountPub: PUB_A,
      changedAt: CHANGED_AT,
    })
    await one.account.openWebSessionWithTicket('ticket-new-key', KEY_A2)
    expect(disk.kv.has('key-retired-pending')).toBe(false)
  })

  it('keeps the note when the sign-in couldn’t be kept', async () => {
    const { tab, disk, worker } = browser()
    worker.changeKeyElsewhere(CHANGED_AT)
    const one = tab()
    await one.account.start()
    const note = { accountPub: PUB_A, changedAt: CHANGED_AT }
    disk.kv.set('key-retired-pending', note)
    one.store.write.mockRejectedValue(new Error('quota'))
    await expect(
      one.account.openWebSessionWithTicket('ticket-new-key', KEY_A2)
    ).rejects.toMatchObject({ reason: 'storage' })
    expect(disk.kv.get('key-retired-pending')).toEqual(note)
  })

  it('signs back in to the same account with the new key, keeping local data', async () => {
    const { one, disk } = await changedElsewhere()
    const again = await one.account.openWebSessionWithTicket(
      'ticket-new-key',
      KEY_A2
    )
    expect(again).toMatchObject({
      accountId: 'acct000000000000000001',
      reload: false,
    })
    expect(one.wipe).not.toHaveBeenCalled()
    expect(disk.secrets.get('account-key')).toEqual(KEY_A2)
    expect((await one.info()).data.accountId).toBe('acct000000000000000001')
  })

  it('wipes the old account’s data before another account signs in', async () => {
    const { one, disk } = await changedElsewhere()
    const other = await one.account.openWebSessionWithTicket('ticket-b', KEY_B)
    expect(one.wipe).toHaveBeenCalledTimes(1)
    expect(other.reload).toBe(true)
    expect(disk.secrets.get('account-key')).toEqual(KEY_B)
  })

  it('still wipes at once when signed out by another device, key unchanged', async () => {
    const { worker, clock, tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    worker.sessions[0].ended = 'revoked'
    clock.now += ACCESS_LIFETIME_MS
    await expect(one.info()).rejects.toMatchObject({ ended: 'revoked' })
    await settle()
    expect(one.onKeyRetired).not.toHaveBeenCalled()
    expect(one.wipe).toHaveBeenCalledTimes(1)
    expect(one.onEnded).toHaveBeenCalledWith('revoked', 'wiped', {
      fromTab: false,
    })
    expect(disk.secrets.size).toBe(0)
  })

  it('reloads the other tabs after its own key change stored the new key', async () => {
    const { tab } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    const two = tab()
    await two.account.start()

    one.account.rekeyed()
    await settle()

    expect(two.reload).toHaveBeenCalledTimes(1)
    expect(one.reload).not.toHaveBeenCalled()
    expect(two.wipe).not.toHaveBeenCalled()
  })

  it('never ends its session for a call with the new key before it moved there', async () => {
    const { worker, tab, disk } = browser()
    const one = tab()
    await one.account.start()
    await one.account.openWebSessionWithTicket('ticket-a', KEY_A)
    const request = {
      url: `${BASE}/accounts/v1/account`,
      method: 'GET' as const,
      timeoutMs: 5_000,
    }

    // Its own key change committed; the session hasn't moved to the new key.
    await expect(
      one.sessions.request(request, { accountKey: KEY_A2 })
    ).rejects.toMatchObject({ failure: 'cancelled' })
    expect(worker.sessions[0].ended).toBeNull()
    expect(disk.session).not.toBeNull()
    expect(one.onEnded).not.toHaveBeenCalled()

    expect(await one.sessions.repoint(PUB_A, PUB_A2)).toBe(true)
    expect(JSON.parse(disk.session!).accountPub).toBe(PUB_A2)
    expect(
      (await one.sessions.request(request, { accountKey: KEY_A2 })).status
    ).toBe(200)
  })
})
