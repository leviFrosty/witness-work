import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { utf8 } from '@/lib/bytes'
import type {
  RevenueCatLinkOutcome,
  RevenueCatLinkReason,
} from '@/lib/serverAccount/revenueCatLink'

export const SERVER_SUPPORTER_REFRESH_MS = 4 * 60 * 60_000

export const SERVER_SUPPORTER_ONLY_SOURCE_REFRESH_MS = 15 * 60_000

export const PEER_CLAIM_RETRY_MS = 15_000

export type ServerSupporterStatus = {
  supporter: boolean

  expiresAt: number | null
}

export type ServerSupporterEntry = ServerSupporterStatus & {
  account: string
  readAt: number
}

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

export const nextServerSupporterChange = (
  entry: ServerSupporterEntry | null,
  now: number
): number | null =>
  entry?.supporter && entry.expiresAt !== null && now < entry.expiresAt
    ? entry.expiresAt
    : null

export type ServerSupporterDeps = {
  currentAccount: () => Promise<string | null>

  link: (reason: RevenueCatLinkReason) => Promise<RevenueCatLinkOutcome>

  fetchStatus: (accountId: string) => Promise<ServerSupporterStatus>
  store: {
    entry: () => ServerSupporterEntry | null
    setEntry: (entry: ServerSupporterEntry | null) => void
    setAccount: (account: string | null) => void

    bound: () => string | null
    bind: (account: string) => void

    adoptedFor: () => string | null
  }

  onAccountSwitched: (previous: string) => void
  now: () => number

  refreshMs?: () => number

  schedule?: (run: () => void, afterMs: number) => void
}

export type SupporterAccountBinding = Pick<
  ServerSupporterDeps,
  'onAccountSwitched'
> & {
  store: Pick<
    ServerSupporterDeps['store'],
    'entry' | 'setEntry' | 'setAccount' | 'bound' | 'bind' | 'adoptedFor'
  >
}

export function confirmSupporterAccount(
  deps: SupporterAccountBinding,
  accountId: string
): string {
  const account = accountFingerprint(accountId)
  const previous =
    deps.store.bound() ??
    deps.store.entry()?.account ??
    deps.store.adoptedFor() ??
    null
  if (previous !== null && previous !== account) {
    deps.store.setEntry(null)
    deps.onAccountSwitched(previous)
  }
  if (deps.store.bound() !== account) deps.store.bind(account)
  deps.store.setAccount(account)
  return account
}

export function createServerSupporter(deps: ServerSupporterDeps) {
  let unanswered: string | null = null

  async function record(accountId: string, status: ServerSupporterStatus) {
    if ((await deps.currentAccount()) !== accountId) return
    const account = confirmSupporterAccount(deps, accountId)
    deps.store.setEntry({
      account,
      supporter: status.supporter,
      expiresAt: status.expiresAt,
      readAt: deps.now(),
    })
    if (unanswered === account) unanswered = null
  }

  let flight: Promise<void> | null = null

  let forced: Promise<void> | null = null

  async function run(options: {
    force: boolean
    reason: RevenueCatLinkReason
  }) {
    const accountId = await deps.currentAccount()
    if (!accountId) {
      deps.store.setAccount(null)
      return
    }
    const previous = deps.store.bound()
    const account = confirmSupporterAccount(deps, accountId)
    if (previous !== null && previous !== account) unanswered = account
    const entry = deps.store.entry()

    if (
      !options.force &&
      entry?.account === account &&
      deps.now() - entry.readAt <
        (deps.refreshMs?.() ?? SERVER_SUPPORTER_REFRESH_MS) &&
      (entry.expiresAt === null || deps.now() < entry.expiresAt)
    )
      return
    const outcome = await deps.link(options.reason)

    if (outcome.result === 'linked' && outcome.accountId === accountId) {
      await record(accountId, outcome)
      return
    }

    if (outcome.result === 'offline') return

    if (
      outcome.result === 'backoff' &&
      (entry === null ? unanswered !== account : entry.account === account)
    )
      return
    try {
      await record(accountId, await deps.fetchStatus(accountId))
    } catch {}
  }

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

  async function accountChanged(): Promise<void> {
    await refresh({ force: true, reason: 'account_changed' })
  }

  async function accountSwitched(): Promise<void> {
    unanswered = deps.store.bound()
    await flight
    await refresh({ reason: 'account_changed' })
  }

  const answersSupporter = (): boolean => {
    const entry = deps.store.entry()
    return (
      !!entry?.supporter &&
      (entry.expiresAt === null || deps.now() < entry.expiresAt)
    )
  }

  let peersEntitled: boolean | null = null

  async function peerClaimsChanged(entitled: boolean): Promise<void> {
    peersEntitled = entitled
    if (entitled === answersSupporter()) return
    await refresh({ force: true, reason: 'peer_claim' })

    if (!entitled || answersSupporter()) return
    deps.schedule?.(() => {
      if (peersEntitled && !answersSupporter())
        void refresh({ force: true, reason: 'peer_claim' })
    }, PEER_CLAIM_RETRY_MS)
  }

  async function expired(): Promise<void> {
    await refresh({ reason: 'expired' })
  }

  return {
    record,
    refresh,
    accountChanged,
    accountSwitched,
    peerClaimsChanged,
    expired,
  }
}
