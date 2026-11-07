import { createHash } from 'node:crypto'
import { ed25519 } from '@noble/curves/ed25519.js'
import { describe, expect, it, type Mock, vi } from 'vitest'
import {
  AttestationError,
  type AttestedRequest,
} from '@/lib/attestation/appAttest'
import { concatBytes, fromB64u, fromUtf8, utf8 } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import { openDeviceLabel } from '@/lib/serverAccount/deviceLabel'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  ACCESS_LIFETIME_MS,
  type AccountSessionDeps,
  AccountSessionError,
  type AccountSessionEvent,
  createAccountSessions,
  KEY_CHANGE_CLOSE_WAIT_MS,
  OPEN_RATE_LIMIT_DEFAULT_MS,
  OPEN_RETRY_AFTER_MS,
  SESSION_RENEW_WINDOW_MS,
  type SessionStore,
  sessionAccountForKey,
  STORE_ATTEMPTS,
  sessionEndWipes,
  staleTokenHash,
  toAccountSessionError,
} from '@/lib/serverAccount/session'
import { sessionAttestationHash } from '@/lib/serverAccount/sessionClient'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))

const BASE = 'https://api.test'
const DAY = 24 * 60 * 60 * 1000
const KEY_A = new Uint8Array(32).fill(1)
const KEY_B = new Uint8Array(32).fill(2)
const PUB_A = deriveAccountSigningKey(KEY_A).publicKey
const PUB_B = deriveAccountSigningKey(KEY_B).publicKey

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const failure = (status: number, code: string, extra = {}) =>
  json(status, { ok: false, error: code, code, ...extra })

type Session = {
  sessionId: string
  accountId: string
  refreshToken: string
  previousRefresh: string | null
  accessTokens: Set<string>
  expiresAt: number
  ended: boolean
  rotatedAt: number | null

  reused: boolean

  endedReason?: string
}

const GRACE_MS = 60_000

const ROUTES: Record<string, string> = {
  'POST sessions': 'session/open',
  'POST sessions/refresh': 'session/refresh',
  'DELETE sessions/current': 'session/close',
  'GET account': 'account/info',
}

function fakeWorker(clock: { now: number }) {
  const accounts = new Map<string, string>()
  const sessions: Session[] = []
  const calls: {
    op: string
    headers: Record<string, string>
    body: Record<string, unknown> | null
  }[] = []
  let issued = 0
  const override = new Map<
    string,
    (call: number) => Response | null | Promise<Response | null>
  >()

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

  const sessionFor = (headers: Record<string, string>) => {
    const token = headers.authorization?.replace(/^Bearer /, '')
    return sessions.find(
      (session) => !session.ended && token && session.accessTokens.has(token)
    )
  }

  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace(`${BASE}/accounts/v1/`, '')
    const op = ROUTES[`${init.method ?? 'GET'} ${path}`] ?? path
    const headers = (init.headers ?? {}) as Record<string, string>
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null
    calls.push({ op, headers, body })
    const forced = await override.get(op)?.(
      calls.filter((call) => call.op === op).length - 1
    )
    if (forced) return forced
    switch (op) {
      case 'session/open': {
        const payloadBytes = fromB64u(String(body?.payload))
        const payload = JSON.parse(fromUtf8(payloadBytes))
        const signed = ed25519.verify(
          fromB64u(String(body?.signature)),
          concatBytes(utf8('ww-account/v1\nsession/open\n'), payloadBytes),
          fromB64u(payload.accountPub)
        )
        if (!signed) return failure(401, 'bad_signature')

        const renewed =
          payload.renews === undefined ? undefined : sessionFor(headers)
        if (
          payload.renews !== undefined &&
          (!renewed ||
            renewed.sessionId !== payload.renews ||
            clock.now >= renewed.expiresAt ||
            accounts.get(payload.accountPub) !== renewed.accountId)
        )
          return failure(401, 'unauthorized')
        if (!payload.attestation && !headers['x-ww-dev-bypass'])
          return failure(403, 'attestation_failed', { reason: 'missing' })
        let accountId = accounts.get(payload.accountPub)

        if (payload.accountId !== undefined && accountId !== payload.accountId)
          return failure(404, 'unknown_account')
        if (!accountId) {
          accountId = `acct${String(accounts.size).padStart(18, '0')}`
          accounts.set(payload.accountPub, accountId)
        }
        const session: Session = {
          sessionId: `sid-${sessions.length + 1}`,
          accountId,
          refreshToken: `rt-${++issued}`,
          previousRefresh: null,
          accessTokens: new Set(),
          expiresAt: clock.now + 90 * DAY,
          ended: false,
          rotatedAt: null,
          reused: false,
        }
        sessions.push(session)
        if (renewed) {
          renewed.ended = true
          renewed.endedReason = 'renewed'
        }
        return json(201, {
          ok: true,
          accountId,
          status: 'active',
          sessionId: session.sessionId,
          ...tokens(session),
        })
      }
      case 'session/refresh': {
        const presented = body?.refreshToken
        const session = sessions.find(
          (entry) =>
            entry.refreshToken === presented ||
            entry.previousRefresh === presented
        )
        if (!session || session.ended || clock.now >= session.expiresAt)
          return failure(401, 'unauthorized', {
            ...(session?.endedReason && { reason: session.endedReason }),
          })
        if (session.refreshToken !== presented) {
          if (clock.now - session.rotatedAt! <= GRACE_MS)
            return json(200, { ok: true, ...tokens(session) })
          session.ended = true
          session.reused = true
          session.endedReason = 'reused'
          return failure(401, 'unauthorized', { reason: 'reused' })
        }
        session.previousRefresh = session.refreshToken
        session.rotatedAt = clock.now
        session.refreshToken = `rt-${++issued}`
        return json(200, { ok: true, ...tokens(session) })
      }
      case 'session/close': {
        const session = sessionFor(headers)
        if (!session) return failure(401, 'unauthorized')
        session.ended = true
        return json(200, { ok: true })
      }
      case 'account/info': {
        const session = sessionFor(headers)
        if (!session) return failure(401, 'unauthorized')
        return json(200, { ok: true, accountId: session.accountId })
      }
    }
    return failure(404, 'not_found')
  }) as unknown as typeof fetch

  const opsCalled = (op: string) => calls.filter((call) => call.op === op)
  return { fetchImpl, calls, sessions, accounts, override, opsCalled }
}

function fakeAttestation(
  options: { fail?: () => Error | null; devBypass?: boolean } = {}
) {
  const requests: AttestedRequest<unknown>[] = []
  const assert = async <T>(request: AttestedRequest<T>): Promise<T> => {
    requests.push(request as AttestedRequest<unknown>)
    const error = options.fail?.()
    if (error) throw error
    if (options.devBypass)
      return request.submit({ kind: 'devBypass', token: 'bypass-token' })
    return request.submit({
      kind: 'attestation',
      fields: {
        purpose: request.purpose,
        contentHash: request.contentHash,
        challenge: `challenge-${requests.length}`,
        assertion: 'assertion',
      },
    })
  }
  return { requests, assert: vi.fn(assert) as typeof assert & Mock }
}

function memoryStore(
  initial: string | null = null,
  staleHash: string | null = null
) {
  const store = {
    value: initial,
    writes: [] as (string | null)[],
    staleHash,

    failWrites: 0,
    read: vi.fn(async () => store.value),
    write: vi.fn(async (value: string | null) => {
      if (store.failWrites > 0) {
        store.failWrites--
        throw new Error('keystore refused')
      }
      store.value = value
      store.writes.push(value)
    }),
    stale: {
      read: async () => store.staleHash,
      write: async (hash: string | null) => {
        store.staleHash = hash
      },
    },
  }
  return store satisfies SessionStore
}

const nextLaunchStore = (store: ReturnType<typeof memoryStore>) =>
  memoryStore(store.value, store.staleHash)

