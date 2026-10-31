import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { utf8 } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import type { AuthorizedRequest } from '@/lib/serverAccount/activityClient'
import { ACCOUNT_TIMEOUT_MS } from '@/lib/serverAccount/client'
import { AccountSessionError } from '@/lib/serverAccount/session'

/**
 * Links the RevenueCat customer this device is logged in as to its server
 * account (ADR 0029, docs/accounts-protocol.md "Supporter status"), so ww-api
 * answers Supporter status from the account. The server reads the customer from
 * RevenueCat itself; this only names it.
 *
 * Linking never opens a session on its own (`open` asks for one only where the
 * caller needs one anyway, before Scribe AI or route planning). It remembers
 * the last link as a hash of the account id and RevenueCat id plus its time,
 * never the ids, and repeats it at most once a day unless forced (a purchase, a
 * restore, another id). A 503 waits out its `Retry-After`. Never throws: every
 * failure waits for the next trigger.
 */

/** What ww-api accepts as `appUserId`: 8 to 64 of `A-Z a-z 0-9 _ -`. */
const REVENUECAT_APP_USER_ID = /^[A-Za-z0-9_-]{8,64}$/

/**
 * `id` when ww-api would accept it as a RevenueCat app user id, else undefined.
 * RevenueCat's anonymous ids (`$RCAnonymousID:…`) never match.
 */
export const toRevenueCatAppUserId = (
  id: string | null | undefined
): string | undefined =>
  typeof id === 'string' && REVENUECAT_APP_USER_ID.test(id) ? id : undefined

/** A link repeats at most this often unless forced. */
export const LINK_REFRESH_MS = 24 * 60 * 60_000
/** A 503 without `Retry-After` waits this long. */
export const UNAVAILABLE_DEFAULT_MS = 60_000

export type RevenueCatLinkReason =
  | 'session_opened'
  | 'account_changed'
  | 'launch'
  | 'foreground'
  | 'adopted'
  | 'entitlements'
  | 'paid_call'
  /** The server refused a paid call as not a Supporter. */
  | 'refused'
  | 'tools'
  /** Web checkout returned (docs/web-purchases.md "The return page"). */
  | 'purchase_return'

export type RevenueCatLinkOutcome =
  /** Linked; the account's status as the server answered. */
  | { result: 'linked'; supporter: boolean; expiresAt: number | null }
  /** The same link was made within a day. */
  | { result: 'skipped' }
  /** No session on this device, and the caller didn't ask for one. */
  | { result: 'no_session' }
  /** RevenueCat isn't set up, or its id isn't one ww-api accepts. */
  | { result: 'no_customer' }
  /** Waiting out a 503's `Retry-After`. */
  | { result: 'backoff' }
  | { result: 'unavailable' }
  | { result: 'offline' }
  | { result: 'failed' }

export type SupporterStatus = {
  supporter: boolean
  expiresAt: number | null
  customers: number
}

export type RevenueCatLinkDeps = {
  baseUrl: string
  /** `accountSessions.request`. */
  request: AuthorizedRequest
  /** This device's existing session's account, without opening one. */
  currentAccount: () => Promise<string | null>
  /** Opens this device's session when there's none; its account. */
  openAccount: () => Promise<string>
  /** The RevenueCat app user id this device is logged in as, or null. */
  appUserId: () => Promise<string | null>
  /** Device-local: the last link's hash and time. */
  storage: { get: () => string | null; set: (value: string | null) => void }
  now: () => number
  onOutcome?: (
    outcome: RevenueCatLinkOutcome,
    reason: RevenueCatLinkReason
  ) => void
  /** Unexpected failures (never an HTTP answer, never an id). */
  onError?: (error: unknown) => void
}

type StoredLink = { key: string; at: number }

/** The last link's fingerprint: never the ids themselves. */
export const linkKey = (accountId: string, appUserId: string) =>
  bytesToHex(
    sha256(utf8(`ww-account/v1/revenuecat-link\n${accountId}\n${appUserId}`))
  )

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseExpiry = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null

