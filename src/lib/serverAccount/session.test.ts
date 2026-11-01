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
  type SessionStore,
  STORE_ATTEMPTS,
  staleTokenHash,
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
}

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
        if (!payload.attestation && !headers['x-ww-dev-bypass'])
          return failure(403, 'attestation_failed', { reason: 'missing' })
        let accountId = accounts.get(payload.accountPub)
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
        }
        sessions.push(session)
        return json(201, {
          ok: true,
          accountId,
          status: 'active',
          sessionId: session.sessionId,
          ...tokens(session),
        })
      }
      case 'session/refresh': {
        const session = sessions.find(
          (entry) => entry.refreshToken === body?.refreshToken
        )
        if (!session || session.ended || clock.now >= session.expiresAt)
          return failure(401, 'unauthorized')
        session.previousRefresh = session.refreshToken
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
      expect.objectContaining({ body: { refreshToken: 'rt-1' } }),
    ])
    expect(JSON.parse(store.value!).refreshToken).toBe('rt-3')
    clock.now += ACCESS_LIFETIME_MS
    await info()

    expect(worker.opsCalled('session/refresh')[1].body).toEqual({
      refreshToken: 'rt-3',
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
      if (call === 0) throw new TypeError('Network request failed')
      return null
    })

    await expect(info()).rejects.toMatchObject({ failure: 'offline' })
    expect(JSON.parse(store.value!).refreshToken).toBe('rt-1')
    await expect(info()).resolves.toBeTruthy()
    expect(worker.opsCalled('session/open')).toHaveLength(1)
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
    ).toEqual([{ refreshToken: 'rt-1' }])
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
