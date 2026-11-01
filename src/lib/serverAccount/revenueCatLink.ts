import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { utf8 } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import type { AuthorizedRequest } from '@/lib/serverAccount/activityClient'
import { ACCOUNT_TIMEOUT_MS } from '@/lib/serverAccount/client'
import { AccountSessionError } from '@/lib/serverAccount/session'

const REVENUECAT_APP_USER_ID = /^[A-Za-z0-9_-]{8,64}$/

export const toRevenueCatAppUserId = (
  id: string | null | undefined
): string | undefined =>
  typeof id === 'string' && REVENUECAT_APP_USER_ID.test(id) ? id : undefined

export const LINK_REFRESH_MS = 24 * 60 * 60_000

export const UNAVAILABLE_DEFAULT_MS = 60_000

export type RevenueCatLinkReason =
  | 'session_opened'
  | 'account_changed'
  | 'launch'
  | 'foreground'
  | 'adopted'
  | 'entitlements'
  | 'paid_call'
  | 'refused'
  | 'tools'

export type RevenueCatLinkOutcome =
  | { result: 'linked'; supporter: boolean; expiresAt: number | null }
  | { result: 'skipped' }
  | { result: 'no_session' }
  | { result: 'no_customer' }
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

  request: AuthorizedRequest

  currentAccount: () => Promise<string | null>

  openAccount: () => Promise<string>

  appUserId: () => Promise<string | null>

  storage: { get: () => string | null; set: (value: string | null) => void }
  now: () => number
  onOutcome?: (
    outcome: RevenueCatLinkOutcome,
    reason: RevenueCatLinkReason
  ) => void

  onError?: (error: unknown) => void
}

type StoredLink = { key: string; at: number }

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

  function ensure(
    options: {
      force?: boolean
      open?: boolean
      reason: RevenueCatLinkReason
    } = { reason: 'launch' }
  ): Promise<RevenueCatLinkOutcome> {
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

  function reset() {
    deps.storage.set(null)
    backoffUntil = 0
  }

  return { ensure, fetchStatus, reset }
}

export type RevenueCatLink = ReturnType<typeof createRevenueCatLink>
