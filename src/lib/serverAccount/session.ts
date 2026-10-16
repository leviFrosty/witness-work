import {
  AttestationError,
  AttestationHttpError,
  type AttestedRequest,
} from '@/lib/attestation/appAttest'
import { toAttestationHttpError } from '@/lib/attestation/transport'
import {
  HttpError,
  type HttpResponse,
  request,
  type RequestOptions,
} from '@/lib/http/request'
import { type AccountStatus, isAccountStatus } from '@/lib/serverAccount/client'
import {
  type DeviceLabel,
  sealDeviceLabel,
} from '@/lib/serverAccount/deviceLabel'
import {
  type AccountSigningKey,
  deriveAccountSigningKey,
} from '@/lib/serverAccount/keys'
import {
  closeSession,
  type OpenedSession,
  refreshSession,
  sendSessionOpen,
  sessionAttestationHash,
} from '@/lib/serverAccount/sessionClient'

/**
 * Attested account sessions (ADR 0027, docs/accounts-protocol.md "Sessions"):
 * this device proves it's WitnessWork once, in `session/open`, and every
 * user-scoped ww-api call then carries a 15-minute bearer token. The access
 * token stays in memory; the refresh token is kept in the platform keystore,
 * never synced, together with the account key's public key, so another account
 * key never reuses this session.
 *
 * Callers use `request` (or `withSession` for transports `request()` doesn't
 * cover): it adds `Authorization`, refreshes ahead of expiry, refreshes once
 * and retries on a 401, and opens a new session (attesting again, without
 * asking the User) when the old one ended or reached its 90 days. A 426
 * `upgrade_required` calls `onUpgradeRequired`.
 */

/** Why this device couldn't prove it's WitnessWork. */
export type AttestationProblem =
  /**
   * It never can: a simulator, an iPhone without App Attest, Android without
   * Google Play, or ww-api found the device or app isn't genuine.
   */
  | 'device'
  /** Apple, Google or ww-api couldn't check right now; try again later. */
  | 'temporary'
  /** The check failed for another reason. */
  | 'failed'

export type AccountSessionFailure =
  | 'offline'
  | 'cancelled'
  /** Accounts are off on the server (`disabled`). */
  | 'unavailable'
  /** 426 `upgrade_required`: this app version is too old. */
  | 'upgrade'
  /** `attestation_failed`, or this device can't attest at all. */
  | 'attestation'
  | 'rateLimited'
  | 'server'

const KIND: Record<AccountSessionFailure, HttpError['kind']> = {
  offline: 'offline',
  cancelled: 'cancelled',
  unavailable: 'server',
  upgrade: 'client',
  attestation: 'client',
  rateLimited: 'rateLimited',
  server: 'server',
}

/**
 * A session couldn't be opened or used. An `HttpError`, so callers that sort
 * failures by `kind` and `serverCode` keep working.
 */
export class AccountSessionError extends HttpError {
  readonly failure: AccountSessionFailure
  /** Set for `attestation`. */
  readonly attestation: AttestationProblem | null
  /** The server's stable `reason` (`device_integrity_failed`, …). */
  readonly reason: string | null

  constructor(
    failure: AccountSessionFailure,
    details: {
      status?: number | null
      serverCode?: string | null
      retryAfterMs?: number | null
      attestation?: AttestationProblem
      reason?: string | null
    } = {}
  ) {
    super(
      KIND[failure],
      details.status ?? null,
      details.serverCode ?? null,
      details.retryAfterMs ?? null,
      `account session: ${failure}${details.attestation ? ` (${details.attestation})` : ''}`
    )
    this.name = 'AccountSessionError'
    this.failure = failure
    this.attestation =
      failure === 'attestation' ? (details.attestation ?? 'failed') : null
    this.reason = details.reason ?? null
  }
}

const DEVICE_REASONS = new Set([
  'device_integrity_failed',
  'app_not_recognized',
])
const TEMPORARY_REASONS = new Set([
  'integrity_unavailable',
  'storage_unavailable',
  'too_many_challenges',
])
const DEVICE_CODES = new Set([
  'unsupported',
  'deviceIneligible',
  'playServicesUnavailable',
])
const TEMPORARY_CODES = new Set([
  'serverUnavailable',
  'protocolUnavailable',
  'challengeExpired',
  'counterConflict',
])

