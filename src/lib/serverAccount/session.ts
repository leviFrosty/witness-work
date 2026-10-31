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
 * `upgrade_required` calls `onUpgradeRequired`, and while Update Required shows
 * (`paused`) nothing goes out: every call fails as that 426 would.
 *
 * Every refresh replaces the refresh token, and presenting a replaced one after
 * the server's grace minute ends the session as a reused token. So a new token
 * is written to the keystore before anything uses it. When that write fails
 * (twice), this launch keeps the session in memory, and the stale token the
 * keystore still holds is marked by its hash in a second store (`stale`): the
 * next launch discards it and opens a new session (reason `unsaved`) instead of
 * presenting it. A later write that works makes the mark moot. A failed delete
 * (closing, forgetting) is marked the same way, and the next launch deletes the
 * token again.
 *
 * A browser (`web`) can't attest, so it never opens a session by itself: one
 * opens from a sign-in's ticket and is `adopt`ed, and when the server ends it
 * the User signs in again (docs/passkeys-protocol.md, "On the web"). Its tabs
 * share the session: one refreshes at a time, reading the stored refresh token
 * again first, and tells the others the new access token.
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
  /**
   * A browser has no session, or the server ended it (`ended` says why): it
   * can't open one by itself, so the User signs in again.
   */
  | 'signedOut'

const KIND: Record<AccountSessionFailure, HttpError['kind']> = {
  offline: 'offline',
  cancelled: 'cancelled',
  unavailable: 'server',
  upgrade: 'client',
  attestation: 'client',
  rateLimited: 'rateLimited',
  server: 'server',
  signedOut: 'client',
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
  /** Set for a refused refresh (401): why the session ended. */
  readonly ended: SessionEndReason | null

  constructor(
    failure: AccountSessionFailure,
    details: {
      status?: number | null
      serverCode?: string | null
      retryAfterMs?: number | null
      attestation?: AttestationProblem
      reason?: string | null
      ended?: SessionEndReason
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
  }
}

/**
 * Why the server refused a refresh (docs/passkeys-protocol.md, "Session
 * fields"): `revoked` (another device signed it out), `replaced` (a session
 * cap), `expired`, `reused` (a replaced refresh token came back), or
 * `unknown`.
 */
export type SessionEndReason =
  | 'revoked'
  | 'replaced'
  | 'expired'
  | 'reused'
  | 'unknown'

const SESSION_END_REASONS: readonly SessionEndReason[] = [
  'revoked',
  'replaced',
  'expired',
  'reused',
]

/**
 * Whether an ended session means someone else ended it on purpose: a browser
 * wipes itself then, and keeps its data for `expired` and `replaced`.
 */
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

/** What any account request's failure can share, whatever the feature. */
export type SessionFailure =
  /** No connection, or the request timed out or was cancelled. */
  | 'offline'
  /** Ww-api needs a newer app version (426). */
  | 'updateRequired'
  /** This phone couldn't prove it's WitnessWork, so it has no session. */
  | 'unverified'
  /** The same, but only for now: Apple's or Google's check was unavailable. */
  | 'verifyLater'

/**
 * Sorts the failures every account feature explains the same way: offline, a
 * 426, and attestation (the session's own, or the server's
 * `attestation_failed`). `null` for anything else.
 */
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

/** A refused refresh: the session is over, and `reason` says why. */
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
  },
  refresh: boolean
): AccountSessionError {
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
  return new AccountSessionError('server', {
    ...details,
    ...(refresh && { ended: endedBy(details) }),
  })
}

/**
 * Any failure of opening, refreshing or using a session, normalized. Only a
 * refused `sessions/refresh` (`refresh`) says the session `ended`.
 */
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
    const reason = (error.body as { reason?: unknown } | null)?.reason
    return fromHttp(
      {
        status: error.status,
        serverCode: error.serverCode,
        retryAfterMs: error.retryAfterMs,
        reason: typeof reason === 'string' ? reason : null,
      },
      refresh
    )
  }
  return new AccountSessionError('server')
}