function setup(
  options: {
    store?: ReturnType<typeof memoryStore>
    clock?: { now: number }
    worker?: ReturnType<typeof fakeWorker>
    attestation?: ReturnType<typeof fakeAttestation>

    device?: { key: Uint8Array }
    deps?: Partial<AccountSessionDeps>
  } = {}
) {
  const clock = options.clock ?? { now: 1_800_000_000_000 }
  const worker = options.worker ?? fakeWorker(clock)
  const store = options.store ?? memoryStore()
  const attestation = options.attestation ?? fakeAttestation()
  const events: AccountSessionEvent[] = []
  const onUpgradeRequired = vi.fn()
  const onStoreFailure = vi.fn()
  let nonce = 0
  const sessions = createAccountSessions({
    baseUrl: BASE,
    now: () => clock.now,
    localNow: () => clock.now,
    randomBytes: (length) => new Uint8Array(length).fill(++nonce % 256),
    attestation,
    store,
    accountKey: async () => options.device?.key ?? KEY_A,
    deviceLabel: () => ({
      name: 'Test Phone',
      platform: 'ios',
      model: 'iPhone 17',
    }),
    fetchImpl: worker.fetchImpl,
    onUpgradeRequired,
    onEvent: (event) => events.push(event),
    onStoreFailure,
    ...options.deps,
  })
  const info = (accountKey?: Uint8Array) =>
    sessions.request<{ accountId: string }>(
      {
        url: `${BASE}/accounts/v1/account`,
        method: 'GET',
        timeoutMs: 5_000,
      },
      { accountKey }
    )
  return {
    clock,
    worker,
    store,
    attestation,
    events,
    onUpgradeRequired,
    onStoreFailure,
    sessions,
    info,
  }
}

const openPayload = (worker: ReturnType<typeof fakeWorker>, index = 0) => {
  const call = worker.opsCalled('session/open')[index]
  return JSON.parse(fromUtf8(fromB64u(String(call.body?.payload))))
}