/** The server's reason wins; then the device's own failure code. */
export function attestationProblemFor(
  code: string | null | undefined,
  reason: string | null | undefined
): AttestationProblem {
  if (reason && DEVICE_REASONS.has(reason)) return 'device'
  if (reason && TEMPORARY_REASONS.has(reason)) return 'temporary'
  if (code && DEVICE_CODES.has(code)) return 'device'
  if (code && TEMPORARY_CODES.has(code)) return 'temporary'
  return 'failed'
}

const isUpgrade = (status?: number | null, serverCode?: string | null) =>
  status === 426 || serverCode === 'upgrade_required'

function fromHttp(details: {
  status: number | null
  serverCode: string | null
  retryAfterMs: number | null
  reason: string | null
}): AccountSessionError {
  const { status, serverCode } = details
  if (isUpgrade(status, serverCode))
    return new AccountSessionError('upgrade', details)
  if (serverCode === 'disabled')
    return new AccountSessionError('unavailable', details)
  if (serverCode === 'attestation_failed')
    return new AccountSessionError('attestation', {
      ...details,
      attestation: attestationProblemFor(null, details.reason),
    })
  if (status === 429 || serverCode === 'rate_limited')
    return new AccountSessionError('rateLimited', details)
  return new AccountSessionError('server', details)
}

/** Any failure of opening, refreshing or using a session, normalized. */
export function toAccountSessionError(error: unknown): AccountSessionError {
  if (error instanceof AccountSessionError) return error
  if (error instanceof AttestationError) {
    if (error.code === 'cancelled') return new AccountSessionError('cancelled')
    if (error.code === 'network') return new AccountSessionError('offline')
    if (isUpgrade(error.status, error.serverCode))
      return new AccountSessionError('upgrade', {
        status: error.status,
        serverCode: error.serverCode,
      })
    return new AccountSessionError('attestation', {
      status: error.status,
      serverCode: error.serverCode,
      reason: error.reason,
      attestation: attestationProblemFor(error.code, error.reason),
    })
  }
  if (error instanceof AttestationHttpError) {
    if (error.kind === 'cancelled') return new AccountSessionError('cancelled')
    if (error.kind === 'network') return new AccountSessionError('offline')
    return fromHttp({
      status: error.status ?? null,
      serverCode: error.serverCode ?? null,
      retryAfterMs: error.retryAfterMs ?? null,
      reason: error.reason ?? null,
    })
  }
  if (error instanceof HttpError) {
    if (error.kind === 'cancelled') return new AccountSessionError('cancelled')
    if (error.kind === 'offline' || error.kind === 'timeout')
      return new AccountSessionError('offline', { status: error.status })
    const reason = (error.body as { reason?: unknown } | null)?.reason
    return fromHttp({
      status: error.status,
      serverCode: error.serverCode,
      retryAfterMs: error.retryAfterMs,
      reason: typeof reason === 'string' ? reason : null,
    })
  }
  return new AccountSessionError('server')
}

/** A bearer request the server refused for its token: refresh and retry. */
export const isUnauthorized = (error: unknown) =>
  error instanceof HttpError &&
  error.status === 401 &&
  (error.serverCode === 'unauthorized' || error.serverCode === null)

/** Where the refresh token is kept: the platform keystore in the app. */
export type SessionStore = {
  read: () => Promise<string | null>
  write: (value: string | null) => Promise<void>
}

/** Why a new session was opened. */
export type SessionOpenReason =
  /** None on this device for this account key. */
  | 'new'
  /** The session reached its 90 days. */
  | 'expired'
  /** The server ended it (a reused refresh token, or the 10-session cap). */
  | 'ended'
  /** For a key received from another device, before it replaces this one. */
  | 'handoff'

export type AccountSessionEvent = {
  op: 'session/open' | 'session/refresh' | 'session/close'
  outcome: 'ok' | AccountSessionFailure
  reason?: SessionOpenReason
  attestation?: AttestationProblem
  /** The server's stable reason, never anything identifying. */
  serverReason?: string
  ms: number
}