/**
 * A call refused because the account is suspended: an `HttpError` from a
 * session-authenticated route (`serverCode`), or a Buddies `RelayError`
 * (`code`).
 */
export const refusedAsSuspended = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return false
  const { status, serverCode, code } = error as {
    status?: unknown
    serverCode?: unknown
    code?: unknown
  }
  return status === 403 && (serverCode === 'suspended' || code === 'suspended')
}

/** A bearer request the server refused for its token: refresh and retry. */
export const isUnauthorized = (error: unknown) =>
  error instanceof HttpError &&
  error.status === 401 &&
  (error.serverCode === 'unauthorized' || error.serverCode === null)

/** Where the refresh token is kept: the platform keystore in the app. */
export type SessionStore = {
  read: () => Promise<string | null>
  /** Null deletes it. */
  write: (value: string | null) => Promise<void>
  /**
   * Kept apart from the keystore (device-local MMKV in the app), for when
   * writing to it fails: the hash (`staleTokenHash`) of a refresh token the
   * keystore may still hold but this device must never present again.
   */
  stale?: {
    read: () => Promise<string | null>
    write: (hash: string | null) => Promise<void>
  }
}

/** How a stale refresh token is marked: hex SHA-256, never the token. */
export const staleTokenHash = (refreshToken: string) =>
  bytesToHex(sha256(utf8(`ww-account/v1/stale\n${refreshToken}`)))

/**
 * How tabs name the refresh token their access token goes with: hex SHA-256,
 * never the token.
 */
export const tabTokenHash = (refreshToken: string) =>
  bytesToHex(sha256(utf8(`ww-account/v1/tab\n${refreshToken}`)))

/**
 * How a browser marks the refresh token it's presenting
 * (`WebSessionDeps.inFlight`): hex SHA-256, never the token.
 */
export const refreshInFlightHash = (refreshToken: string) =>
  bytesToHex(sha256(utf8(`ww-account/v1/in-flight\n${refreshToken}`)))

/** What one browser tab tells the others about the session they share. */
export type SessionTabMessage =
  /** It refreshed: the access token for the refresh token now stored. */
  | {
      type: 'tokens'
      sessionId: string
      /** `tabTokenHash` of the refresh token it stored. */
      refreshHash: string
      accessToken: string
      /** Epoch ms, the server's clock. */
      accessExpiresAt: number
    }
  /** The server refused its refresh: the session is over. */
  | { type: 'ended'; sessionId: string; reason: SessionEndReason }

/**
 * A browser's session (docs/passkeys-protocol.md, "On the web" and "Tabs"):
 * opened only from a ticket, shared by the page's tabs.
 */
export type WebSessionDeps = {
  /**
   * Runs `run` while no other tab refreshes:
   * `navigator.locks.request("ww-session")`.
   */
  exclusive: <T>(run: () => Promise<T>) => Promise<T>
  /** Tells the other tabs (a `BroadcastChannel`); they pass it to `receive`. */
  publish: (message: SessionTabMessage) => void
  /**
   * The session is over: the server refused a refresh (in this tab, or
   * `fromTab` another), or it reached its expiry. `sessionEndWipes` says
   * whether the browser wipes or shows the sign-in screen.
   */
  onEnded: (reason: SessionEndReason, from: { fromTab: boolean }) => void
  /**
   * The refresh this browser has on the wire (`refreshInFlightHash` of the
   * token presented), stored before it's sent and cleared once the token that
   * replaces it is stored. A `reused` answer for a token still marked means
   * this browser sent it before and never kept the answer (any refresh whose
   * answer never arrived: a tab closed, a timeout, a lost connection), not that
   * someone else used it: the session ends as `expired` instead, keeping the
   * data. Only a hash, never a token.
   */
  inFlight: {
    read: () => Promise<string | null>
    write: (hash: string | null) => Promise<void>
  }
}

/** How long a tab waits for the access token another tab just refreshed. */
export const TAB_TOKENS_WAIT_MS = 1_000