describe('account sessions', () => {
  it('opens a session bound to the account key, then calls with its token', async () => {
    const { worker, store, attestation, info, events } = setup()

    const response = await info()

    expect(response.data.accountId).toMatch(/^acct/)

    const hash = createHash('sha256')
      .update(`ww-account/v1/session\n${PUB_A}`, 'utf8')
      .digest('hex')
    expect(sessionAttestationHash(PUB_A)).toBe(hash)
    expect(attestation.requests[0]).toMatchObject({
      purpose: 'account-session',
      contentHash: hash,
      requestHash: hash,
    })

    expect(attestation.requests[0].challenge).toBeUndefined()
    expect(Object.keys(worker.opsCalled('session/open')[0].body ?? {})).toEqual(
      ['payload', 'signature']
    )
    const payload = openPayload(worker)
    expect(payload).toMatchObject({
      accountPub: PUB_A,
      attestation: { purpose: 'account-session', assertion: 'assertion' },
    })
    expect(typeof payload.ts).toBe('number')
    expect(openDeviceLabel(KEY_A, PUB_A, payload.device)).toEqual({
      name: 'Test Phone',
      platform: 'ios',
      model: 'iPhone 17',
    })
    expect(worker.opsCalled('account/info')[0].headers.authorization).toBe(
      'Bearer at-2'
    )

    const saved = JSON.parse(store.value!)
    expect(saved).toMatchObject({
      accountPub: PUB_A,
      refreshToken: 'rt-1',
      sessionId: 'sid-1',
    })
    expect(store.value).not.toContain('at-2')
    expect(events).toEqual([
      expect.objectContaining({
        op: 'session/open',
        outcome: 'ok',
        reason: 'new',
      }),
    ])
  })

  it('reuses the access token, and refreshes it ahead of expiry with a new refresh token', async () => {
    const { worker, store, clock, info } = setup()
    await info()
    await info()
    expect(worker.opsCalled('session/refresh')).toHaveLength(0)

    clock.now += ACCESS_LIFETIME_MS - 30_000
    await info()

    expect(worker.opsCalled('session/refresh')).toEqual([
      expect.objectContaining({
        body: { refreshToken: 'rt-1', capabilities: ['sync-everyone'] },
      }),
    ])
    expect(JSON.parse(store.value!).refreshToken).toBe('rt-3')
    clock.now += ACCESS_LIFETIME_MS
    await info()

    expect(worker.opsCalled('session/refresh')[1].body).toEqual({
      refreshToken: 'rt-3',
      capabilities: ['sync-everyone'],
    })
    expect(worker.opsCalled('session/open')).toHaveLength(1)
  })

  it('shares one refresh between concurrent callers', async () => {
    const { worker, clock, info } = setup()
    await info()
    clock.now += ACCESS_LIFETIME_MS

    await Promise.all([info(), info(), info(), info(), info()])

    expect(worker.opsCalled('session/refresh')).toHaveLength(1)
    expect(worker.opsCalled('session/open')).toHaveLength(1)
  })

  it('asks again at once when a refresh’s answer is lost, so the replaced token never comes back after its minute', async () => {
    const { worker, clock, store, info } = setup()
    await info()
    clock.now += ACCESS_LIFETIME_MS

    worker.override.set('session/refresh', (call) => {
      if (call !== 0) return null
      const session = worker.sessions[0]
      session.previousRefresh = session.refreshToken
      session.refreshToken = 'rt-lost'
      session.rotatedAt = clock.now
      throw new TypeError('Network request failed')
    })

    await expect(info()).resolves.toBeTruthy()
    clock.now += ACCESS_LIFETIME_MS
    await expect(info()).resolves.toBeTruthy()

    expect(worker.sessions[0]).toMatchObject({ ended: false })
    expect(worker.opsCalled('session/open')).toHaveLength(1)
    expect(
      worker.opsCalled('session/refresh').map((call) => call.body?.refreshToken)
    ).toEqual(['rt-1', 'rt-1', 'rt-lost'])
    expect(JSON.parse(store.value!)).toMatchObject({ sessionId: 'sid-1' })
  })

  it('shares one session/open between concurrent first callers', async () => {
    const { worker, attestation, sessions, info } = setup()

    await Promise.all([info(), info(), sessions.ensure(), info()])

    expect(attestation.assert).toHaveBeenCalledTimes(1)
    expect(worker.opsCalled('session/open')).toHaveLength(1)
  })

  it('refreshes once and retries on a 401, without looping', async () => {
    const { worker, info } = setup()
    await info()
    worker.override.set('account/info', (call) =>
      call === 1 ? failure(401, 'unauthorized') : null
    )

    await expect(info()).resolves.toBeTruthy()
    expect(worker.opsCalled('session/refresh')).toHaveLength(1)
    expect(
      worker.opsCalled('account/info').map((c) => c.headers.authorization)
    ).toEqual(['Bearer at-2', 'Bearer at-2', 'Bearer at-4'])

    worker.override.set('account/info', () => failure(401, 'unauthorized'))
    const error = await info().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).status).toBe(401)
    expect(worker.opsCalled('session/refresh')).toHaveLength(2)
  })

  it('opens a new session, attesting again, when the refresh is refused', async () => {
    const { worker, attestation, clock, info, events } = setup()
    await info()
    worker.sessions[0].ended = true
    clock.now += ACCESS_LIFETIME_MS

    await info()

    expect(attestation.assert).toHaveBeenCalledTimes(2)
    expect(worker.opsCalled('session/open')).toHaveLength(2)
    expect(events.at(-1)).toMatchObject({
      op: 'session/open',
      reason: 'ended',
      outcome: 'ok',
    })
  })

  it('says why the server refused a refresh', async () => {
    const { worker, clock, info, events } = setup()
    await info()
    clock.now += ACCESS_LIFETIME_MS
    worker.override.set('session/refresh', () =>
      failure(401, 'unauthorized', { reason: 'revoked' })
    )

    await info()

    expect(events).toContainEqual(
      expect.objectContaining({
        op: 'session/refresh',
        outcome: 'server',
        serverReason: 'revoked',
      })
    )
    expect(events.at(-1)).toMatchObject({ op: 'session/open', reason: 'ended' })
  })

  it('reads the refused refresh reason into the error', () => {
    const httpError = (body: Record<string, unknown>, status = 401) =>
      new HttpError(
        'client',
        status,
        String(body.error ?? '') || null,
        null,
        undefined,
        body
      )
    const ended = (body: Record<string, unknown>, status = 401) =>
      toAccountSessionError(httpError(body, status), { refresh: true }).ended
    expect(ended({ error: 'unauthorized', reason: 'revoked' })).toBe('revoked')
    expect(ended({ error: 'unauthorized', reason: 'reused' })).toBe('reused')
    expect(ended({ error: 'unauthorized', reason: 'replaced' })).toBe(
      'replaced'
    )
    expect(ended({ error: 'unauthorized', reason: 'expired' })).toBe('expired')
    expect(ended({ error: 'unauthorized', reason: 'later' })).toBe('unknown')
    expect(ended({ error: 'unauthorized' })).toBe('unknown')
    expect(ended({ error: 'forbidden' }, 403)).toBeNull()

    expect(
      toAccountSessionError(
        httpError({ error: 'unauthorized', reason: 'revoked' })
      ).ended
    ).toBeNull()
    expect(sessionEndWipes('revoked')).toBe(true)
    expect(sessionEndWipes('reused')).toBe(true)
    expect(sessionEndWipes('expired')).toBe(false)
    expect(sessionEndWipes('replaced')).toBe(false)
    expect(sessionEndWipes(null)).toBe(false)
  })

  it('sends the app version on open and refresh', async () => {
    const { worker, clock, info } = setup({
      deps: { appVersion: () => '3.12.0' },
    })
    await info()
    clock.now += ACCESS_LIFETIME_MS
    await info()

    expect(openPayload(worker).appVersion).toBe('3.12.0')
    expect(worker.opsCalled('session/refresh')[0].body).toEqual({
      refreshToken: expect.any(String),
      appVersion: '3.12.0',
      capabilities: ['sync-everyone'],
    })
  })

  it('asks for Cloud Sync for everyone on open and on every refresh', async () => {
    const { worker, clock, info } = setup()
    await info()
    clock.now += ACCESS_LIFETIME_MS
    await info()
    clock.now += ACCESS_LIFETIME_MS
    await info()

    expect(openPayload(worker).capabilities).toEqual(['sync-everyone'])
    const refreshes = worker.opsCalled('session/refresh')
    expect(refreshes.length).toBeGreaterThanOrEqual(2)
    for (const refresh of refreshes)
      expect(refresh.body).toMatchObject({ capabilities: ['sync-everyone'] })
  })

  it('leaves out an app version the server would refuse', async () => {
    for (const version of ['3.12', '3.12.0 (412)', `${'1'.repeat(31)}.0.0`]) {
      const { worker, clock, info } = setup({
        deps: { appVersion: () => version },
      })
      await info()
      clock.now += ACCESS_LIFETIME_MS
      await info()
      expect(openPayload(worker)).not.toHaveProperty('appVersion')
      expect(worker.opsCalled('session/refresh')[0].body).not.toHaveProperty(
        'appVersion'
      )
    }
  })

  it('renews the access token first when asked, signing a signed-out device back in', async () => {
    const onThisDeviceSession = vi.fn()
    const { worker, sessions, attestation } = setup({
      deps: { onThisDeviceSession },
    })
    const renewed = () =>
      sessions.request(
        { url: `${BASE}/accounts/v1/account`, method: 'GET', timeoutMs: 5_000 },
        { renew: true }
      )
    await renewed()

    expect(worker.opsCalled('session/refresh')).toHaveLength(0)

    await renewed()
    expect(worker.opsCalled('session/refresh')).toHaveLength(1)

    worker.sessions[0].ended = true
    worker.override.set('account/info', () =>
      json(200, { ok: true, accountId: worker.sessions[0].accountId })
    )
    await renewed()
    expect(attestation.assert).toHaveBeenCalledTimes(2)
    expect(sessions.snapshot()?.sessionId).toBe('sid-2')
    expect(onThisDeviceSession.mock.calls).toEqual([['sid-1'], ['sid-2']])
  })

  it('reports the stored session as this device’s after a relaunch', async () => {
    const first = setup()
    await first.info()
    const onThisDeviceSession = vi.fn()
    const relaunched = setup({
      store: memoryStore(first.store.value),
      clock: first.clock,
      worker: first.worker,
      deps: { onThisDeviceSession },
    })
    await relaunched.info()
    expect(onThisDeviceSession.mock.calls).toEqual([['sid-1']])
  })

  it('notes a suspended account from a refusal, and asks again once a call works', async () => {
    const onStatusChange = vi.fn()
    const onSucceededWhileSuspended = vi.fn()
    const { worker, sessions, info } = setup({
      deps: { onStatusChange, onSucceededWhileSuspended },
    })
    await info()
    expect(onSucceededWhileSuspended).not.toHaveBeenCalled()

    worker.override.set('account/info', () => failure(403, 'suspended'))
    await expect(info()).rejects.toBeInstanceOf(HttpError)
    expect(onStatusChange).toHaveBeenCalledWith(PUB_A, 'suspended')
    expect(sessions.snapshot()?.status).toBe('suspended')

    worker.override.delete('account/info')
    await expect(
      sessions.withSession(async () => {
        throw Object.assign(new Error('relay'), {
          status: 403,
          code: 'suspended',
        })
      })
    ).rejects.toThrow('relay')
    expect(onStatusChange).toHaveBeenCalledTimes(1)

    await info()
    expect(onSucceededWhileSuspended).toHaveBeenCalledWith(KEY_A)

    sessions.noteStatus(PUB_A, 'active')
    expect(onStatusChange).toHaveBeenLastCalledWith(PUB_A, 'active')
    await info()
    expect(onSucceededWhileSuspended).toHaveBeenCalledTimes(1)
  })

  it('opens a new session after 90 days without trying to refresh', async () => {
    const { worker, clock, info, events } = setup()
    await info()
    clock.now += 90 * DAY

    await info()

    expect(worker.opsCalled('session/refresh')).toHaveLength(0)
    expect(worker.opsCalled('session/open')).toHaveLength(2)
    expect(events.at(-1)).toMatchObject({ reason: 'expired' })
  })

  it('keeps the refresh token through a dropped connection', async () => {
    const { worker, store, clock, info } = setup()
    await info()
    clock.now += ACCESS_LIFETIME_MS

    worker.override.set('session/refresh', (call) => {
      if (call <= 1) throw new TypeError('Network request failed')
      return null
    })

    await expect(info()).rejects.toMatchObject({ failure: 'offline' })

    expect(worker.opsCalled('session/refresh')).toHaveLength(2)
    expect(JSON.parse(store.value!).refreshToken).toBe('rt-1')
    await expect(info()).resolves.toBeTruthy()
    expect(worker.opsCalled('session/open')).toHaveLength(1)
  })

  it('asks again at once when a refresh’s answer is lost, so the replaced token never ends the session', async () => {
    const clock = { now: 1_800_000_000_000 }
    const worker = fakeWorker(clock)

    let lose = false
    const fetchImpl = (async (url: string, init: RequestInit) => {
      const response = await worker.fetchImpl(url, init)
      if (lose && url.endsWith('/sessions/refresh')) {
        lose = false
        throw new TypeError('The network connection was lost.')
      }
      return response
    }) as typeof fetch
    const { store, info } = setup({ clock, worker, deps: { fetchImpl } })
    await info()
    clock.now += ACCESS_LIFETIME_MS
    lose = true

    await expect(info()).resolves.toBeTruthy()

    const refreshes = worker.opsCalled('session/refresh')
    expect(refreshes.map((call) => call.body?.refreshToken)).toEqual([
      'rt-1',
      'rt-1',
    ])
    expect(JSON.parse(store.value!).refreshToken).toBe('rt-3')

    clock.now += 6 * 60 * 60_000
    await expect(info()).resolves.toBeTruthy()
    expect(worker.sessions[0]).toMatchObject({ ended: false, reused: false })
    expect(worker.opsCalled('session/open')).toHaveLength(1)
  })

  it('holds background time from the refresh through the keystore write', async () => {
    let held = 0
    let holds = 0
    const backgroundTime = async <T>(run: () => Promise<T>): Promise<T> => {
      holds++
      held++
      try {
        return await run()
      } finally {
        held--
      }
    }
    const { worker, store, clock, info } = setup({ deps: { backgroundTime } })
    const heldDuring: number[] = []
    store.write.mockImplementation(async (value) => {
      heldDuring.push(held)
      store.value = value
    })

    await info()
    expect(holds).toBe(1)

    await info()
    expect(holds).toBe(1)

    clock.now += ACCESS_LIFETIME_MS
    await info()

    expect(holds).toBe(2)
    expect(worker.opsCalled('session/refresh')).toHaveLength(1)

    expect(heldDuring).toEqual([1, 1])
    expect(held).toBe(0)
  })

  it('never presents a refused refresh token again, in this launch or the next', async () => {
    let error: Error | null = null
    const attestation = fakeAttestation({ fail: () => error })
    const { worker, store, clock, info, events } = setup({ attestation })
    await info()
    worker.sessions[0].ended = true
    clock.now += ACCESS_LIFETIME_MS
    error = new AttestationError('serverUnavailable')

    await expect(info()).rejects.toMatchObject({ failure: 'attestation' })
    expect(worker.opsCalled('session/refresh')).toHaveLength(1)
    expect(JSON.parse(store.value!)).toMatchObject({ ended: true })

    clock.now += OPEN_RETRY_AFTER_MS.temporary
    await expect(info()).rejects.toMatchObject({ failure: 'attestation' })
    expect(worker.opsCalled('session/refresh')).toHaveLength(1)

    error = null
    const next = setup({
      clock,
      worker,
      attestation,
      store: nextLaunchStore(store),
    })
    await expect(next.info()).resolves.toBeTruthy()
    expect(worker.opsCalled('session/refresh')).toHaveLength(1)
    expect(next.events.at(-1)).toMatchObject({
      op: 'session/open',
      reason: 'ended',
      outcome: 'ok',
    })
    expect(JSON.parse(next.store.value!).ended).toBeUndefined()
    expect(events.filter((event) => event.op === 'session/refresh')).toEqual([
      expect.objectContaining({ outcome: 'server' }),
    ])
  })

  it('keeps a rotated refresh token out of use until the keystore has it', async () => {
    const { worker, store, clock, info } = setup()
    await info()
    clock.now += ACCESS_LIFETIME_MS
    let release!: () => void
    store.write.mockImplementationOnce(
      (value) =>
        new Promise<void>((resolve) => {
          release = () => {
            store.value = value
            resolve()
          }
        })
    )

    const pending = info()
    await vi.waitFor(() => expect(store.write).toHaveBeenCalledTimes(2))
    expect(worker.opsCalled('session/refresh')).toHaveLength(1)

    expect(worker.opsCalled('account/info')).toHaveLength(1)

    release()
    await pending
    expect(JSON.parse(store.value!).refreshToken).toBe('rt-3')
    expect(worker.opsCalled('account/info')).toHaveLength(2)
  })

  it('retries a keystore write that fails once, without marking anything', async () => {
    const { store, clock, info, onStoreFailure } = setup()
    await info()
    clock.now += ACCESS_LIFETIME_MS
    store.failWrites = 1

    await info()

    expect(JSON.parse(store.value!).refreshToken).toBe('rt-3')
    expect(store.staleHash).toBeNull()
    expect(onStoreFailure).not.toHaveBeenCalled()
  })

  it('uses a refresh token it couldn’t save for this launch, and the next launch opens a new session instead of presenting the stale one', async () => {
    const first = setup()
    await first.info()
    first.clock.now += ACCESS_LIFETIME_MS
    first.store.failWrites = STORE_ATTEMPTS

    await expect(first.info()).resolves.toBeTruthy()

    expect(
      first.worker.opsCalled('account/info').at(-1)?.headers.authorization
    ).toBe('Bearer at-4')
    expect(first.onStoreFailure).toHaveBeenCalledWith('save', expect.any(Error))

    expect(JSON.parse(first.store.value!).refreshToken).toBe('rt-1')
    expect(first.store.staleHash).toBe(staleTokenHash('rt-1'))
    expect(first.store.staleHash).not.toContain('rt-1')
    await first.info()
    expect(first.worker.opsCalled('session/refresh')).toHaveLength(1)

    first.clock.now += 60 * 60_000
    const relaunched = setup({
      store: nextLaunchStore(first.store),
      clock: first.clock,
      worker: first.worker,
    })
    await relaunched.info()

    expect(
      first.worker.opsCalled('session/refresh').map((call) => call.body)
    ).toEqual([{ refreshToken: 'rt-1', capabilities: ['sync-everyone'] }])
    expect(relaunched.attestation.assert).toHaveBeenCalledTimes(1)
    expect(relaunched.events).toEqual([
      expect.objectContaining({
        op: 'session/open',
        reason: 'unsaved',
        outcome: 'ok',
      }),
    ])
    expect(JSON.parse(relaunched.store.value!).sessionId).toBe('sid-2')
    expect(relaunched.store.staleHash).toBeNull()
  })

  it('needs no new session once a later write works', async () => {
    const first = setup()
    await first.info()
    first.clock.now += ACCESS_LIFETIME_MS
    first.store.failWrites = STORE_ATTEMPTS
    await first.info()
    first.clock.now += ACCESS_LIFETIME_MS
    await first.info()
    expect(JSON.parse(first.store.value!).refreshToken).toBe('rt-5')
    expect(first.store.staleHash).toBeNull()

    const relaunched = setup({
      store: nextLaunchStore(first.store),
      clock: first.clock,
      worker: first.worker,
    })
    await relaunched.info()

    expect(relaunched.attestation.assert).not.toHaveBeenCalled()
    expect(first.worker.opsCalled('session/refresh').at(-1)?.body).toEqual({
      refreshToken: 'rt-5',
      capabilities: ['sync-everyone'],
    })
  })

  it('reports a delete the keystore refuses on close, and the next launch deletes the token instead of using it', async () => {
    const first = setup()
    await first.info()
    first.store.failWrites = STORE_ATTEMPTS

    await first.sessions.close()

    expect(first.worker.sessions[0].ended).toBe(true)
    expect(first.onStoreFailure).toHaveBeenCalledWith(
      'delete',
      expect.any(Error)
    )
    expect(first.store.value).not.toBeNull()
    expect(first.store.staleHash).toBe(staleTokenHash('rt-1'))
    expect(first.sessions.snapshot()).toBeNull()

    const relaunched = setup({
      store: nextLaunchStore(first.store),
      clock: first.clock,
      worker: first.worker,
    })
    await relaunched.sessions.ready()
    expect(relaunched.store.value).toBeNull()
    expect(relaunched.store.staleHash).toBeNull()
    expect(relaunched.sessions.snapshot()).toBeNull()
    await relaunched.info()
    expect(first.worker.opsCalled('session/refresh')).toHaveLength(0)
  })

  it('picks up the stored session after a relaunch without attesting', async () => {
    const first = setup()
    await first.info()

    const relaunched = setup({
      store: memoryStore(first.store.value),
      clock: first.clock,
      worker: first.worker,
    })
    await relaunched.info()

    expect(relaunched.attestation.assert).not.toHaveBeenCalled()
    expect(first.worker.opsCalled('session/refresh')[0].body).toEqual({
      refreshToken: 'rt-1',
      capabilities: ['sync-everyone'],
    })
  })

  it("never uses another account key's session, and ends it", async () => {
    const first = setup()
    await first.info(KEY_A)

    const relaunched = setup({
      store: memoryStore(first.store.value),
      clock: first.clock,
      worker: first.worker,
    })
    const answer = await relaunched.info(KEY_B)

    expect(answer.data.accountId).not.toBe(first.worker.accounts.get(PUB_A))
    expect(openPayload(first.worker, 1).accountPub).toBe(PUB_B)
    expect(JSON.parse(relaunched.store.value!).accountPub).toBe(PUB_B)
    await vi.waitFor(() => expect(first.worker.sessions[0].ended).toBe(true))

    const bearer = first.worker
      .opsCalled('account/info')[1]
      .headers.authorization.replace('Bearer ', '')
    const sessionB = first.worker.sessions.find(
      (session) => session.accountId === first.worker.accounts.get(PUB_B)
    )
    expect(sessionB?.accessTokens.has(bearer)).toBe(true)
    expect(first.worker.sessions[0].accessTokens.has(bearer)).toBe(false)
  })

  it('reports 426 as Update Required, from open, refresh, or a route', async () => {
    const route = setup()
    await route.info()
    route.worker.override.set('account/info', () =>
      failure(426, 'upgrade_required')
    )
    await expect(route.info()).rejects.toMatchObject({
      name: 'AccountSessionError',
      failure: 'upgrade',
      status: 426,
    })
    expect(route.onUpgradeRequired).toHaveBeenCalledTimes(1)

    const refresh = setup()
    await refresh.info()
    refresh.clock.now += ACCESS_LIFETIME_MS
    refresh.worker.override.set('session/refresh', () =>
      failure(426, 'upgrade_required')
    )
    await expect(refresh.info()).rejects.toMatchObject({ failure: 'upgrade' })
    expect(refresh.onUpgradeRequired).toHaveBeenCalled()

    const open = setup()
    open.worker.override.set('session/open', () =>
      failure(426, 'upgrade_required')
    )
    await expect(open.info()).rejects.toMatchObject({ failure: 'upgrade' })
    expect(open.onUpgradeRequired).toHaveBeenCalled()

    await expect(open.info()).rejects.toMatchObject({ failure: 'upgrade' })
    expect(open.attestation.assert).toHaveBeenCalledTimes(1)
  })

  it('sends nothing while Update Required shows, then picks up again', async () => {
    let paused = false
    const { worker, attestation, info, onUpgradeRequired, sessions, clock } =
      setup({ deps: { paused: () => paused } })
    await info()
    const sent = worker.calls.length

    paused = true
    await expect(info()).rejects.toMatchObject({
      name: 'AccountSessionError',
      failure: 'upgrade',
      status: 426,
      serverCode: 'upgrade_required',
    })

    clock.now += ACCESS_LIFETIME_MS
    await expect(info()).rejects.toMatchObject({ failure: 'upgrade' })
    await expect(sessions.withSession(async () => 'ran')).rejects.toMatchObject(
      { failure: 'upgrade' }
    )
    expect(worker.calls).toHaveLength(sent)
    expect(attestation.assert).toHaveBeenCalledTimes(1)

    expect(onUpgradeRequired).not.toHaveBeenCalled()

    paused = false
    await expect(info()).resolves.toMatchObject({
      data: { accountId: expect.stringMatching(/^acct/) },
    })
    expect(worker.opsCalled('session/refresh')).toHaveLength(1)
  })

  it('names attestation failures and waits before attesting again', async () => {
    let error: Error | null = new AttestationError('unsupported')
    const attestation = fakeAttestation({ fail: () => error })
    const { sessions, clock, info, events } = setup({ attestation })

    const first = await info().catch((caught: unknown) => caught)
    expect(first).toBeInstanceOf(AccountSessionError)
    expect(first).toMatchObject({
      failure: 'attestation',
      attestation: 'device',
    })
    expect(events.at(-1)).toMatchObject({
      op: 'session/open',
      outcome: 'attestation',
      attestation: 'device',
    })

    await expect(info()).rejects.toMatchObject({ attestation: 'device' })
    expect(attestation.assert).toHaveBeenCalledTimes(1)
    expect(sessions.lastOpenFailure()).toMatchObject({ attestation: 'device' })

    clock.now += OPEN_RETRY_AFTER_MS.device
    await expect(info()).rejects.toMatchObject({ attestation: 'device' })
    expect(attestation.assert).toHaveBeenCalledTimes(2)

    error = null
    await expect(sessions.ensure(undefined, { retry: true })).resolves.toEqual(
      expect.objectContaining({ sessionId: 'sid-1' })
    )
    expect(attestation.assert).toHaveBeenCalledTimes(3)
    expect(sessions.lastOpenFailure()).toBeNull()
  })

  it('tells a temporary server-side check failure from a device failure', async () => {
    const temporary = setup()
    temporary.worker.override.set('session/open', () =>
      failure(403, 'attestation_failed', { reason: 'integrity_unavailable' })
    )
    await expect(temporary.info()).rejects.toMatchObject({
      failure: 'attestation',
      attestation: 'temporary',
      reason: 'integrity_unavailable',
    })

    const device = setup()
    device.worker.override.set('session/open', () =>
      failure(403, 'attestation_failed', { reason: 'device_integrity_failed' })
    )
    await expect(device.info()).rejects.toMatchObject({
      attestation: 'device',
      reason: 'device_integrity_failed',
    })

    const disabled = setup()
    disabled.worker.override.set('session/open', () => failure(503, 'disabled'))
    await expect(disabled.sessions.ensure()).rejects.toMatchObject({
      failure: 'unavailable',
      serverCode: 'disabled',
    })
  })

  it('waits out a rate-limited session/open, attesting again only after Retry-After', async () => {
    const { worker, attestation, sessions, clock, info, events } = setup()
    worker.override.set('session/open', (call) =>
      call === 0
        ? new Response(
            JSON.stringify({
              ok: false,
              error: 'rate_limited',
              code: 'rate_limited',
            }),
            {
              status: 429,
              headers: {
                'content-type': 'application/json',
                'retry-after': '120',
              },
            }
          )
        : null
    )

    await expect(info()).rejects.toMatchObject({
      name: 'AccountSessionError',
      failure: 'rateLimited',
      retryAfterMs: 120_000,
    })

    clock.now += 30_000
    await expect(info()).rejects.toMatchObject({
      failure: 'rateLimited',
      retryAfterMs: 90_000,
    })
    await expect(
      sessions.ensure(undefined, { retry: true })
    ).rejects.toMatchObject({ failure: 'rateLimited' })
    await expect(sessions.openDetached(KEY_A)).rejects.toMatchObject({
      failure: 'rateLimited',
    })
    expect(attestation.assert).toHaveBeenCalledTimes(1)
    expect(worker.opsCalled('session/open')).toHaveLength(1)
    expect(events).toEqual([
      expect.objectContaining({ op: 'session/open', outcome: 'rateLimited' }),
    ])

    clock.now += 90_000
    await expect(info()).resolves.toBeTruthy()
    expect(attestation.assert).toHaveBeenCalledTimes(2)
  })

  it('reads the wait from the body, or waits a minute, for that account key only', async () => {
    const { worker, attestation, clock, info } = setup()
    worker.override.set('session/open', (call) =>
      call === 0
        ? failure(429, 'rate_limited', { retryAfter: 30 })
        : call === 2
          ? failure(429, 'rate_limited')
          : null
    )

    await expect(info()).rejects.toMatchObject({ retryAfterMs: 30_000 })
    clock.now += 29_000
    await expect(info()).rejects.toMatchObject({ failure: 'rateLimited' })
    expect(attestation.assert).toHaveBeenCalledTimes(1)

    await expect(info(KEY_B)).resolves.toBeTruthy()
    expect(attestation.assert).toHaveBeenCalledTimes(2)

    clock.now += 1_000
    await expect(info()).rejects.toMatchObject({ failure: 'rateLimited' })
    expect(attestation.assert).toHaveBeenCalledTimes(3)
    clock.now += OPEN_RATE_LIMIT_DEFAULT_MS - 1
    await expect(info()).rejects.toMatchObject({ failure: 'rateLimited' })
    expect(attestation.assert).toHaveBeenCalledTimes(3)
    clock.now += 1
    await expect(info()).resolves.toBeTruthy()
  })

  it('sends the dev bypass header in place of an attestation', async () => {
    const attestation = fakeAttestation({ devBypass: true })
    const { worker, info } = setup({ attestation })

    await info()

    const open = worker.opsCalled('session/open')[0]
    expect(open.headers['x-ww-dev-bypass']).toBe('bypass-token')
    expect(openPayload(worker).attestation).toBeUndefined()
  })

  it('closes the session on the server and forgets it', async () => {
    const { worker, store, info, sessions } = setup()
    await info()

    await sessions.close()

    expect(worker.opsCalled('session/close')[0].headers.authorization).toBe(
      'Bearer at-2'
    )
    expect(worker.sessions[0].ended).toBe(true)
    expect(store.value).toBeNull()
    expect(sessions.snapshot()).toBeNull()
    await info()
    expect(worker.opsCalled('session/open')).toHaveLength(2)
  })

  it('refreshes first to close a session whose access token expired', async () => {
    const first = setup()
    await first.info()
    const relaunched = setup({
      store: memoryStore(first.store.value),
      clock: first.clock,
      worker: first.worker,
    })

    await relaunched.sessions.close()

    expect(first.worker.opsCalled('session/refresh')).toHaveLength(1)
    expect(first.worker.sessions[0].ended).toBe(true)
  })

  it('opens a detached session for a handoff, then adopts or closes it', async () => {
    const { worker, store, sessions, info } = setup()

    const detached = await sessions.openDetached(KEY_B)
    expect(detached.accountId).toBe(worker.accounts.get(PUB_B))
    expect(store.value).toBeNull()

    await detached.adopt()
    expect(JSON.parse(store.value!).accountPub).toBe(PUB_B)
    await info(KEY_B)
    expect(worker.opsCalled('session/open')).toHaveLength(1)

    const declined = await sessions.openDetached(KEY_A)
    await declined.close()
    expect(worker.sessions[1].ended).toBe(true)
    expect(JSON.parse(store.value!).accountPub).toBe(PUB_B)
  })

  it('replaces the key with no session in between: the old one ends first, and calls wait for the swap', async () => {
    const device = { key: KEY_A }
    const { worker, store, sessions, info, events } = setup({ device })
    await info()
    let waiting: Promise<unknown>[] = []
    let duringSwap: { ended: boolean; stored: string | null } | null = null

    await sessions.changeKey(
      async () => {
        duringSwap = {
          ended: worker.sessions[0].ended,
          stored: store.value,
        }

        waiting = [
          info().then((response) => response.data.accountId),
          info(KEY_A).catch((error: unknown) => error),
        ]
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(worker.opsCalled('session/open')).toHaveLength(1)
        expect(worker.opsCalled('session/refresh')).toHaveLength(0)
        device.key = KEY_B
      },
      { from: KEY_A, to: KEY_B }
    )

    expect(duringSwap).toEqual({ ended: true, stored: null })
    const [accountB, oldKey] = await Promise.all(waiting)
    expect(accountB).toBe(worker.accounts.get(PUB_B))

    expect(oldKey).toMatchObject({ failure: 'cancelled' })
    await expect(sessions.ensure(KEY_A)).rejects.toMatchObject({
      failure: 'cancelled',
    })
    expect(
      worker
        .opsCalled('session/open')
        .map((_, i) => openPayload(worker, i).accountPub)
    ).toEqual([PUB_A, PUB_B])
    expect(events.filter((event) => event.op === 'session/open')).toEqual([
      expect.objectContaining({ reason: 'new', outcome: 'ok' }),
      expect.objectContaining({ reason: 'new', outcome: 'ok' }),
    ])
    expect(JSON.parse(store.value!).accountPub).toBe(PUB_B)
  })

  it('adopts the new key’s session inside the swap, so nothing opens another', async () => {
    const device = { key: KEY_A }
    const { worker, sessions, info } = setup({ device })
    await info()
    const detached = await sessions.openDetached(KEY_B)
    let racing: Promise<unknown> | null = null

    await sessions.changeKey(
      async () => {
        racing = info()
        device.key = KEY_B
        await detached.adopt()
      },
      { from: KEY_A, to: KEY_B }
    )
    await racing

    expect(worker.opsCalled('session/open')).toHaveLength(2)
    expect(worker.sessions[0].ended).toBe(true)
    expect(worker.sessions[1].ended).toBe(false)
  })

  it('never brings back a replaced key by adopting a handoff’s session late', async () => {
    const device = { key: KEY_A }
    const { sessions, info } = setup({ device })
    await info()
    const late = await sessions.openDetached(KEY_A)
    await sessions.changeKey(
      async () => {
        device.key = KEY_B
      },
      { from: KEY_A, to: KEY_B }
    )

    await late.adopt()

    await expect(info(KEY_A)).rejects.toMatchObject({ failure: 'cancelled' })
  })

  it('forgets the old session even when the server can’t be told, waiting only so long', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const device = { key: KEY_A }
      const { worker, store, sessions, info } = setup({ device })
      await info()
      worker.override.set('session/close', () => new Promise(() => {}))
      const swap = vi.fn(async () => {
        device.key = KEY_B
      })

      const changed = sessions.changeKey(swap, { from: KEY_A, to: KEY_B })
      await vi.advanceTimersByTimeAsync(KEY_CHANGE_CLOSE_WAIT_MS - 1)
      expect(swap).not.toHaveBeenCalled()
      expect(store.value).toBeNull()
      expect(sessions.snapshot()).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      await changed
      expect(swap).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the old key usable when the swap fails', async () => {
    const { worker, sessions, info } = setup()
    await info()

    await expect(
      sessions.changeKey(
        async () => {
          throw new Error('keychain')
        },
        { from: KEY_A, to: KEY_B }
      )
    ).rejects.toThrow('keychain')

    await expect(info()).resolves.toBeTruthy()
    expect(worker.sessions[0].ended).toBe(true)
    expect(openPayload(worker, 1).accountPub).toBe(PUB_A)
  })

  it('sends no session/open the key change overtook while attesting', async () => {
    let release!: () => void
    const attestation = fakeAttestation()
    const assert = attestation.assert.getMockImplementation()!
    attestation.assert.mockImplementationOnce(async (request) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return assert(request)
    })
    const device = { key: KEY_A }
    const { worker, sessions, info } = setup({ attestation, device })

    const first = info().catch((error: unknown) => error)
    await vi.waitFor(() => expect(release).toBeDefined())
    await sessions.changeKey(
      async () => {
        device.key = KEY_B
      },
      { from: KEY_A, to: KEY_B }
    )
    release()

    expect(await first).toMatchObject({ failure: 'cancelled' })
    expect(worker.opsCalled('session/open')).toHaveLength(0)
    await info()
    expect(openPayload(worker).accountPub).toBe(PUB_B)
  })

  it('lets one caller stop waiting without cancelling the shared open', async () => {
    const { sessions, worker } = setup()
    const controller = new AbortController()
    const cancelled = sessions.ensure(undefined, { signal: controller.signal })
    const other = sessions.ensure()
    controller.abort()

    await expect(cancelled).rejects.toMatchObject({ failure: 'cancelled' })
    await expect(other).resolves.toMatchObject({ sessionId: 'sid-1' })
    expect(worker.opsCalled('session/open')).toHaveLength(1)
  })
})