export type AccountSessionDeps = {
  baseUrl: string
  /** The server-calibrated clock (`syncNow`): request `ts` and expiries. */
  now: () => number
  /** The device clock, for the access token's 15 minutes. */
  localNow?: () => number
  randomBytes: (length: number) => Uint8Array
  attestation: { assert<T>(request: AttestedRequest<T>): Promise<T> }
  store: SessionStore
  /** This device's account key, created when there's none. */
  accountKey: () => Promise<Uint8Array>
  /** Sealed into `session/open` for the User's own devices to read. */
  deviceLabel?: () => DeviceLabel
  fetchImpl?: typeof fetch
  /** Ww-api answered 426 `upgrade_required`. */
  onUpgradeRequired?: () => void
  onEvent?: (event: AccountSessionEvent) => void
}

/** The account a session belongs to. */
export type AccountSessionInfo = {
  accountId: string
  status: AccountStatus
  sessionId: string
}

/** For the developer Tools: never a token. */
export type AccountSessionSnapshot = AccountSessionInfo & {
  accountPub: string
  /** Device clock. */
  accessExpiresAt: number | null
  /** Server clock. */
  sessionExpiresAt: number
}

/** A session opened for a key that isn't this device's yet (a handoff). */
export type DetachedSession = AccountSessionInfo & {
  /** Makes it this device's session, once the key is stored. */
  adopt: () => Promise<void>
  /** Ends it on the server instead. */
  close: () => Promise<void>
}

type Stored = {
  v: 1
  accountPub: string
  accountId: string
  status: AccountStatus
  sessionId: string
  refreshToken: string
  sessionExpiresAt: number
}

type Live = Stored & {
  accessToken: string | null
  /** Device clock. */
  accessExpiresAt: number
}

/** Refresh this long before the access token expires. */
export const ACCESS_REFRESH_MARGIN_MS = 60_000
/** The access token's lifetime, used when the clocks disagree. */
export const ACCESS_LIFETIME_MS = 15 * 60_000
/** Open a new session this long before the 90 days are up. */
export const SESSION_RENEW_MARGIN_MS = 10 * 60_000
/**
 * After a failed `session/open`, how long the same account key waits before
 * attesting again, unless the User asks (`retry`). Keeps a device that can't
 * attest from asking Apple or Google on every request.
 */
export const OPEN_RETRY_AFTER_MS: Record<AttestationProblem, number> = {
  device: 30 * 60_000,
  failed: 2 * 60_000,
  temporary: 60_000,
}

function parseStored(raw: string | null): Stored | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<Stored> | null
    if (
      value?.v === 1 &&
      typeof value.accountPub === 'string' &&
      typeof value.accountId === 'string' &&
      isAccountStatus(value.status) &&
      typeof value.sessionId === 'string' &&
      typeof value.refreshToken === 'string' &&
      typeof value.sessionExpiresAt === 'number'
    )
      return value as Stored
  } catch {
    // Unreadable: no session.
  }
  return null
}

const stored = (live: Live): Stored => ({
  v: 1,
  accountPub: live.accountPub,
  accountId: live.accountId,
  status: live.status,
  sessionId: live.sessionId,
  refreshToken: live.refreshToken,
  sessionExpiresAt: live.sessionExpiresAt,
})

const info = (live: Live): AccountSessionInfo => ({
  accountId: live.accountId,
  status: live.status,
  sessionId: live.sessionId,
})

/** Lets one caller stop waiting without cancelling shared work. */
function raceSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted)
    return Promise.reject(new AccountSessionError('cancelled'))
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(new AccountSessionError('cancelled'))
    signal.addEventListener('abort', aborted, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', aborted)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', aborted)
        reject(error)
      }
    )
  })
}