/** Why a new session was opened. */
export type SessionOpenReason =
  /** None on this device for this account key. */
  | 'new'
  /** The session reached its 90 days. */
  | 'expired'
  /** The server ended it (a reused refresh token, or the 10-session cap). */
  | 'ended'
  /**
   * The keystore's refresh token was stale: saving its replacement failed, so
   * presenting it could end the session as a reused token.
   */
  | 'unsaved'
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
  /**
   * This build's version (`major.minor.patch`), sent on open and refresh so
   * Devices can show it; anything else isn't sent.
   */
  appVersion?: () => string | null | undefined
  fetchImpl?: typeof fetch
  /** Ww-api answered 426 `upgrade_required`. */
  onUpgradeRequired?: () => void
  /** A browser: no attestation, and tabs share the session. */
  web?: WebSessionDeps
  /**
   * Update Required is showing: no session opens or refreshes and no call goes
   * out, each failing as a 426 would, until it lifts.
   */
  paused?: () => boolean
  onEvent?: (event: AccountSessionEvent) => void
  /**
   * Writing (`save`) or deleting (`delete`) the stored session failed twice.
   * The error is the store's; it never holds a token.
   */
  onStoreFailure?: (op: 'save' | 'delete', error: unknown) => void
  /**
   * A session became this device's: read from the keystore, opened, or adopted
   * in a handoff. Account Activity names every session this install had as
   * "this device".
   */
  onThisDeviceSession?: (sessionId: string) => void
  /** The account's status as this device knows it changed (`noteStatus`). */
  onStatusChange?: (accountPub: string, status: AccountStatus) => void
  /**
   * A call worked while this device thinks the account is suspended: it may
   * have been reinstated, so the account is worth reading again.
   */
  onSucceededWhileSuspended?: (accountKey: Uint8Array) => void
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

/** The last key's public key: deriving it is the slow part. */
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

/**
 * The session's account while it's this account key's, else null. A key
 * replaced elsewhere (iCloud Keychain brings the new one) leaves the old key's
 * session stored until a call opens the new key's.
 */
export const sessionAccountForKey = (
  session: Pick<AccountSessionSnapshot, 'accountId' | 'accountPub'> | null,
  accountKey: Uint8Array | null
): string | null =>
  session && accountKey && publicKeyOf(accountKey) === session.accountPub
    ? session.accountId
    : null

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
/**
 * A rate-limited `session/open` (429) waits out the server's Retry-After (or
 * body `retryAfter`) before attesting again for that account key, this long
 * when it gives none, and never longer than a day. Try Again doesn't skip it:
 * the server would only refuse again.
 */
