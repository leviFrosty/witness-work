import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
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
import { toB64u, utf8 } from '@/lib/bytes'
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
  isSessionAppVersion,
  type OpenedSession,
  refreshSession,
  sendSessionOpen,
  sessionAttestationHash,
} from '@/lib/serverAccount/sessionClient'

export type AttestationProblem = 'device' | 'temporary' | 'failed'

export type AccountSessionFailure =
  | 'offline'
  | 'cancelled'
  | 'unavailable'
  | 'upgrade'
  | 'attestation'
  | 'rateLimited'
  | 'keyRetired'
  | 'server'
  | 'signedOut'

const KIND: Record<AccountSessionFailure, HttpError['kind']> = {
  offline: 'offline',
  cancelled: 'cancelled',
  unavailable: 'server',
  upgrade: 'client',
  attestation: 'client',
  rateLimited: 'rateLimited',
  keyRetired: 'client',
  server: 'server',
  signedOut: 'client',
}

export class AccountSessionError extends HttpError {
  readonly failure: AccountSessionFailure

  readonly attestation: AttestationProblem | null

  readonly reason: string | null

  readonly ended: SessionEndReason | null

  readonly changedAt: number | null

  constructor(
    failure: AccountSessionFailure,
    details: {
      status?: number | null
      serverCode?: string | null
      retryAfterMs?: number | null
      attestation?: AttestationProblem
      reason?: string | null
      ended?: SessionEndReason
      changedAt?: number | null
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
    this.ended = details.ended ?? null
    this.changedAt = details.changedAt ?? null
  }
}

export type SessionEndReason =
  | 'revoked'
  | 'replaced'
  | 'expired'
  | 'reused'
  | 'key_changed'
  | 'renewed'
  | 'unknown'

const SESSION_END_REASONS: readonly SessionEndReason[] = [
  'revoked',
  'replaced',
  'expired',
  'reused',
  'key_changed',
  'renewed',
]

export const sessionEndWipes = (reason: SessionEndReason | null) =>
  reason === 'revoked' || reason === 'reused'

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

export type SessionFailure =
  | 'offline'
  | 'updateRequired'
  | 'unverified'
  | 'verifyLater'

export function sessionFailureFor(error: unknown): SessionFailure | null {
  if (error instanceof AccountSessionError) {
    if (error.failure === 'attestation')
      return error.attestation === 'temporary' ? 'verifyLater' : 'unverified'
    if (error.failure === 'upgrade') return 'updateRequired'
  }
  if (!(error instanceof HttpError)) return null
  if (isUpgrade(error.status, error.serverCode)) return 'updateRequired'
  if (error.serverCode === 'attestation_failed') {
    const reason = (error.body as { reason?: unknown } | null)?.reason
    return attestationProblemFor(
      null,
      typeof reason === 'string' ? reason : null
    ) === 'temporary'
      ? 'verifyLater'
      : 'unverified'
  }
  if (
    error.kind === 'offline' ||
    error.kind === 'timeout' ||
    error.kind === 'cancelled'
  )
    return 'offline'
  return null
}

const endedBy = (details: {
  status: number | null
  serverCode: string | null
  reason: string | null
}): SessionEndReason | undefined =>
  details.status === 401 &&
  (details.serverCode === 'unauthorized' || !details.serverCode)
    ? (SESSION_END_REASONS.find((known) => known === details.reason) ??
      'unknown')
    : undefined

function fromHttp(
  details: {
    status: number | null
    serverCode: string | null
    retryAfterMs: number | null
    reason: string | null
    changedAt?: number | null
  },
  refresh: boolean
): AccountSessionError {
  const { status, serverCode } = details
  if (isUpgrade(status, serverCode))
    return new AccountSessionError('upgrade', details)
  if (serverCode === 'disabled')
    return new AccountSessionError('unavailable', details)
  if (serverCode === 'key_retired')
    return new AccountSessionError('keyRetired', details)
  if (serverCode === 'attestation_failed')
    return new AccountSessionError('attestation', {
      ...details,
      attestation: attestationProblemFor(null, details.reason),
    })
  if (status === 429 || serverCode === 'rate_limited')
    return new AccountSessionError('rateLimited', details)
  return new AccountSessionError('server', {
    ...details,
    ...(refresh && { ended: endedBy(details) }),
  })
}

export function toAccountSessionError(
  error: unknown,
  { refresh = false }: { refresh?: boolean } = {}
): AccountSessionError {
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
    return fromHttp(
      {
        status: error.status ?? null,
        serverCode: error.serverCode ?? null,
        retryAfterMs: error.retryAfterMs ?? null,
        reason: error.reason ?? null,
      },
      refresh
    )
  }
  if (error instanceof HttpError) {
    if (error.kind === 'cancelled') return new AccountSessionError('cancelled')
    if (error.kind === 'offline' || error.kind === 'timeout')
      return new AccountSessionError('offline', { status: error.status })
    const body = error.body as { reason?: unknown; changedAt?: unknown } | null
    return fromHttp(
      {
        status: error.status,
        serverCode: error.serverCode,
        retryAfterMs: error.retryAfterMs,
        reason: typeof body?.reason === 'string' ? body.reason : null,
        changedAt: typeof body?.changedAt === 'number' ? body.changedAt : null,
      },
      refresh
    )
  }
  return new AccountSessionError('server')
}

