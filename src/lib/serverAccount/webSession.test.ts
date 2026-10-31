import { ed25519 } from '@noble/curves/ed25519.js'
import { describe, expect, it, vi } from 'vitest'
import { concatBytes, fromB64u, fromUtf8, utf8 } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import { createWebAccountKey } from '@/lib/accountKey/webAccountKey'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
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
const PUB_A = deriveAccountSigningKey(KEY_A).publicKey
const PUB_B = deriveAccountSigningKey(KEY_B).publicKey
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const unauthorized = (reason?: string) =>
  json(401, {
    ok: false,
    error: 'unauthorized',
    code: 'unauthorized',
    ...(reason && { reason }),
  })

type Session = {
  sessionId: string
  accountId: string
  refreshToken: string
  accessTokens: Set<string>
  expiresAt: number
  ended: SessionEndReason | null
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
    ['ticket-b', PUB_B],
  ])
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
        if (session.ended) return unauthorized(session.ended)
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
  return { fetchImpl, sessions, calls, called, lose, hang }
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
    })
    const kvEntry = <T>(name: string) => ({
      read: async () => (disk.kv.get(name) as T | undefined) ?? null,
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
    })
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
      hasLocalData: () => disk.stores.size > 0,
      markWipePending: async () => {
        events.push('wipe-pending')
        disk.kv.set('wipe-pending', true)
      },
      wipe,
      reload,
      onEnded,
      now: () => clock.now,
      closeWaitMs: 50,
    })
    const info = () =>
      sessions.request<{ accountId: string }>({
        url: `${BASE}/accounts/v1/account`,
        method: 'GET',
        timeoutMs: 5_000,
      })
    return { sessions, account, accountKey, reload, wipe, onEnded, info, store }
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
      expect(one.onEnded).toHaveBeenCalledWith(reason, 'wiped')
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
      expect(one.onEnded).toHaveBeenCalledWith(reason, 'signIn')
      expect(two.onEnded).not.toHaveBeenCalled()
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