export function createAccountSessions(deps: AccountSessionDeps) {
  const localNow = deps.localNow ?? Date.now
  let live: Live | null = null
  let loading: Promise<void> | null = null
  /** Bumped when the session is closed, forgotten or replaced. */
  let generation = 0
  let flight: { pub: string; promise: Promise<Live> } | null = null
  let storeQueue: Promise<void> = Promise.resolve()
  let lastFailure: {
    pub: string
    error: AccountSessionError
    until: number
  } | null = null

  const clientOptions = (signal?: AbortSignal) => ({
    baseUrl: deps.baseUrl,
    fetchImpl: deps.fetchImpl,
    signal,
  })

  const emit = (event: AccountSessionEvent) => deps.onEvent?.(event)

  const upgradeRequired = () => deps.onUpgradeRequired?.()

  /** Store writes run in order, so a late delete never clears a new session. */
  function persist(value: Stored | null): Promise<void> {
    const json = value ? JSON.stringify(value) : null
    storeQueue = storeQueue
      .then(() => deps.store.write(json))
      .catch(() => undefined)
    return storeQueue
  }

  function load(): Promise<void> {
    loading ??= storeQueue.then(async () => {
      const saved = parseStored(await deps.store.read().catch(() => null))
      // A session opened or adopted while reading wins.
      if (saved && !live)
        live = { ...saved, accessToken: null, accessExpiresAt: 0 }
    })
    return loading
  }

  const sessionValid = (session: Live) =>
    session.sessionExpiresAt - deps.now() > SESSION_RENEW_MARGIN_MS

  const accessUsable = (session: Live, rejected?: string) =>
    session.accessToken !== null &&
    session.accessToken !== rejected &&
    session.accessExpiresAt - localNow() > ACCESS_REFRESH_MARGIN_MS &&
    sessionValid(session)

  /** The access token's expiry on the device clock. */
  const accessExpiry = (accessExpiresAt: number) => {
    const remaining = accessExpiresAt - deps.now()
    return (
      localNow() +
      (remaining > 0 && remaining <= ACCESS_LIFETIME_MS
        ? remaining
        : ACCESS_LIFETIME_MS)
    )
  }

  const toLive = (accountPub: string, opened: OpenedSession): Live => ({
    v: 1,
    accountPub,
    accountId: opened.accountId,
    status: opened.status,
    sessionId: opened.sessionId,
    refreshToken: opened.refreshToken,
    sessionExpiresAt: opened.sessionExpiresAt,
    accessToken: opened.accessToken,
    accessExpiresAt: accessExpiry(opened.accessExpiresAt),
  })

  function setLive(next: Live | null) {
    live = next
    void persist(next ? stored(next) : null)
  }

  async function timed<T>(
    op: AccountSessionEvent['op'],
    run: () => Promise<T>,
    extra: Partial<AccountSessionEvent> = {}
  ): Promise<T> {
    const started = localNow()
    try {
      const value = await run()
      emit({ op, outcome: 'ok', ms: localNow() - started, ...extra })
      return value
    } catch (error) {
      const failure = toAccountSessionError(error)
      emit({
        op,
        outcome: failure.failure,
        ms: localNow() - started,
        ...extra,
        ...(failure.attestation && { attestation: failure.attestation }),
        ...(failure.reason && { serverReason: failure.reason }),
      })
      if (failure.failure === 'upgrade') upgradeRequired()
      throw failure
    }
  }

  function deviceLabelFor(accountKey: Uint8Array, accountPub: string) {
    if (!deps.deviceLabel) return undefined
    try {
      return sealDeviceLabel(
        accountKey,
        accountPub,
        deps.deviceLabel(),
        deps.randomBytes(12)
      )
    } catch {
      // A label is optional; never fail a session over it.
      return undefined
    }
  }

  /**
   * Attests this device for the account key (the challenge from
   * `/attestation/v1/challenge`), then opens the session with the proof.
   */
  function open(
    accountKey: Uint8Array,
    key: AccountSigningKey,
    reason: SessionOpenReason,
    signal?: AbortSignal
  ): Promise<OpenedSession> {
    const hash = sessionAttestationHash(key.publicKey)
    const device = deviceLabelFor(accountKey, key.publicKey)
    return timed(
      'session/open',
      () =>
        deps.attestation.assert<OpenedSession>({
          purpose: 'account-session',
          contentHash: hash,
          requestHash: hash,
          submit: async (proof, attemptSignal) => {
            try {
              return await sendSessionOpen(
                { proof, device },
                {
                  ...clientOptions(attemptSignal),
                  key,
                  now: deps.now,
                  randomBytes: deps.randomBytes,
                }
              )
            } catch (error) {
              throw toAttestationHttpError(error)
            }
          },
          signal,
        }),
      { reason }
    )
  }

  /** Best effort: ends a session nobody will use again. */
  async function closeTokens(session: {
    accessToken: string | null
    refreshToken: string
    accessUsable: boolean
  }) {
    try {
      let token = session.accessUsable ? session.accessToken : null
      if (!token)
        token = (
          await timed('session/refresh', () =>
            refreshSession(session.refreshToken, clientOptions())
          )
        ).accessToken
      const accessToken = token
      await timed('session/close', () =>
        closeSession(accessToken, clientOptions())
      )
    } catch {
      // Offline, or already over: the server ends it by itself in time.
    }
  }

  /**
   * A usable session for this key: the current one, refreshed, or a new one.
   * One at a time; callers for the same key share it.
   */
  async function acquire(
    accountKey: Uint8Array,
    key: AccountSigningKey,
    call: { rejected?: string; retry?: boolean; signal?: AbortSignal }
  ): Promise<Live> {
    await load()
    const pub = key.publicKey
    if (live?.accountPub === pub && accessUsable(live, call.rejected))
      return live
    if (flight?.pub === pub) return raceSignal(flight.promise, call.signal)

    const startedAt = generation
    const run = async (): Promise<Live> => {
      const current = live
      if (current?.accountPub === pub && accessUsable(current, call.rejected))
        return current
      let reason: SessionOpenReason = 'new'
      if (current && current.accountPub !== pub) {
        // Another account key's session: end it rather than leave it behind.
        live = null
        void persist(null)
        void closeTokens({ ...current, accessUsable: accessUsable(current) })
      } else if (current && !sessionValid(current)) {
        reason = 'expired'
      } else if (current) {
        try {
          const tokens = await timed('session/refresh', () =>
            refreshSession(current.refreshToken, clientOptions())
          )
          if (startedAt !== generation)
            throw new AccountSessionError('cancelled')
          const next: Live = {
            ...current,
            refreshToken: tokens.refreshToken,
            sessionExpiresAt: tokens.sessionExpiresAt,
            accessToken: tokens.accessToken,
            accessExpiresAt: accessExpiry(tokens.accessExpiresAt),
          }
          setLive(next)
          return next
        } catch (error) {
          // Only an ended or expired session opens a new one; offline keeps
          // the refresh token for next time.
          if (
            !(
              error instanceof AccountSessionError &&
              error.failure === 'server' &&
              error.status === 401
            )
          )
            throw error
          reason = 'ended'
        }
      }
      if (
        !call.retry &&
        lastFailure?.pub === pub &&
        lastFailure.until > localNow()
      )
        throw lastFailure.error
      let opened: OpenedSession
      try {
        opened = await open(accountKey, key, reason)
      } catch (error) {
        const failure = toAccountSessionError(error)
        if (failure.failure === 'attestation')
          lastFailure = {
            pub,
            error: failure,
            until: localNow() + OPEN_RETRY_AFTER_MS[failure.attestation!],
          }
        else if (failure.failure === 'upgrade')
          lastFailure = { pub, error: failure, until: Infinity }
        throw failure
      }
      if (startedAt !== generation) {
        void closeTokens({ ...opened, accessUsable: true })
        throw new AccountSessionError('cancelled')
      }
      lastFailure = null
      const next = toLive(pub, opened)
      setLive(next)
      return next
    }
    const previous = flight?.promise
    const promise = (previous ?? Promise.resolve())
      .catch(() => undefined)
      .then(run)
    flight = { pub, promise }
    void promise
      .catch(() => undefined)
      .finally(() => {
        if (flight?.promise === promise) flight = null
      })
    return raceSignal(promise, call.signal)
  }

  const keyFor = async (accountKey?: Uint8Array) => {
    const bytes = accountKey ?? (await deps.accountKey())
    return { bytes, key: deriveAccountSigningKey(bytes) }
  }

  /**
   * The session for this account key (this device's by default), opening one
   * when there's none: that attests this device and creates the account when
   * the key has none. `retry` skips the wait after a failed attestation (the
   * User asked). Throws `AccountSessionError`.
   */
  async function ensure(
    accountKey?: Uint8Array,
    call: { retry?: boolean; signal?: AbortSignal } = {}
  ): Promise<AccountSessionInfo> {
    const { bytes, key } = await keyFor(accountKey)
    await load()
    if (live?.accountPub === key.publicKey && sessionValid(live))
      return info(live)
    return info(await acquire(bytes, key, call))
  }

  /**
   * Runs `run` with `Authorization: Bearer …`. A 401 for the token refreshes
   * once and runs it again; a 426 calls `onUpgradeRequired`. Both throw
   * `AccountSessionError`, as does failing to get a session; `run`'s own
   * failures are thrown as they are.
   */
  async function withSession<T>(
    run: (authorization: string, session: AccountSessionInfo) => Promise<T>,
    call: { accountKey?: Uint8Array; signal?: AbortSignal } = {}
  ): Promise<T> {
    const { bytes, key } = await keyFor(call.accountKey)
    let rejected: string | undefined
    for (let attempt = 0; ; attempt++) {
      const current = await acquire(bytes, key, {
        rejected,
        signal: call.signal,
      })
      const token = current.accessToken!
      try {
        return await run(`Bearer ${token}`, info(current))
      } catch (error) {
        if (
          error instanceof HttpError &&
          isUpgrade(error.status, error.serverCode)
        ) {
          upgradeRequired()
          throw toAccountSessionError(error)
        }
        if (attempt === 0 && isUnauthorized(error)) {
          rejected = token
          continue
        }
        throw error
      }
    }
  }

  /** `request()` with the session's bearer token; see `withSession`. */
  function authorizedRequest<T = unknown>(
    options: RequestOptions,
    call: { accountKey?: Uint8Array } = {}
  ): Promise<HttpResponse<T>> {
    return withSession(
      (authorization) =>
        request<T>({
          ...options,
          headers: { ...options.headers, authorization },
          fetchImpl: options.fetchImpl ?? deps.fetchImpl,
        }),
      { accountKey: call.accountKey, signal: options.signal }
    )
  }

  /**
   * Opens a session for a key that isn't this device's yet, without keeping it:
   * the new phone in a handoff checks the account before replacing its own key,
   * then adopts or closes it.
   */
  async function openDetached(
    accountKey: Uint8Array,
    call: { signal?: AbortSignal } = {}
  ): Promise<DetachedSession> {
    const key = deriveAccountSigningKey(accountKey)
    const opened = await open(accountKey, key, 'handoff', call.signal)
    let settled = false
    return {
      accountId: opened.accountId,
      status: opened.status,
      sessionId: opened.sessionId,
      adopt: async () => {
        if (settled) return
        settled = true
        await load()
        generation++
        flight = null
        lastFailure = null
        setLive(toLive(key.publicKey, opened))
        await storeQueue
      },
      close: async () => {
        if (settled) return
        settled = true
        await closeTokens({ ...opened, accessUsable: true })
      },
    }
  }

  /**
   * Ends this device's session (`session/close`) and forgets it: before the
   * account key is replaced or deleted. Never throws; offline, the server ends
   * it in time.
   */
  async function close(): Promise<void> {
    await load()
    const current = live
    generation++
    flight = null
    lastFailure = null
    live = null
    await persist(null)
    if (current)
      await closeTokens({ ...current, accessUsable: accessUsable(current) })
  }

  /** Forgets the session without telling the server. */
  function forget() {
    generation++
    flight = null
    lastFailure = null
    live = null
    void persist(null)
  }

  /** Reading the account (`GET /accounts/v1/account`) found a newer status. */
  function noteStatus(accountPub: string, status: AccountStatus) {
    if (live?.accountPub !== accountPub || live.status === status) return
    setLive({ ...live, status })
  }

  function snapshot(): AccountSessionSnapshot | null {
    if (!live) return null
    return {
      ...info(live),
      accountPub: live.accountPub,
      accessExpiresAt: live.accessToken ? live.accessExpiresAt : null,
      sessionExpiresAt: live.sessionExpiresAt,
    }
  }

  /** The last failed `session/open` still holding off retries, if any. */
  const lastOpenFailure = (): AccountSessionError | null =>
    lastFailure && lastFailure.until > localNow() ? lastFailure.error : null

  return {
    ensure,
    withSession,
    request: authorizedRequest,
    openDetached,
    close,
    forget,
    noteStatus,
    snapshot,
    lastOpenFailure,
    /** Resolves once stored state is read; for tests and the Tools. */
    ready: () => load().then(() => storeQueue),
  }
}

export type AccountSessions = ReturnType<typeof createAccountSessions>