export const refusedAsSuspended = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return false
  const { status, serverCode, code } = error as {
    status?: unknown
    serverCode?: unknown
    code?: unknown
  }
  return status === 403 && (serverCode === 'suspended' || code === 'suspended')
}

export const isUnauthorized = (error: unknown) =>
  error instanceof HttpError &&
  error.status === 401 &&
  (error.serverCode === 'unauthorized' || error.serverCode === null)

export type SessionStore = {
  read: () => Promise<string | null>

  write: (value: string | null) => Promise<void>

  stale?: {
    read: () => Promise<string | null>
    write: (hash: string | null) => Promise<void>
  }
}

export const staleTokenHash = (refreshToken: string) =>
  bytesToHex(sha256(utf8(`ww-account/v1/stale\n${refreshToken}`)))

export const tabTokenHash = (refreshToken: string) =>
  bytesToHex(sha256(utf8(`ww-account/v1/tab\n${refreshToken}`)))

export const refreshInFlightHash = (refreshToken: string) =>
  bytesToHex(sha256(utf8(`ww-account/v1/in-flight\n${refreshToken}`)))

export type SessionTabMessage =
  | {
      type: 'tokens'
      sessionId: string

      refreshHash: string
      accessToken: string

      accessExpiresAt: number
    }
  | { type: 'ended'; sessionId: string; reason: SessionEndReason }

export type WebSessionDeps = {
  exclusive: <T>(run: () => Promise<T>) => Promise<T>

  publish: (message: SessionTabMessage) => void

  decide?: (
    reason: SessionEndReason,
    ending: { accountPub: string; changedAt: number | null }
  ) => Promise<void>

  onEnded: (reason: SessionEndReason, from: { fromTab: boolean }) => void

  inFlight: {
    read: () => Promise<string | null>
    write: (hash: string | null) => Promise<void>
  }
}

export const TAB_TOKENS_WAIT_MS = 1_000

export type SessionOpenReason =
  | 'new'
  | 'expired'
  | 'ended'
  | 'unsaved'
  | 'handoff'
  | 'renewed'

export type AccountSessionEvent = {
  op: 'session/open' | 'session/refresh' | 'session/close'
  outcome: 'ok' | AccountSessionFailure
  reason?: SessionOpenReason
  attestation?: AttestationProblem

  serverReason?: string
  ms: number
}

export type AccountSessionDeps = {
  baseUrl: string

  now: () => number

  localNow?: () => number

  backgroundTime?: <T>(run: () => Promise<T>) => Promise<T>
  randomBytes: (length: number) => Uint8Array
  attestation: { assert<T>(request: AttestedRequest<T>): Promise<T> }
  store: SessionStore

  accountKey: () => Promise<Uint8Array>

  deviceLabel?: () => DeviceLabel

  appVersion?: () => string | null | undefined

  renewWindowMs?: () => number
  fetchImpl?: typeof fetch

  onUpgradeRequired?: () => void

  web?: WebSessionDeps

  paused?: () => boolean
  onEvent?: (event: AccountSessionEvent) => void

  onStoreFailure?: (op: 'save' | 'delete', error: unknown) => void

  onThisDeviceSession?: (sessionId: string) => void

  onStatusChange?: (accountPub: string, status: AccountStatus) => void

  onKeyRetired?: (accountPub: string, changedAt: number | null) => void

  onKeySwitched?: (fromPub: string, toPub: string) => void

  onSucceededWhileSuspended?: (accountKey: Uint8Array) => void
}

export type AccountSessionInfo = {
  accountId: string
  status: AccountStatus
  sessionId: string
}

export type AccountSessionSnapshot = AccountSessionInfo & {
  accountPub: string

  accessExpiresAt: number | null

  sessionExpiresAt: number
}

let lastPublicKey: { accountKey: string; publicKey: string } | null = null
const publicKeyOf = (accountKey: Uint8Array): string => {
  const encoded = toB64u(accountKey)
  if (lastPublicKey?.accountKey !== encoded)
    lastPublicKey = {
      accountKey: encoded,
      publicKey: deriveAccountSigningKey(accountKey).publicKey,
    }
  return lastPublicKey.publicKey
}

export const sessionAccountForKey = (
  session: Pick<AccountSessionSnapshot, 'accountId' | 'accountPub'> | null,
  accountKey: Uint8Array | null
): string | null =>
  session && accountKey && publicKeyOf(accountKey) === session.accountPub
    ? session.accountId
    : null