describe('sessionAccountForKey', () => {
  const session = { accountId: 'acct_a', accountPub: PUB_A }

  it("is the session's account for its own key", () => {
    expect(sessionAccountForKey(session, KEY_A)).toBe('acct_a')
  })

  it('is no account once the key is another', () => {
    expect(sessionAccountForKey(session, KEY_B)).toBeNull()
  })

  it('is no account without a key or a session', () => {
    expect(sessionAccountForKey(session, null)).toBeNull()
    expect(sessionAccountForKey(null, KEY_A)).toBeNull()
  })
})

describe('a request pinned to an account', () => {
  const pinned = (sessions: ReturnType<typeof setup>['sessions'], id: string) =>
    sessions.request<{ accountId: string }>(
      { url: `${BASE}/accounts/v1/account`, method: 'GET', timeoutMs: 5_000 },
      { accountId: id }
    )

  it("runs on that account's session", async () => {
    const { sessions, info } = setup()
    const { data } = await info()
    await expect(pinned(sessions, data.accountId)).resolves.toBeTruthy()
  })

  it("isn't sent on another account's session", async () => {
    const { sessions, worker, info } = setup()
    await info()
    const error = await pinned(sessions, 'acct_previous').catch(
      (caught: unknown) => caught
    )
    expect(error).toBeInstanceOf(AccountSessionError)
    expect((error as AccountSessionError).failure).toBe('cancelled')
    expect(worker.opsCalled('account/info')).toHaveLength(1)
  })
})