export const OPEN_RATE_LIMIT_DEFAULT_MS = 60_000
export const OPEN_RATE_LIMIT_MAX_MS = 24 * 60 * 60_000
/** Tries per keystore write before marking the stored token stale. */
export const STORE_ATTEMPTS = 2
/**
 * How long replacing the account key waits for the server to close the old
 * session; it's forgotten here either way.
 */
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
  /** The refresh token the keystore holds, as far as this launch knows. */
  let storedToken: string | null = null
  /** A stale mark may be set (`SessionStore.stale`). */
  let staleMarked = false
  /** The stored session was stale, and the next open says so. */
  let discardedStale = false
  /** A key change in progress (`changeKey`), which every call waits out. */
  let keyChange: Promise<void> | null = null
  /** Key changes begun, so a key read during one is read again. */
  let keyChanges = 0
  /** Public keys this device replaced: no session opens for them again. */
  const retired = new Set<string>()
  /** Per account key, until when `session/open` is rate limited (device clock). */
  const openLimitedUntil = new Map<string, number>()
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

  /** Fails as a 426 would, without asking ww-api, while `paused`. */
  const refuseWhilePaused = () => {
    if (deps.paused?.())
      throw new AccountSessionError('upgrade', {
        status: 426,
        serverCode: 'upgrade_required',
      })
  }

  /** Never throws: a mark that can't be written leaves the token as it is. */
  async function markStale(refreshToken: string | null) {
    if (!deps.store.stale || (refreshToken === null && !staleMarked)) return
    try {
      await deps.store.stale.write(
        refreshToken === null ? null : staleTokenHash(refreshToken)
      )
      staleMarked = refreshToken !== null
    } catch {
      // Then the next launch presents it, and at worst the server ends that
      // session and a new one is opened, as it would be anyway.
    }
  }

  /**
   * Writes the stored session (null deletes it), in order, so a late write
   * never replaces a newer one. `current` false skips a write the session has
   * moved past (closed, forgotten, or replaced). Tries twice; then marks the
   * token the keystore still holds stale, reports it, and rejects.
   */
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
          // The status changing alone leaves the same token stored.
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

  /**
   * `persist`, for callers that go on either way: a session that couldn't be
   * saved is still this launch's, and the next launch won't present its
   * predecessor (see the top of this file).
   */
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
      // A session opened or adopted while reading wins.
      if (!saved || live) return
      if (stale === staleTokenHash(saved.refreshToken)) {
        // A newer token never reached the keystore. Presenting this one could
        // end the session as a reused token, so open a new one instead, and
        // delete it again (the mark stays until that works).
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
      // A label is optional; never fail a session over it.
      return undefined
    }
  }

  /** The rate limit still holding off this key's `session/open`, if any. */
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

  /**
   * Attests this device for the account key (the challenge from
   * `/attestation/v1/challenge`), then opens the session with the proof. While
   * the server's rate limit on it lasts, fails at once with `rateLimited`,
   * asking nothing of the device or the server.
   */
  async function open(
    accountKey: Uint8Array,
    key: AccountSigningKey,
    reason: SessionOpenReason,
    call: { signal?: AbortSignal; current?: () => boolean } = {}
  ): Promise<OpenedSession> {
    const pub = key.publicKey
    const limited = openRateLimit(pub)
    if (limited) throw limited
    try {
      return await attestAndOpen(accountKey, key, reason, call)
    } catch (error) {
      const failure = toAccountSessionError(error)
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
    call: { signal?: AbortSignal; current?: () => boolean }
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
            // Closed, forgotten, or its key replaced while attesting: no
            // session for it reaches the server.
            if (call.current && !call.current())
              throw new AttestationHttpError({ kind: 'cancelled' })
            try {
              return await sendSessionOpen(
                { proof, device, appVersion: appVersion() },
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
          signal: call.signal,
        }),
      { reason }
    )
  }

  /**
   * `session/refresh`, saved before anything uses the new token. A failed write
   * still uses it, and marks the replaced token stale. Also answers the access
   * token's expiry on the server's clock, for the other tabs.
   */
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
    // A browser re-reads the stored token before each refresh; while this one
    // isn't stored, it must present the one it holds, not the replaced one.
    unsavedToken =
      saved === 'failed'
        ? { replaced: current.refreshToken, held: tokens.refreshToken }
        : null
    return { next, accessExpiresAt: tokens.accessExpiresAt, saved }
  }

  /**
   * A browser's `refresh`, marked in flight while it's on the wire
   * (`WebSessionDeps.inFlight`). Runs inside the session lock.
   */
  async function refreshMarked(
    web: WebSessionDeps,
    current: Live,
    unchanged: () => boolean
  ) {
    // Nothing goes out the browser knows can't arrive: a mark left on a
    // request that never left would later excuse a real reuse.
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      throw new AccountSessionError('offline')
    const hash = refreshInFlightHash(current.refreshToken)
    const sentBefore = (await web.inFlight.read().catch(() => null)) === hash
    try {
      await web.inFlight.write(hash)
    } catch {
      // Never sent unmarked: a lost answer would later look like theft.
      throw new AccountSessionError('cancelled')
    }
    if (!unchanged()) throw new AccountSessionError('cancelled')
    try {
      const result = await refresh(current, unchanged)
      if (result.saved === 'saved')
        await web.inFlight.write(null).catch(() => undefined)
      return result
    } catch (error) {
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
      // This browser presented it before: the server's answer to that was
      // lost, not stolen. It has ended the session either way.
      throw new AccountSessionError('server', {
        status: 401,
        serverCode: error.serverCode,
        ended: 'expired',
      })
    }
  }

  /**
   * A browser's refreshed token that couldn't be stored, and the one it
   * replaced.
   */
  let unsavedToken: { replaced: string; held: string } | null = null

  /** The newest access token another tab refreshed (`receive`). */
  let tabTokens: Extract<SessionTabMessage, { type: 'tokens' }> | null = null
  const tabWaiters = new Set<() => void>()

  /**
   * The access token another tab refreshed for `saved`'s refresh token, once
   * its message arrives (at most `TAB_TOKENS_WAIT_MS`); null when none does.
   */
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

  /**
   * A browser's refresh, run while no other tab refreshes. The stored refresh
   * token is read again first: when another tab already refreshed, this one
   * takes the access token it shared instead of refreshing again (presenting
   * the replaced token would end the session as reused).
   */
  async function refreshInTabs(
    web: WebSessionDeps,
    current: Live,
    rejected: string | undefined,
    unchanged: () => boolean
  ): Promise<Live> {
    const raw = await deps.store.read().catch(() => undefined)
    // The browser's storage couldn't be read: nothing is sent, and the
    // session stays for the next call.
    if (raw === undefined || !unchanged())
      throw new AccountSessionError('cancelled')
    const saved = parseStored(raw)
    // Signed out, or in again, in another tab.
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

  /**
   * A browser's session is over: forgotten here and in the other tabs, and the
   * app wipes or asks the User to sign in again (`onEnded`).
   */
  function endWebSession(
    current: Live,
    reason: SessionEndReason
  ): AccountSessionError {
    generation++
    lastFailure = null
    live = null
    // First, so a wipe is marked pending before the other tabs hear of it.
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

  /** What another tab told this one (`WebSessionDeps.publish`). */
  function receive(message: SessionTabMessage) {
    if (!deps.web) return
    if (message.type === 'tokens') {
      tabTokens = message
      for (const check of [...tabWaiters]) check()
      // Its refresh token is read from the store before the next refresh.
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

  /** Waits for `promise` at most `ms`; it carries on in the background. */
  const settleWithin = (promise: Promise<unknown>, ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms)
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      promise.then(done, done)
    })

  /** Until a key change in progress (`changeKey`) is over. */
  async function keySettled() {
    while (keyChange) await keyChange
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
    const pub = key.publicKey
    refuseWhilePaused()
    // Nothing starts while the account key is being replaced, so no session
    // opens or refreshes for the old key in between.
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
      if (current && current.accountPub !== pub) {
        // Another account key's session: end it rather than leave it behind.
        live = null
        void save(null)
        void closeTokens({ ...current, accessUsable: accessUsable(current) })
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
          if (deps.web) throw endWebSession(current, error.ended ?? 'unknown')
          reason = 'ended'
        }
      }
      // A browser can't attest: the User signs in again.
      if (deps.web) {
        if (current && reason === 'expired')
          throw endWebSession(current, 'expired')
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
        opened = await open(accountKey, key, reason, { current: unchanged })
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
      .then(run)
    flight = { pub, promise }
    void promise
      .catch(() => undefined)
      .finally(() => {
        if (flight?.promise === promise) flight = null
      })
    return raceSignal(promise, call.signal)
  }

  /** The last key derived, by its account key: Buddies asks on every call. */
  let derived: { accountKey: string; key: AccountSigningKey } | null = null
  /** The account key, read once no key change is under way. */
  async function settledKey(accountKey?: Uint8Array): Promise<Uint8Array> {
    await keySettled()
    const changes = keyChanges
    const bytes = accountKey ?? (await deps.accountKey())
    // A key change began while reading: read it again once that's over.
    return changes === keyChanges && !keyChange ? bytes : settledKey(accountKey)
  }
  const keyFor = async (accountKey?: Uint8Array) => {
    const bytes = await settledKey(accountKey)
    const encoded = toB64u(bytes)
    if (derived?.accountKey !== encoded)
      derived = { accountKey: encoded, key: deriveAccountSigningKey(bytes) }
    return { bytes, key: derived.key }
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
   * failures are thrown as they are. `renew` refreshes the access token first,
   * which opens a new session when the server ended this one. A 403 `suspended`
   * notes the account as suspended; a call that works while it's noted so calls
   * `onSucceededWhileSuspended`.
   */
  async function withSession<T>(
    run: (authorization: string, session: AccountSessionInfo) => Promise<T>,
    call: {
      accountKey?: Uint8Array
      signal?: AbortSignal
      renew?: boolean
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
    call: { accountKey?: Uint8Array; renew?: boolean } = {}
  ): Promise<HttpResponse<T>> {
    return withSession(
      (authorization) =>
        request<T>({
          ...options,
          headers: { ...options.headers, authorization },
          fetchImpl: options.fetchImpl ?? deps.fetchImpl,
        }),
      { accountKey: call.accountKey, signal: options.signal, renew: call.renew }
    )
  }

  /**
   * Makes a session opened elsewhere this device's: a handoff's, or a browser's
   * from its sign-in ticket (or `web/signup`). Says whether it was stored; it's
   * this launch's either way.
   */
  async function adopt(
    accountKey: Uint8Array,
    opened: OpenedSession
  ): Promise<'saved' | 'skipped' | 'failed'> {
    const pub = deriveAccountSigningKey(accountKey).publicKey
    await load()
    const adoptedAt = ++generation
    flight = null
    lastFailure = null
    // A browser that signs in again as an account whose key a key change in
    // this page set aside. A phone's handoff never brings a replaced key back.
    if (deps.web) retired.delete(pub)
    live = toLive(pub, opened)
    deps.onThisDeviceSession?.(opened.sessionId)
    return save(stored(live), () => generation === adoptedAt)
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
    refuseWhilePaused()
    const key = deriveAccountSigningKey(accountKey)
    const opened = await open(accountKey, key, 'handoff', {
      signal: call.signal,
    })
    let settled = false
    return {
      accountId: opened.accountId,
      status: opened.status,
      sessionId: opened.sessionId,
      adopt: async () => {
        if (settled) return
        settled = true
        // Kept for this launch even when the keystore fails.
        await adopt(accountKey, opened)
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
   * it in time. A delete the keystore refuses twice is reported
   * (`onStoreFailure`), and the token marked stale, so the next launch deletes
   * it instead of using it. `waitMs` waits at most that long for the server;
   * the session is forgotten here at once either way.
   */
  async function close({ waitMs }: { waitMs?: number } = {}): Promise<void> {
    await load()
    let current = live
    // Another tab may have refreshed since: close with the token it stored.
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

  /** Forgets the session without telling the server. */
  function forget() {
    generation++
    flight = null
    lastFailure = null
    live = null
    void save(null)
  }

  /**
   * Replaces or deletes this device's account key with no session in between:
   * ends and forgets the current session first (here even when the server can't
   * be told; it waits at most `KEY_CHANGE_CLOSE_WAIT_MS` for that), then runs
   * `swap`, which stores the new key (and may adopt its session), while every
   * call waits, so none opens or refreshes a session for the old key. Once
   * `swap` resolves, no session opens for `from` or the forgotten session's key
   * again in this launch. When `swap` throws, the old key stays usable and its
   * next call opens a new session. One at a time.
   */
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

  /**
   * The server said the account's status: reading the account (`GET
   * /accounts/v1/account`), or refusing a call as `suspended`.
   */
  function noteStatus(accountPub: string, status: AccountStatus) {
    if (live?.accountPub !== accountPub || live.status === status) return
    const next = { ...live, status }
    live = next
    if (deps.web) {
      // Never writes back a refresh token another tab has replaced.
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

  /** The last failed `session/open` still holding off retries, if any. */
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
    noteStatus,
    snapshot,
    lastOpenFailure,
    /** Resolves once stored state is read; for tests and the Tools. */
    ready: () => load().then(() => storeQueue),
  }
}

export type AccountSessions = ReturnType<typeof createAccountSessions>