export type DetachedSession = AccountSessionInfo & {
  adopt: () => Promise<void>

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

  ended?: true
}

type Live = Stored & {
  accessToken: string | null

  accessExpiresAt: number
}

export const ACCESS_REFRESH_MARGIN_MS = 60_000

export const ACCESS_LIFETIME_MS = 15 * 60_000

export const SESSION_RENEW_MARGIN_MS = 10 * 60_000

export const SESSION_RENEW_WINDOW_MS = 30 * 24 * 60 * 60_000

export const OPEN_RETRY_AFTER_MS: Record<AttestationProblem, number> = {
  device: 30 * 60_000,
  failed: 2 * 60_000,
  temporary: 60_000,
}

export const OPEN_RATE_LIMIT_DEFAULT_MS = 60_000
export const OPEN_RATE_LIMIT_MAX_MS = 24 * 60 * 60_000

export const STORE_ATTEMPTS = 2

export const KEY_CHANGE_CLOSE_WAIT_MS = 5_000

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
      typeof value.sessionExpiresAt === 'number' &&
      (value.ended === undefined || value.ended === true)
    )
      return value as Stored
  } catch {}
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
  ...(live.ended && { ended: true }),
})

const info = (live: Live): AccountSessionInfo => ({
  accountId: live.accountId,
  status: live.status,
  sessionId: live.sessionId,
})

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

export type RekeyedTokens = { accessToken: string; accessExpiresAt: number }

type OpenCall = {
  signal?: AbortSignal
  current?: () => boolean

  accountId?: string

  renews?: { sessionId: string; accessToken: string }
}

