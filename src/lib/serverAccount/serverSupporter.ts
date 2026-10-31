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
 * the last answer has expired. Opens no session of its own, only one in place
 * of a session an older key left (ADR 0039 §7), and sends no RevenueCat id: the
 * link carries that.
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
  /**
   * This device's session's account: null without a session, or with one that
   * isn't the account key's and can't be replaced by the new key's now.
   */
  currentAccount: () => Promise<string | null>
  /** `ensureRevenueCatLinked`, unforced: it may answer the status itself. */
  link: (reason: RevenueCatLinkReason) => Promise<RevenueCatLinkOutcome>
  /**
   * `GET /accounts/v1/supporter` on the existing session, which must be
   * `accountId`'s. Throws.
   */
  fetchStatus: (accountId: string) => Promise<ServerSupporterStatus>
  store: {
    entry: () => ServerSupporterEntry | null
    setEntry: (entry: ServerSupporterEntry | null) => void
    setAccount: (account: string | null) => void
    /**
     * The account this device's Supporter state belongs to (fingerprint): the
     * last one a session confirmed. Kept through sign-outs.
     */
    bound: () => string | null
    bind: (account: string) => void
  }
  /**
   * A session confirmed an account other than the bound one: drop what the
   * previous account left on this device (the mirror, the RevenueCat id it
   * adopted). The stored answer is already dropped.
   */
  onAccountSwitched: () => void
  now: () => number
}

/** Link outcomes after which asking the server again can't help. */
const UNREACHABLE: ReadonlySet<RevenueCatLinkOutcome['result']> = new Set([
  'offline',
  'backoff',
  'unavailable',
])

export type SupporterAccountBinding = Pick<
  ServerSupporterDeps,
  'onAccountSwitched'
> & {
  store: Pick<
    ServerSupporterDeps['store'],
    'entry' | 'setEntry' | 'setAccount' | 'bound' | 'bind'
  >
}

/**
 * The session's account is `accountId`: every answer is only for it from here,
 * and another account than the bound one drops what the previous one left. An
 * install from before the binding has only its stored answer to tell. Every
 * link confirms its account this way before it names a RevenueCat customer, so
 * an id adopted for the previous account is gone by then. Returns the account's
 * fingerprint.
 */
export function confirmSupporterAccount(
  deps: SupporterAccountBinding,
  accountId: string
): string {
  const account = accountFingerprint(accountId)
  const previous = deps.store.bound() ?? deps.store.entry()?.account ?? null
  if (previous !== null && previous !== account) {
    deps.store.setEntry(null)
    deps.onAccountSwitched()
  }
  if (deps.store.bound() !== account) deps.store.bind(account)
  deps.store.setAccount(account)
  return account
}

export function createServerSupporter(deps: ServerSupporterDeps) {
  /**
   * Keeps `status` as `accountId`'s answer while that's still the session's
   * account; a late answer for a previous account is dropped.
   */
  async function record(accountId: string, status: ServerSupporterStatus) {
    if ((await deps.currentAccount()) !== accountId) return
    const account = confirmSupporterAccount(deps, accountId)
    deps.store.setEntry({
      account,
      supporter: status.supporter,
      expiresAt: status.expiresAt,
      readAt: deps.now(),
    })
  }

  let flight: Promise<void> | null = null
  /** The forced read waiting for `flight`: every forced caller shares it. */
  let forced: Promise<void> | null = null

  async function run(options: {
    force: boolean
    reason: RevenueCatLinkReason
  }) {
    const accountId = await deps.currentAccount()
    if (!accountId) {
      // No session, or the stored one is an older key's: no account to say
      // Supporter for now. The answer stays its account's (bound) until another
      // account confirms, so a key changed on the same account keeps it.
      deps.store.setAccount(null)
      return
    }
    const account = confirmSupporterAccount(deps, accountId)
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
    // A link already under way may have been for the previous account.
    if (outcome.result === 'linked' && outcome.accountId === accountId) {
      await record(accountId, outcome)
      return
    }
    if (UNREACHABLE.has(outcome.result)) return
    try {
      await record(accountId, await deps.fetchStatus(accountId))
    } catch {
      // Offline or failed: the last answer stands until the next read.
    }
  }

  /**
   * Reads the account's status when the last answer is old, for another
   * account, or `force`d. One at a time: a forced read waits for the one under
   * way, which may be for the previous account, then reads again, once for
   * every forced caller meanwhile. Never throws.
   */
  function refresh(options: {
    force?: boolean
    reason: RevenueCatLinkReason
  }): Promise<void> {
    if (flight) {
      if (!options.force) return flight
      forced ??= flight.then(() => {
        forced = null
        return refresh(options)
      })
      return forced
    }
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

  /**
   * The account key changed: read for the new key's account. Another account
   * drops the answer as it confirms; the same one (ADR 0039) keeps it.
   */
  async function accountChanged(): Promise<void> {
    await refresh({ force: true, reason: 'account_changed' })
  }

  return { record, refresh, accountChanged }
}
