import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { utf8 } from '@/lib/bytes'
import type {
  RevenueCatLinkOutcome,
  RevenueCatLinkReason,
} from '@/lib/serverAccount/revenueCatLink'

/**
 * The account's Supporter status as ww-api answers it (ADR 0029), kept as
 * `useIsSupporter`'s fallback for when RevenueCat doesn't say so (ADR 0040 §7):
 * a purchase made under another of the account's RevenueCat customers, or a
 * device without RevenueCat. Device-local, never synced, and only for the
 * account it was read for.
 *
 * Read when a session opens, after a link (`onRevenueCatLinked`), and otherwise
 * at most every `SERVER_SUPPORTER_REFRESH_MS` on launch or foreground, or once
 * the last answer has expired. Never opens a session itself, and sends no
 * RevenueCat id: the link carries that.
 */

export const SERVER_SUPPORTER_REFRESH_MS = 4 * 60 * 60_000

export type ServerSupporterStatus = {
  supporter: boolean
  /** When it ends, or null for no end (a lifetime grant). */
  expiresAt: number | null
}

export type ServerSupporterEntry = ServerSupporterStatus & {
  /** The account it was read for, as `accountFingerprint`. */
  account: string
  readAt: number
}

/** The account an answer belongs to, without keeping its id. */
export const accountFingerprint = (accountId: string): string =>
  bytesToHex(sha256(utf8(`ww-account/v1/supporter\n${accountId}`)))

export const parseServerSupporterEntry = (
  raw: string | null | undefined
): ServerSupporterEntry | null => {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { account, supporter, expiresAt, readAt } = value as Record<
      string,
      unknown
    >
    if (typeof account !== 'string' || typeof supporter !== 'boolean')
      return null
    if (expiresAt !== null && typeof expiresAt !== 'number') return null
    if (typeof readAt !== 'number') return null
    return { account, supporter, expiresAt, readAt }
  } catch {
    return null
  }
}

/**
 * Whether the answer makes the User a Supporter now. `account` is the current
 * session's fingerprint: undefined while the session is still loading (the last
 * answer stands, so a launch doesn't flicker), null without a session.
 */
export const serverSupporterActive = (
  entry: ServerSupporterEntry | null,
  account: string | null | undefined,
  now: number
): boolean => {
  if (!entry?.supporter) return false
  if (account === null) return false
  if (account !== undefined && account !== entry.account) return false
  return entry.expiresAt === null || now < entry.expiresAt
}

/** When `serverSupporterActive` next changes on its own: the expiry. */
export const nextServerSupporterChange = (
  entry: ServerSupporterEntry | null,
  now: number
): number | null =>
  entry?.supporter && entry.expiresAt !== null && now < entry.expiresAt
    ? entry.expiresAt
    : null

export type ServerSupporterDeps = {
  /** This device's existing session's account, without opening one. */
  currentAccount: () => Promise<string | null>
  /** `ensureRevenueCatLinked`, unforced: it may answer the status itself. */
  link: (reason: RevenueCatLinkReason) => Promise<RevenueCatLinkOutcome>
  /** `GET /accounts/v1/supporter` on the existing session. Throws. */
  fetchStatus: () => Promise<ServerSupporterStatus>
  store: {
    entry: () => ServerSupporterEntry | null
    setEntry: (entry: ServerSupporterEntry | null) => void
    setAccount: (account: string | null) => void
  }
  now: () => number
}

/** Link outcomes after which asking the server again can't help. */
const UNREACHABLE: ReadonlySet<RevenueCatLinkOutcome['result']> = new Set([
  'offline',
  'backoff',
  'unavailable',
])

export function createServerSupporter(deps: ServerSupporterDeps) {
  const record = (accountId: string, status: ServerSupporterStatus) => {
    const account = accountFingerprint(accountId)
    deps.store.setAccount(account)
    deps.store.setEntry({
      account,
      supporter: status.supporter,
      expiresAt: status.expiresAt,
      readAt: deps.now(),
    })
  }

  let flight: Promise<void> | null = null

  async function run(options: {
    force: boolean
    reason: RevenueCatLinkReason
  }) {
    const accountId = await deps.currentAccount()
    if (!accountId) {
      // Signed out, or never signed in: no account to be a Supporter for.
      deps.store.setAccount(null)
      deps.store.setEntry(null)
      return
    }
    const account = accountFingerprint(accountId)
    deps.store.setAccount(account)
    const entry = deps.store.entry()
    // An answer that has expired is due now: the subscription may have renewed.
    if (
      !options.force &&
      entry?.account === account &&
      deps.now() - entry.readAt < SERVER_SUPPORTER_REFRESH_MS &&
      (entry.expiresAt === null || deps.now() < entry.expiresAt)
    )
      return
    const outcome = await deps.link(options.reason)
    if (outcome.result === 'linked') {
      record(accountId, outcome)
      return
    }
    if (UNREACHABLE.has(outcome.result)) return
    try {
      record(accountId, await deps.fetchStatus())
    } catch {
      // Offline or failed: the last answer stands until the next read.
    }
  }

  /**
   * Reads the account's status when the last answer is old, for another
   * account, or `force`d. One at a time. Never throws.
   */
  function refresh(options: {
    force?: boolean
    reason: RevenueCatLinkReason
  }): Promise<void> {
    if (flight) return flight
    const current = run({
      force: options.force ?? false,
      reason: options.reason,
    }).catch(() => {})
    flight = current
    void current.finally(() => {
      if (flight === current) flight = null
    })
    return current
  }

  /** The account key changed: the answer was another account's. */
  async function accountChanged(): Promise<void> {
    deps.store.setEntry(null)
    await flight
    await refresh({ force: true, reason: 'account_changed' })
  }

  return { record, refresh, accountChanged }
}