describe('account sessions across a key change on this device', () => {
  const rekeyOnWorker = (worker: ReturnType<typeof fakeWorker>) => {
    const accountId = worker.accounts.get(PUB_A)!
    worker.accounts.delete(PUB_A)
    worker.accounts.set(PUB_B, accountId)
    const session = worker.sessions[0]
    session.accessTokens.add('at-rekeyed')
    return accountId
  }

  it('re-points its own session at the new key, keeping the session', async () => {
    const device = { key: KEY_A }
    const { worker, store, sessions, info, clock } = setup({ device })
    await info()
    const refreshToken = JSON.parse(store.value!).refreshToken
    const accountId = rekeyOnWorker(worker)

    await sessions.repoint(PUB_A, PUB_B, {
      accessToken: 'at-rekeyed',
      accessExpiresAt: clock.now + ACCESS_LIFETIME_MS,
    })
    device.key = KEY_B

    const response = await info()
    expect(response.data.accountId).toBe(accountId)
    expect(worker.opsCalled('session/open')).toHaveLength(1)
    expect(worker.opsCalled('session/close')).toHaveLength(0)
    expect(worker.calls.at(-1)!.headers.authorization).toBe('Bearer at-rekeyed')
    expect(JSON.parse(store.value!)).toMatchObject({
      accountPub: PUB_B,
      accountId,
      sessionId: 'sid-1',
      refreshToken,
    })
    expect(sessions.snapshot()).toMatchObject({ accountPub: PUB_B })

    await expect(info(KEY_A)).rejects.toMatchObject({ failure: 'cancelled' })
  })

  it('re-points a stored session it hasn’t used yet, and refreshes it next', async () => {
    const first = setup()
    await first.info()
    const accountId = rekeyOnWorker(first.worker)
    const { sessions, info, worker } = setup({
      store: nextLaunchStore(first.store),
      worker: first.worker,
      clock: first.clock,
      device: { key: KEY_B },
    })
    expect(await sessions.repoint(PUB_A, PUB_B)).toBe(true)
    expect((await info()).data.accountId).toBe(accountId)
    expect(worker.opsCalled('session/open')).toHaveLength(1)
    expect(worker.opsCalled('session/refresh')).toHaveLength(1)
  })

  it('re-points nothing when its session is another key’s', async () => {
    const { sessions, info, store } = setup()
    await info()
    const before = store.value
    const pubC = deriveAccountSigningKey(new Uint8Array(32).fill(3)).publicKey
    expect(await sessions.repoint(PUB_B, pubC)).toBe(false)
    expect(store.value).toBe(before)
  })

  it('waits for a refresh in flight, so the rotated refresh token is kept', async () => {
    const device = { key: KEY_A }
    const { worker, store, sessions, info, clock } = setup({ device })
    await info()
    clock.now += ACCESS_LIFETIME_MS
    let release!: () => void
    worker.override.set('session/refresh', async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return null
    })
    const refreshing = info()
    await new Promise((resolve) => setTimeout(resolve, 5))
    rekeyOnWorker(worker)
    const repointing = sessions.repoint(PUB_A, PUB_B)
    release()
    await refreshing
    await repointing
    expect(JSON.parse(store.value!)).toMatchObject({
      accountPub: PUB_B,
      refreshToken: worker.sessions[0].refreshToken,
    })
  })
})