export function createRevenueCatLink(deps: RevenueCatLinkDeps) {
  let flight: Promise<RevenueCatLinkOutcome> | null = null
  let backoffUntil = 0

  const readStored = (): StoredLink | null => {
    try {
      const raw = deps.storage.get()
      if (!raw) return null
      const parsed: unknown = JSON.parse(raw)
      return isRecord(parsed) &&
        typeof parsed.key === 'string' &&
        typeof parsed.at === 'number'
        ? { key: parsed.key, at: parsed.at }
        : null
    } catch {
      return null
    }
  }

  const failureOf = (error: unknown): RevenueCatLinkOutcome => {
    if (error instanceof AccountSessionError) {
      if (error.failure === 'offline' || error.failure === 'cancelled')
        return { result: 'offline' }
      if (error.failure === 'unavailable') return { result: 'unavailable' }
      return { result: 'failed' }
    }
    if (error instanceof HttpError) {
      if (
        error.kind === 'offline' ||
        error.kind === 'timeout' ||
        error.kind === 'cancelled'
      )
        return { result: 'offline' }
      if (error.status === 503 && error.serverCode === 'unavailable') {
        backoffUntil =
          deps.now() + (error.retryAfterMs ?? UNAVAILABLE_DEFAULT_MS)
        return { result: 'unavailable' }
      }
      return { result: 'failed' }
    }
    deps.onError?.(error)
    return { result: 'failed' }
  }

  async function run(options: {
    force: boolean
    open: boolean
    reason: RevenueCatLinkReason
  }): Promise<RevenueCatLinkOutcome> {
    if (options.reason !== 'tools' && deps.now() < backoffUntil)
      return { result: 'backoff' }
    try {
      const appUserId = toRevenueCatAppUserId(await deps.appUserId())
      if (!appUserId) return { result: 'no_customer' }
      const accountId = options.open
        ? await deps.openAccount()
        : await deps.currentAccount()
      if (!accountId) return { result: 'no_session' }

      const key = linkKey(accountId, appUserId)
      const stored = readStored()
      if (
        !options.force &&
        stored?.key === key &&
        deps.now() - stored.at < LINK_REFRESH_MS
      )
        return { result: 'skipped' }

      const response = await deps.request<Record<string, unknown> | null>({
        url: `${deps.baseUrl}/accounts/v1/revenuecat-customers`,
        method: 'POST',
        json: { appUserId },
        timeoutMs: ACCOUNT_TIMEOUT_MS,
      })
      const data = response.data
      if (!isRecord(data) || typeof data.supporter !== 'boolean')
        return { result: 'failed' }
      deps.storage.set(JSON.stringify({ key, at: deps.now() }))
      return {
        result: 'linked',
        supporter: data.supporter,
        expiresAt: parseExpiry(data.expiresAt),
      }
    } catch (error) {
      return failureOf(error)
    }
  }

  /**
   * Links this device's RevenueCat customer to its account when that's due.
   * `force` repeats a link made within the day; `open` opens a session when
   * there's none. One at a time: a call while one runs gets that one's answer.
   */
  function ensure(
    options: {
      force?: boolean
      open?: boolean
      reason: RevenueCatLinkReason
    } = { reason: 'launch' }
  ): Promise<RevenueCatLinkOutcome> {
    // A forced link (a purchase) mustn't be lost to a routine one already
    // running: it runs again once that one is done.
    if (flight)
      return options.force ? flight.then(() => ensure(options)) : flight
    const current = run({
      force: options.force ?? false,
      open: options.open ?? false,
      reason: options.reason,
    }).then((outcome) => {
      deps.onOutcome?.(outcome, options.reason)
      return outcome
    })
    flight = current
    void current.finally(() => {
      if (flight === current) flight = null
    })
    return current
  }

  /**
   * The account's Supporter status as ww-api answers it (`GET
   * /accounts/v1/supporter`), for the developer Tools. Opens a session when
   * there's none. Throws.
   */
  async function fetchStatus(): Promise<SupporterStatus> {
    const response = await deps.request<Record<string, unknown> | null>({
      url: `${deps.baseUrl}/accounts/v1/supporter`,
      method: 'GET',
      timeoutMs: ACCOUNT_TIMEOUT_MS,
    })
    const data = response.data
    if (
      !isRecord(data) ||
      typeof data.supporter !== 'boolean' ||
      typeof data.customers !== 'number'
    )
      throw new Error('Malformed Supporter status')
    return {
      supporter: data.supporter,
      expiresAt: parseExpiry(data.expiresAt),
      customers: data.customers,
    }
  }

  /** Forgets the last link, so the next trigger links again. */
  function reset() {
    deps.storage.set(null)
    backoffUntil = 0
  }

  return { ensure, fetchStatus, reset }
}

export type RevenueCatLink = ReturnType<typeof createRevenueCatLink>