export function createAccountSessions(deps: AccountSessionDeps) {
  const localNow = deps.localNow ?? Date.now
  let live: Live | null = null
  let loading: Promise<void> | null = null

  let generation = 0
  let flight: { pub: string; promise: Promise<Live> } | null = null
  let storeQueue: Promise<void> = Promise.resolve()

  let storedToken: string | null = null

  let staleMarked = false

  let discardedStale = false

  let keyChange: Promise<void> | null = null

  let keyChanges = 0

  const retired = new Set<string>()

  const retiredByServer = new Map<string, AccountSessionError>()

  const openLimitedUntil = new Map<string, number>()

  const renewTried = new Set<string>()
  let lastFailure: {
    pub: string
    error: AccountSessionError
    until: number
  } | null = null

  const appVersion = () => {
    const version = deps.appVersion?.()
    return isSessionAppVersion(version) ? version : undefined
  }

  const clientOptions = (signal?: AbortSignal) => ({
    baseUrl: deps.baseUrl,
    fetchImpl: deps.fetchImpl,
    signal,
    appVersion: appVersion(),
  })

  const emit = (event: AccountSessionEvent) => deps.onEvent?.(event)

  const upgradeRequired = () => deps.onUpgradeRequired?.()

  const refuseWhilePaused = () => {
    if (deps.paused?.())
      throw new AccountSessionError('upgrade', {
        status: 426,
        serverCode: 'upgrade_required',
      })
  }

  async function markStale(refreshToken: string | null) {
    if (!deps.store.stale || (refreshToken === null && !staleMarked)) return
    try {
      await deps.store.stale.write(
        refreshToken === null ? null : staleTokenHash(refreshToken)
      )
      staleMarked = refreshToken !== null
    } catch {}
  }

  function persist(
    value: Stored | null,
    current: () => boolean = () => true
  ): Promise<'saved' | 'skipped'> {
    const json = value ? JSON.stringify(value) : null
    const token = value?.refreshToken ?? null
    const write = storeQueue.then(async (): Promise<'saved' | 'skipped'> => {
      if (!current()) return 'skipped'
      for (let attempt = 1; ; attempt++) {
        try {
          await deps.store.write(json)
          storedToken = token
          if (staleMarked) await markStale(null)
          return 'saved'
        } catch (error) {
          if (attempt < STORE_ATTEMPTS) continue

          if (storedToken !== token) await markStale(storedToken)
          deps.onStoreFailure?.(value ? 'save' : 'delete', error)
          throw error
        }
      }
    })
    storeQueue = write.then(
      () => undefined,
      () => undefined
    )
    return write
  }

  const save = (
    value: Stored | null,
    current?: () => boolean
  ): Promise<'saved' | 'skipped' | 'failed'> =>
    persist(value, current).catch(() => 'failed' as const)

  function load(): Promise<void> {
    loading ??= storeQueue.then(async () => {
      const saved = parseStored(await deps.store.read().catch(() => null))
      storedToken = saved?.refreshToken ?? null
      const stale = deps.store.stale
        ? await deps.store.stale.read().catch(() => null)
        : null
      staleMarked = stale !== null

      if (!saved || live) return
      if (stale === staleTokenHash(saved.refreshToken)) {
        discardedStale = true
        void save(null, () => live === null)
        return
      }
      live = { ...saved, accessToken: null, accessExpiresAt: 0 }
      deps.onThisDeviceSession?.(saved.sessionId)
    })
    return loading
  }

  const sessionValid = (session: Live) =>
    !session.ended &&
    session.sessionExpiresAt - deps.now() > SESSION_RENEW_MARGIN_MS

  const accessUsable = (session: Live, rejected?: string) =>
    session.accessToken !== null &&
    session.accessToken !== rejected &&
    session.accessExpiresAt - localNow() > ACCESS_REFRESH_MARGIN_MS &&
    sessionValid(session)

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
      const failure = toAccountSessionError(error, {
        refresh: op === 'session/refresh',
      })
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
      return undefined
    }
  }

  function openRateLimit(pub: string): AccountSessionError | null {
    const until = openLimitedUntil.get(pub)
    if (until === undefined) return null
    const retryAfterMs = until - localNow()
    if (retryAfterMs > 0)
      return new AccountSessionError('rateLimited', {
        status: 429,
        serverCode: 'rate_limited',
        retryAfterMs,
      })
    openLimitedUntil.delete(pub)
    return null
  }

  async function open(
    accountKey: Uint8Array,
    key: AccountSigningKey,
    reason: SessionOpenReason,
    call: OpenCall = {}
  ): Promise<OpenedSession> {
    const pub = key.publicKey
    const limited = openRateLimit(pub)
    if (limited) throw limited
    const refused = retiredByServer.get(pub)
    if (refused) throw refused
    const seen: { changedAt: number | null } = { changedAt: null }
    try {
      return await attestAndOpen(accountKey, key, reason, call, seen)
    } catch (error) {
      let failure = toAccountSessionError(error)
      if (failure.failure === 'keyRetired') {
        failure = new AccountSessionError('keyRetired', {
          status: failure.status,
          serverCode: 'key_retired',
          changedAt: failure.changedAt ?? seen.changedAt,
        })
        retiredByServer.set(pub, failure)
        deps.onKeyRetired?.(pub, failure.changedAt)
      }
      if (failure.failure === 'rateLimited') {
        const wait = Math.min(
          Math.max(failure.retryAfterMs ?? OPEN_RATE_LIMIT_DEFAULT_MS, 1_000),
          OPEN_RATE_LIMIT_MAX_MS
        )
        openLimitedUntil.set(pub, localNow() + wait)
      }
      throw failure
    }
  }

  function attestAndOpen(
    accountKey: Uint8Array,
    key: AccountSigningKey,
    reason: SessionOpenReason,
    call: OpenCall,
    seen: { changedAt: number | null }
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
            if (call.current && !call.current())
              throw new AttestationHttpError({ kind: 'cancelled' })
            try {
              return await sendSessionOpen(
                {
                  proof,
                  device,
                  appVersion: appVersion(),
                  accountId: call.accountId,
                  renews: call.renews,
                },
                {
                  ...clientOptions(attemptSignal),
                  key,
                  now: deps.now,
                  randomBytes: deps.randomBytes,
                }
              )
            } catch (error) {
              if (
                error instanceof HttpError &&
                error.serverCode === 'key_retired'
              ) {
                const changedAt = (error.body as { changedAt?: unknown } | null)
                  ?.changedAt
                seen.changedAt =
                  typeof changedAt === 'number' ? changedAt : null
              }
              throw toAttestationHttpError(error)
            }
          },
          signal: call.signal,
        }),
      { reason }
    )
  }

  async function refresh(
    current: Live,
    unchanged: () => boolean
  ): Promise<{
    next: Live
    accessExpiresAt: number
    saved: 'saved' | 'failed'
  }> {
    const tokens = await timed('session/refresh', () =>
      refreshSession(current.refreshToken, clientOptions())
    )
    if (!unchanged()) throw new AccountSessionError('cancelled')
    const next: Live = {
      ...current,
      refreshToken: tokens.refreshToken,
      sessionExpiresAt: tokens.sessionExpiresAt,
      accessToken: tokens.accessToken,
      accessExpiresAt: accessExpiry(tokens.accessExpiresAt),
    }
    const saved = await save(stored(next), unchanged)
    if (saved === 'skipped' || !unchanged())
      throw new AccountSessionError('cancelled')

    unsavedToken =
      saved === 'failed'
        ? { replaced: current.refreshToken, held: tokens.refreshToken }
        : null
    return { next, accessExpiresAt: tokens.accessExpiresAt, saved }
  }

  async function refreshMarked(
    web: WebSessionDeps,
    current: Live,
    unchanged: () => boolean
  ) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      throw new AccountSessionError('offline')
    const hash = refreshInFlightHash(current.refreshToken)
    const sentBefore = (await web.inFlight.read().catch(() => null)) === hash
    try {
      await web.inFlight.write(hash)
    } catch {
      throw new AccountSessionError('cancelled')
    }
    if (!unchanged()) throw new AccountSessionError('cancelled')
    try {
      const result = await refresh(current, unchanged)
      if (result.saved === 'saved')
        await web.inFlight.write(null).catch(() => undefined)
      return result
    } catch (error) {
      if (!unchanged()) throw new AccountSessionError('cancelled')
      if (
        !(
          error instanceof AccountSessionError &&
          error.failure === 'server' &&
          error.status === 401
        )
      )
        throw error
      await web.inFlight.write(null).catch(() => undefined)
      if (!sentBefore || error.ended !== 'reused') throw error

      throw new AccountSessionError('server', {
        status: 401,
        serverCode: error.serverCode,
        ended: 'expired',
      })
    }
  }

  let unsavedToken: { replaced: string; held: string } | null = null

  let tabTokens: Extract<SessionTabMessage, { type: 'tokens' }> | null = null
  const tabWaiters = new Set<() => void>()

  function tabTokensFor(saved: Stored) {
    const hash = tabTokenHash(saved.refreshToken)
    const match = () =>
      tabTokens?.sessionId === saved.sessionId && tabTokens.refreshHash === hash
        ? tabTokens
        : null
    const found = match()
    if (found) return Promise.resolve(found)
    return new Promise<typeof tabTokens>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        tabWaiters.delete(check)
        resolve(match())
      }
      const check = () => {
        if (match()) done()
      }
      const timer = setTimeout(done, TAB_TOKENS_WAIT_MS)
      tabWaiters.add(check)
    })
  }

  async function refreshInTabs(
    web: WebSessionDeps,
    current: Live,
    rejected: string | undefined,
    unchanged: () => boolean
  ): Promise<Live> {
    const raw = await deps.store.read().catch(() => undefined)

    if (raw === undefined || !unchanged())
      throw new AccountSessionError('cancelled')
    const saved = parseStored(raw)

    if (
      saved?.accountPub !== current.accountPub ||
      saved.sessionId !== current.sessionId
    )
      throw new AccountSessionError('signedOut')
    storedToken = saved.refreshToken
    const base: Live = {
      ...current,
      ...saved,
      ...(unsavedToken?.replaced === saved.refreshToken && {
        refreshToken: unsavedToken.held,
      }),
    }
    if (
      saved.refreshToken !== current.refreshToken &&
      unsavedToken?.replaced !== saved.refreshToken
    ) {
      const shared = await tabTokensFor(saved)
      if (!unchanged()) throw new AccountSessionError('cancelled')
      if (shared) {
        const candidate: Live = {
          ...base,
          accessToken: shared.accessToken,
          accessExpiresAt: accessExpiry(shared.accessExpiresAt),
        }
        if (accessUsable(candidate, rejected)) return candidate
      }
    }
    const { next, accessExpiresAt } = await refreshMarked(web, base, unchanged)
    web.publish({
      type: 'tokens',
      sessionId: next.sessionId,
      refreshHash: tabTokenHash(next.refreshToken),
      accessToken: next.accessToken!,
      accessExpiresAt,
    })
    return next
  }

  async function endWebSession(
    current: Live,
    reason: SessionEndReason,
    changedAt: number | null = null
  ): Promise<AccountSessionError> {
    generation++
    lastFailure = null
    live = null

    await deps.web
      ?.decide?.(reason, { accountPub: current.accountPub, changedAt })
      .catch(() => undefined)
    deps.web?.onEnded(reason, { fromTab: false })
    void save(null)
    deps.web?.publish({
      type: 'ended',
      sessionId: current.sessionId,
      reason,
    })
    return new AccountSessionError('signedOut', {
      status: 401,
      serverCode: 'unauthorized',
      ended: reason,
    })
  }

  function receive(message: SessionTabMessage) {
    if (!deps.web) return
    if (message.type === 'tokens') {
      tabTokens = message
      for (const check of [...tabWaiters]) check()

      if (live?.sessionId === message.sessionId)
        live = {
          ...live,
          accessToken: message.accessToken,
          accessExpiresAt: accessExpiry(message.accessExpiresAt),
        }
      return
    }
    if (live?.sessionId !== message.sessionId) return
    generation++
    flight = null
    lastFailure = null
    live = null
    deps.web.onEnded(message.reason, { fromTab: true })
  }

  async function closeTokens(session: {
    accessToken: string | null
    refreshToken: string
    accessUsable: boolean
    ended?: true
  }) {
    if (session.ended) return
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
    } catch {}
  }

  const settleWithin = (promise: Promise<unknown>, ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms)
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      promise.then(done, done)
    })

  async function keySettled() {
    while (keyChange) await keyChange
  }

  const dueForRenewal = (session: Live) =>
    !deps.web &&
    !renewTried.has(session.sessionId) &&
    session.sessionExpiresAt - deps.now() <=
      (deps.renewWindowMs?.() ?? SESSION_RENEW_WINDOW_MS)

  function renewAfter(
    accountKey: Uint8Array,
    key: AccountSigningKey,
    from: Live
  ) {
    renewTried.add(from.sessionId)
    const pub = key.publicKey
    const startedAt = generation
    const unchanged = () => startedAt === generation
    const run = async (): Promise<Live> => {
      const current = live
      if (!unchanged() || current?.sessionId !== from.sessionId)
        throw new AccountSessionError('cancelled')
      if (!accessUsable(current)) {
        renewTried.delete(current.sessionId)
        return current
      }
      let opened: OpenedSession
      try {
        opened = await open(accountKey, key, 'renewed', {
          current: unchanged,
          accountId: current.accountId,
          renews: {
            sessionId: current.sessionId,
            accessToken: current.accessToken!,
          },
        })
      } catch {
        if (!unchanged()) throw new AccountSessionError('cancelled')
        return live ?? current
      }
      const next = toLive(pub, opened)
      const saved = unchanged() ? await save(stored(next), unchanged) : null
      if (saved !== 'saved' || !unchanged()) {
        void closeTokens({ ...opened, accessUsable: true })
        if (saved !== 'failed' || !unchanged())
          throw new AccountSessionError('cancelled')

        live = { ...current, accessToken: null, accessExpiresAt: 0 }
        return live
      }
      live = next
      deps.onThisDeviceSession?.(next.sessionId)
      return next
    }
    const promise = (flight?.promise ?? Promise.resolve())
      .catch(() => undefined)
      .then(run)
    flight = { pub, promise }
    void promise
      .catch(() => undefined)
      .finally(() => {
        if (flight?.promise === promise) flight = null
      })
  }

  async function acquire(
    accountKey: Uint8Array,
    key: AccountSigningKey,
    call: {
      rejected?: string
      retry?: boolean
      signal?: AbortSignal
      accountId?: string
    }
  ): Promise<Live> {
    const pub = key.publicKey
    refuseWhilePaused()

    do {
      await keySettled()
      if (retired.has(pub)) throw new AccountSessionError('cancelled')
      await load()
    } while (keyChange)
    if (live?.accountPub === pub && accessUsable(live, call.rejected))
      return live
    if (flight?.pub === pub) return raceSignal(flight.promise, call.signal)

    const startedAt = generation
    const unchanged = () => startedAt === generation
    const run = async (): Promise<Live> => {
      if (!unchanged()) throw new AccountSessionError('cancelled')
      const current = live
      if (current?.accountPub === pub && accessUsable(current, call.rejected))
        return current
      let reason: SessionOpenReason = discardedStale ? 'unsaved' : 'new'

      const knownAccount = call.accountId ?? current?.accountId

      if (deps.web && current && current.accountPub !== pub)
        throw new AccountSessionError('cancelled')
      if (current && current.accountPub !== pub) {
        deps.onKeySwitched?.(current.accountPub, pub)
        live = null
        void save(null)
        void closeTokens({ ...current, accessUsable: accessUsable(current) })
      } else if (current?.ended) {
        reason = 'ended'
      } else if (current && !sessionValid(current)) {
        reason = 'expired'
      } else if (current) {
        try {
          const web = deps.web
          const next = web
            ? await web.exclusive(() =>
                refreshInTabs(web, current, call.rejected, unchanged)
              )
            : (await refresh(current, unchanged)).next
          if (!unchanged()) throw new AccountSessionError('cancelled')
          live = next
          if (dueForRenewal(next)) renewAfter(accountKey, key, next)
          return next
        } catch (error) {
          if (!unchanged()) throw new AccountSessionError('cancelled')

          if (
            !(
              error instanceof AccountSessionError &&
              error.failure === 'server' &&
              error.status === 401
            )
          )
            throw error
          if (deps.web)
            throw await endWebSession(
              current,
              error.ended ?? 'unknown',
              error.changedAt
            )
          reason = 'ended'
          if (!unchanged()) throw new AccountSessionError('cancelled')

          const ended: Live = { ...current, ended: true, accessToken: null }
          live = ended
          void save(stored(ended), () => live === ended)
        }
      }

      if (deps.web) {
        if (current && reason === 'expired')
          throw await endWebSession(current, 'expired')
        throw new AccountSessionError('signedOut')
      }
      if (
        !call.retry &&
        lastFailure?.pub === pub &&
        lastFailure.until > localNow()
      )
        throw lastFailure.error
      if (!unchanged()) throw new AccountSessionError('cancelled')
      let opened: OpenedSession
      try {
        try {
          opened = await open(accountKey, key, reason, {
            current: unchanged,
            accountId: knownAccount,
          })
        } catch (error) {
          if (
            call.accountId !== undefined ||
            knownAccount === undefined ||
            !(error instanceof HttpError) ||
            error.serverCode !== 'unknown_account'
          )
            throw error
          opened = await open(accountKey, key, reason, { current: unchanged })
        }
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
      const next = toLive(pub, opened)
      const saved = unchanged() ? await save(stored(next), unchanged) : null
      if (saved === null || saved === 'skipped' || !unchanged()) {
        void closeTokens({ ...opened, accessUsable: true })
        throw new AccountSessionError('cancelled')
      }
      lastFailure = null
      discardedStale = false
      live = next
      deps.onThisDeviceSession?.(next.sessionId)
      return next
    }
    const previous = flight?.promise
    const promise = (previous ?? Promise.resolve())
      .catch(() => undefined)

      .then(() => (deps.backgroundTime ? deps.backgroundTime(run) : run()))
    flight = { pub, promise }
    void promise
      .catch(() => undefined)
      .finally(() => {
        if (flight?.promise === promise) flight = null
      })
    return raceSignal(promise, call.signal)
  }

  let derived: { accountKey: string; key: AccountSigningKey } | null = null

  async function settledKey(accountKey?: Uint8Array): Promise<Uint8Array> {
    await keySettled()
    const changes = keyChanges
    const bytes = accountKey ?? (await deps.accountKey())

    return changes === keyChanges && !keyChange ? bytes : settledKey(accountKey)
  }
  const keyFor = async (accountKey?: Uint8Array) => {
    const bytes = await settledKey(accountKey)
    const encoded = toB64u(bytes)
    if (derived?.accountKey !== encoded)
      derived = { accountKey: encoded, key: deriveAccountSigningKey(bytes) }
    return { bytes, key: derived.key }
  }

  async function ensure(
    accountKey?: Uint8Array,
    call: { retry?: boolean; signal?: AbortSignal; accountId?: string } = {}
  ): Promise<AccountSessionInfo> {
    const { bytes, key } = await keyFor(accountKey)
    await load()
    if (live?.accountPub === key.publicKey && sessionValid(live))
      return info(live)
    return info(await acquire(bytes, key, call))
  }

  async function withSession<T>(
    run: (authorization: string, session: AccountSessionInfo) => Promise<T>,
    call: {
      accountKey?: Uint8Array
      signal?: AbortSignal
      renew?: boolean

      retryUnauthorized?: boolean
    } = {}
  ): Promise<T> {
    const { bytes, key } = await keyFor(call.accountKey)
    if (call.renew) await load()
    let rejected: string | undefined =
      call.renew && live?.accountPub === key.publicKey
        ? (live.accessToken ?? undefined)
        : undefined
    for (let attempt = 0; ; attempt++) {
      const current = await acquire(bytes, key, {
        rejected,
        signal: call.signal,
      })
      const token = current.accessToken!
      try {
        const result = await run(`Bearer ${token}`, info(current))
        if (live?.accountPub === key.publicKey && live.status === 'suspended')
          deps.onSucceededWhileSuspended?.(bytes)
        return result
      } catch (error) {
        if (
          error instanceof HttpError &&
          isUpgrade(error.status, error.serverCode)
        ) {
          upgradeRequired()
          throw toAccountSessionError(error)
        }
        if (refusedAsSuspended(error)) noteStatus(key.publicKey, 'suspended')
        if (
          attempt === 0 &&
          call.retryUnauthorized !== false &&
          isUnauthorized(error)
        ) {
          rejected = token
          continue
        }
        throw error
      }
    }
  }

  function authorizedRequest<T = unknown>(
    options: RequestOptions,
    call: { accountKey?: Uint8Array; renew?: boolean; accountId?: string } = {}
  ): Promise<HttpResponse<T>> {
    return withSession(
      (authorization, session) => {
        if (
          call.accountId !== undefined &&
          session.accountId !== call.accountId
        )
          throw new AccountSessionError('cancelled')
        return request<T>({
          ...options,
          headers: { ...options.headers, authorization },
          fetchImpl: options.fetchImpl ?? deps.fetchImpl,
        })
      },
      { accountKey: call.accountKey, signal: options.signal, renew: call.renew }
    )
  }

  async function adopt(
    accountKey: Uint8Array,
    opened: OpenedSession,
    { replace }: { replace?: { waitMs?: number } } = {}
  ): Promise<'saved' | 'skipped' | 'failed'> {
    const pub = deriveAccountSigningKey(accountKey).publicKey
    await load()
    let previous = replace ? live : null

    if (deps.web && previous) {
      const saved = parseStored(await deps.store.read().catch(() => null))
      if (saved?.sessionId === previous.sessionId)
        previous = { ...previous, refreshToken: saved.refreshToken }
    }
    const adoptedAt = ++generation
    flight = null
    lastFailure = null

    if (deps.web) retired.delete(pub)
    live = toLive(pub, opened)
    deps.onThisDeviceSession?.(opened.sessionId)
    const saved = await save(stored(live), () => generation === adoptedAt)
    if (!previous || previous.sessionId === opened.sessionId) return saved
    if (saved === 'failed') {
      if (generation === adoptedAt) {
        generation++
        live = previous
        deps.onThisDeviceSession?.(previous.sessionId)
      }
      return saved
    }
    const closing = closeTokens({
      ...previous,
      accessUsable: accessUsable(previous),
    })
    await (replace?.waitMs === undefined
      ? closing
      : settleWithin(closing, replace.waitMs))
    return saved
  }

  async function openDetached(
    accountKey: Uint8Array,
    call: { signal?: AbortSignal; accountId?: string } = {}
  ): Promise<DetachedSession> {
    refuseWhilePaused()
    const key = deriveAccountSigningKey(accountKey)
    const opened = await open(accountKey, key, 'handoff', {
      signal: call.signal,
      accountId: call.accountId,
    })
    let settled = false
    return {
      accountId: opened.accountId,
      status: opened.status,
      sessionId: opened.sessionId,
      adopt: async () => {
        if (settled) return
        settled = true

        await adopt(accountKey, opened)
      },
      close: async () => {
        if (settled) return
        settled = true
        await closeTokens({ ...opened, accessUsable: true })
      },
    }
  }

  async function close({ waitMs }: { waitMs?: number } = {}): Promise<void> {
    await load()
    let current = live

    if (deps.web && current) {
      const saved = parseStored(await deps.store.read().catch(() => null))
      if (saved?.sessionId === current.sessionId)
        current = { ...current, refreshToken: saved.refreshToken }
    }
    generation++
    flight = null
    lastFailure = null
    live = null
    await save(null)
    if (!current) return
    const closing = closeTokens({
      ...current,
      accessUsable: accessUsable(current),
    })
    await (waitMs === undefined ? closing : settleWithin(closing, waitMs))
  }

  function forget() {
    generation++
    flight = null
    lastFailure = null
    live = null
    void save(null)
  }

  async function changeKey<T>(
    swap: () => Promise<T>,
    keys: { from?: Uint8Array | null; to?: Uint8Array | null } = {}
  ): Promise<T> {
    await keySettled()
    let done!: () => void
    keyChange = new Promise<void>((resolve) => {
      done = resolve
    })
    keyChanges++
    try {
      await load()
      const current = live
      generation++
      flight = null
      lastFailure = null
      live = null
      const closing = current
        ? closeTokens({ ...current, accessUsable: accessUsable(current) })
        : Promise.resolve()
      await save(null)
      await settleWithin(closing, KEY_CHANGE_CLOSE_WAIT_MS)
      const result = await swap()
      const toPub = keys.to ? deriveAccountSigningKey(keys.to).publicKey : null
      if (current) retired.add(current.accountPub)
      if (keys.from) retired.add(deriveAccountSigningKey(keys.from).publicKey)
      if (toPub) retired.delete(toPub)
      return result
    } finally {
      keyChange = null
      done()
    }
  }

  async function repoint(
    fromPub: string,
    toPub: string,
    tokens?: RekeyedTokens
  ): Promise<boolean> {
    await keySettled()
    let done!: () => void
    keyChange = new Promise<void>((resolve) => {
      done = resolve
    })
    keyChanges++
    try {
      await load()
      while (flight) await flight.promise.catch(() => undefined)
      retired.add(fromPub)
      retired.delete(toPub)
      if (live?.accountPub !== fromPub) return live?.accountPub === toPub
      const next: Live = {
        ...live,
        accountPub: toPub,
        ...(tokens
          ? {
              accessToken: tokens.accessToken,
              accessExpiresAt: accessExpiry(tokens.accessExpiresAt),
            }
          : { accessToken: null, accessExpiresAt: 0 }),
      }
      live = next
      lastFailure = null

      await save(stored(next), () => live === next)
      return true
    } finally {
      keyChange = null
      done()
    }
  }

  function noteStatus(accountPub: string, status: AccountStatus) {
    if (live?.accountPub !== accountPub || live.status === status) return
    const next = { ...live, status }
    live = next
    if (deps.web) {
      const web = deps.web
      void web
        .exclusive(async () => {
          const saved = parseStored(await deps.store.read().catch(() => null))
          if (
            saved?.sessionId === next.sessionId &&
            live?.sessionId === next.sessionId
          )
            await save({ ...saved, status: live.status })
        })
        .catch(() => undefined)
    } else {
      void save(stored(next), () => live === next)
    }
    deps.onStatusChange?.(accountPub, status)
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

  const lastOpenFailure = (): AccountSessionError | null =>
    lastFailure && lastFailure.until > localNow() ? lastFailure.error : null

  return {
    ensure,
    withSession,
    request: authorizedRequest,
    openDetached,
    adopt,
    receive,
    close,
    forget,
    changeKey,
    repoint,
    noteStatus,
    snapshot,
    lastOpenFailure,

    ready: () => load().then(() => storeQueue),
  }
}

export type AccountSessions = ReturnType<typeof createAccountSessions>