describe('account sessions for a retired key', () => {
  it('fails as keyRetired with when it changed, and opens nothing more for it', async () => {
    const onKeyRetired = vi.fn()
    const { worker, info } = setup({ deps: { onKeyRetired } })
    worker.override.set('session/open', () =>
      failure(403, 'key_retired', { changedAt: 1_234 })
    )
    const error = await info().catch((failed: unknown) => failed)
    expect(error).toMatchObject({
      failure: 'keyRetired',
      changedAt: 1_234,
      serverCode: 'key_retired',
    })
    expect(onKeyRetired).toHaveBeenCalledWith(PUB_A, 1_234)
    await expect(info()).rejects.toMatchObject({ failure: 'keyRetired' })
    await expect(info()).rejects.toMatchObject({ failure: 'keyRetired' })
    expect(worker.opsCalled('session/open')).toHaveLength(1)
  })

  it('ends a session the server revoked, then reads the key as retired', async () => {
    const onKeyRetired = vi.fn()
    const { worker, info, clock } = setup({ deps: { onKeyRetired } })
    await info()
    worker.sessions[0].ended = true
    clock.now += ACCESS_LIFETIME_MS
    worker.override.set('session/open', () =>
      failure(403, 'key_retired', { changedAt: 9 })
    )
    await expect(info()).rejects.toMatchObject({ failure: 'keyRetired' })
    expect(onKeyRetired).toHaveBeenCalledWith(PUB_A, 9)
  })
})

describe('account sessions into a known account', () => {
  it('names the account it reopens', async () => {
    const { worker, info, clock } = setup()
    const accountId = (await info()).data.accountId
    worker.sessions[0].ended = true
    clock.now += ACCESS_LIFETIME_MS
    await info()
    expect(openPayload(worker, 0)).not.toHaveProperty('accountId')
    expect(openPayload(worker, 1).accountId).toBe(accountId)
  })

  it('names the account the caller knows on a first open, and on a detached one', async () => {
    const { worker, sessions } = setup()
    await sessions.ensure(KEY_A, { accountId: 'acct-known' }).catch(() => null)
    expect(openPayload(worker, 0).accountId).toBe('acct-known')

    expect(worker.accounts.size).toBe(0)
    await sessions
      .openDetached(KEY_B, { accountId: 'acct-b' })
      .catch(() => null)
    expect(openPayload(worker, 1).accountId).toBe('acct-b')
  })

  it('opens a key that replaced the stored one underneath into the same account', async () => {
    const onKeySwitched = vi.fn()
    const device = { key: KEY_A }
    const { worker, info } = setup({ device, deps: { onKeySwitched } })
    const accountId = (await info()).data.accountId

    worker.accounts.delete(PUB_A)
    worker.accounts.set(PUB_B, accountId)
    device.key = KEY_B
    expect((await info()).data.accountId).toBe(accountId)
    expect(openPayload(worker, 1)).toMatchObject({
      accountPub: PUB_B,
      accountId,
    })
    expect(onKeySwitched).toHaveBeenCalledWith(PUB_A, PUB_B)
  })

  it('opens another account’s key as before when it isn’t the old account’s', async () => {
    const device = { key: KEY_A }
    const { worker, info } = setup({ device })
    const accountId = (await info()).data.accountId
    device.key = KEY_B
    const other = (await info()).data.accountId
    expect(other).not.toBe(accountId)
    expect(openPayload(worker, 1).accountId).toBe(accountId)
    expect(openPayload(worker, 2)).not.toHaveProperty('accountId')
  })

  it('reads unknown_account as the key not being that account’s', async () => {
    const { worker, sessions } = setup()
    worker.override.set('session/open', () => failure(404, 'unknown_account'))
    await expect(
      sessions.openDetached(KEY_B, { accountId: 'acct-b' })
    ).rejects.toMatchObject({ serverCode: 'unknown_account' })
  })
})

describe('account sessions for a call that must not run twice', () => {
  it('throws a 401 as it is, without refreshing and running it again', async () => {
    const { sessions, info } = setup()
    await info()
    const run = vi.fn(async () => {
      throw new HttpError('client', 401, 'unauthorized')
    })
    await expect(
      sessions.withSession(run, { retryUnauthorized: false })
    ).rejects.toMatchObject({ status: 401 })
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('renewing a session before it ends', () => {
  async function nearEnd(daysLeft: number, options = {}) {
    const harness = setup(options)
    await harness.info()
    harness.clock.now += 90 * DAY - daysLeft * DAY
    return harness
  }
  const renewalOpens = (worker: ReturnType<typeof fakeWorker>) =>
    worker
      .opsCalled('session/open')
      .filter((_, index) => openPayload(worker, index).renews !== undefined)

  it('renews in the last 30 days after a refresh, without holding up the call', async () => {
    const onThisDeviceSession = vi.fn()
    const { worker, store, attestation, info, events, sessions } =
      await nearEnd(6, { deps: { onThisDeviceSession } })

    const response = await info()

    expect(worker.opsCalled('session/refresh')).toHaveLength(1)
    expect(worker.opsCalled('account/info')[1].headers.authorization).toBe(
      'Bearer at-4'
    )
    expect(response.data.accountId).toMatch(/^acct/)
    await vi.waitFor(() => expect(sessions.snapshot()?.sessionId).toBe('sid-2'))

    expect(attestation.assert).toHaveBeenCalledTimes(2)
    const [renewal] = renewalOpens(worker)
    expect(renewal.headers.authorization).toBe('Bearer at-4')
    expect(openPayload(worker, 1)).toMatchObject({
      accountPub: PUB_A,
      renews: 'sid-1',
      accountId: worker.sessions[0].accountId,
      attestation: { purpose: 'account-session' },
    })
    expect(worker.sessions[0]).toMatchObject({
      ended: true,
      endedReason: 'renewed',
    })
    expect(JSON.parse(store.value!)).toMatchObject({
      sessionId: 'sid-2',
      refreshToken: worker.sessions[1].refreshToken,
    })
    expect(onThisDeviceSession).toHaveBeenLastCalledWith('sid-2')
    expect(events.at(-1)).toMatchObject({
      op: 'session/open',
      outcome: 'ok',
      reason: 'renewed',
    })

    await info()
    expect(worker.opsCalled('account/info').at(-1)?.headers.authorization).toBe(
      `Bearer ${[...worker.sessions[1].accessTokens][0]}`
    )
    expect(worker.opsCalled('session/open')).toHaveLength(2)
  })

  it('leaves a session with more than 30 days alone', async () => {
    const { worker, info, clock } = await nearEnd(31)
    await info()
    clock.now += ACCESS_LIFETIME_MS
    await info()
    expect(worker.opsCalled('session/refresh')).toHaveLength(2)
    expect(worker.opsCalled('session/open')).toHaveLength(1)
    expect(SESSION_RENEW_WINDOW_MS).toBe(30 * DAY)
  })

  it('asks nothing extra at launch: a stored session renews on its first refresh, once', async () => {
    const first = setup()
    await first.info()
    first.clock.now += 85 * DAY
    const { worker, info, clock, sessions } = setup({
      clock: first.clock,
      worker: first.worker,
      store: nextLaunchStore(first.store),
    })
    await sessions.ready()
    expect(first.worker.calls.length).toBe(2)

    await info()
    await vi.waitFor(() => expect(renewalOpens(worker)).toHaveLength(1))
    for (let i = 0; i < 3; i++) {
      clock.now += ACCESS_LIFETIME_MS
      await info()
    }
    expect(renewalOpens(worker)).toHaveLength(1)
  })

  it('keeps the session when the renewal fails, tries once a launch, and opens as usual at the end', async () => {
    const { worker, store, info, clock, events, sessions } = await nearEnd(6)
    worker.override.set('session/open', (call) =>
      call === 1 ? failure(401, 'unauthorized') : null
    )

    await info()
    await vi.waitFor(() => expect(renewalOpens(worker)).toHaveLength(1))
    await sessions.ensure()
    expect(sessions.snapshot()?.sessionId).toBe('sid-1')
    expect(JSON.parse(store.value!).sessionId).toBe('sid-1')
    expect(events.at(-1)).toMatchObject({
      op: 'session/open',
      reason: 'renewed',
      outcome: 'server',
    })

    clock.now += ACCESS_LIFETIME_MS
    await info()
    expect(renewalOpens(worker)).toHaveLength(1)

    clock.now += 6 * DAY
    await info()
    expect(worker.opsCalled('session/open')).toHaveLength(3)
    expect(openPayload(worker, 2).renews).toBeUndefined()
    expect(events.at(-1)).toMatchObject({ reason: 'expired', outcome: 'ok' })
  })

  it('keeps the session when this device can’t attest', async () => {
    let failing = false
    const attestation = fakeAttestation({
      fail: () => (failing ? new AttestationError('serverUnavailable') : null),
    })
    const { worker, info, sessions } = await nearEnd(6, { attestation })
    failing = true

    await info()
    await vi.waitFor(() => expect(attestation.assert).toHaveBeenCalledTimes(2))
    await sessions.ensure()
    expect(sessions.snapshot()?.sessionId).toBe('sid-1')
    expect(worker.opsCalled('session/open')).toHaveLength(1)

    await expect(info()).resolves.toBeTruthy()
  })

  it('sends no renewal for a session closed while attesting', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    let calls = 0
    const base = fakeAttestation()
    const attestation = {
      ...base,
      assert: vi.fn(async <T>(request: AttestedRequest<T>) => {
        if (++calls === 2) await gate
        return base.assert(request)
      }),
    } as unknown as ReturnType<typeof fakeAttestation>
    const { worker, info, sessions, store } = await nearEnd(6, { attestation })

    await info()
    await vi.waitFor(() => expect(calls).toBe(2))
    await sessions.close()
    release()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(renewalOpens(worker)).toHaveLength(0)
    expect(store.value).toBeNull()
  })

  it('renews earlier with a longer window (the development override)', async () => {
    const { worker, info } = await nearEnd(45, {
      deps: { renewWindowMs: () => 60 * DAY },
    })
    await info()
    await vi.waitFor(() => expect(renewalOpens(worker)).toHaveLength(1))
  })

  it('closes a renewal it couldn’t save, and opens as usual instead of keeping it', async () => {
    const onThisDeviceSession = vi.fn()
    const { worker, store, info, sessions, events } = await nearEnd(6, {
      deps: { onThisDeviceSession },
    })
    onThisDeviceSession.mockClear()

    worker.override.set('session/open', (call) => {
      if (call === 1) store.failWrites = STORE_ATTEMPTS
      return null
    })

    await info()
    await vi.waitFor(() =>
      expect(worker.opsCalled('session/close')).toHaveLength(1)
    )

    expect(worker.sessions[1].ended).toBe(true)
    expect(worker.opsCalled('session/close')[0].headers.authorization).toBe(
      `Bearer ${[...worker.sessions[1].accessTokens][0]}`
    )
    expect(onThisDeviceSession).not.toHaveBeenCalledWith('sid-2')

    await info()
    expect(sessions.snapshot()?.sessionId).toBe('sid-3')
    expect(openPayload(worker, 2).renews).toBeUndefined()
    expect(events.at(-1)).toMatchObject({
      op: 'session/open',
      outcome: 'ok',
      reason: 'ended',
    })
    expect(worker.sessions.filter((session) => !session.ended)).toHaveLength(1)
  })

  it('reads a refresh refused as renewed', () => {
    const error = toAccountSessionError(
      new HttpError('client', 401, 'unauthorized', null, undefined, {
        error: 'unauthorized',
        reason: 'renewed',
      }),
      { refresh: true }
    )
    expect(error.ended).toBe('renewed')
    expect(sessionEndWipes('renewed')).toBe(false)
  })
})
