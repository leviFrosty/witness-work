import { getOnline } from '@/lib/http/online'
import { HttpError } from '@/lib/http/request'
import type {
  AccountStatus,
  ServerAccountInfo,
} from '@/lib/serverAccount/client'
import {
  type AccountSigningKey,
  deriveAccountSigningKey,
  signInboxLink,
} from '@/lib/serverAccount/keys'
import {
  AccountSessionError,
  type AccountSessionInfo,
  type AttestationProblem,
  type RekeyedTokens,
  toAccountSessionError,
} from '@/lib/serverAccount/session'

/**
 * The server account (ADR 0024): an anonymous account the server owns, so it
 * can suspend someone for abuse, and later move their data between iOS and
 * Android. Not ADR 0011's account id, which is the RevenueCat identity.
 *
 * The account key is the User's one secret (today the Buddies root seed); the
 * server knows the account by a random id and the public half of a key derived
 * from it. This device reaches it through an attested session (ADR 0027,
 * `session.ts`), whose `session/open` creates the account the first time. The
 * id is kept on this device, with the public key it belongs to, for features
 * that only need to name it.
 */

/** What this device remembers. Never synced or backed up. */
export type CachedServerAccount = {
  accountPub: string
  accountId: string | null
  /** As the server last said; absent before it was kept. */
  status?: AccountStatus
  /** Accounts were off on the server; don't ask again until then. */
  unavailableUntil?: number
}

export type ServerAccountStorage = {
  get: () => CachedServerAccount | null
  set: (value: CachedServerAccount | null) => void
}

/** The account a feature works with: its id, and the key to claim things. */
export type ServerAccountSession = {
  accountId: string
  /** The account's claim on a Buddies inbox (`inbox/register`'s `account`). */
  signInboxLink: (inboxId: string, ownerPub: string) => string
}

export type ServerAccountDeps = {
  /** This device's attested sessions (`createAccountSessions`). */
  sessions: {
    ensure: (
      accountKey: Uint8Array,
      call?: { retry?: boolean; accountId?: string }
    ) => Promise<AccountSessionInfo>
    forget: () => void
    close: () => Promise<void>
    changeKey: <T>(
      swap: () => Promise<T>,
      keys?: { from?: Uint8Array | null; to?: Uint8Array | null }
    ) => Promise<T>
    noteStatus?: (accountPub: string, status: AccountStatus) => void
    /** `AccountSessions.repoint`: the session moves to the new key in place. */
    repoint?: (
      fromPub: string,
      toPub: string,
      tokens?: RekeyedTokens
    ) => Promise<boolean>
  }
  /** `account/info` over the session: the account as the server holds it. */
  info?: (accountKey: Uint8Array) => Promise<ServerAccountInfo>
  storage: ServerAccountStorage
  /**
   * The last account this device was on, kept device-locally through key
   * changes and sign-outs: signing back in to it is a rejoin, not a new account
   * (docs/account-key-change.md, "Rejoining the same account").
   */
  lastAccount?: { get: () => string | null; set: (accountId: string) => void }
  now: () => number
  /** The account key was replaced or deleted (`changeKey` resolved). */
  onKeyChanged?: () => void
}

/**
 * The account as the Account screen shows it: `unavailable` while the server
 * has accounts off, `unverified` when this device couldn't prove it's
 * WitnessWork, `offline` while it can't be reached (with what this device last
 * knew).
 */
export type ServerAccountCheck =
  | { state: AccountStatus; accountId: string }
  | { state: 'unavailable'; accountId: null }
  | {
      state: 'unverified'
      problem: AttestationProblem
      accountId: string | null
    }
  | { state: 'updateRequired'; accountId: string | null }
  | {
      /**
       * `offline`: this device has no connection. `unreachable`: it has one,
       * but ww-api failed, refused or didn't answer in time.
       */
      state: 'offline' | 'unreachable'
      accountId: string | null
      lastStatus: AccountStatus | null
    }

/** With accounts off on the server, ask about once a day. */
export const ACCOUNTS_UNAVAILABLE_RETRY_MS = 24 * 60 * 60 * 1000

const isDisabled = (error: unknown) =>
  error instanceof HttpError && error.serverCode === 'disabled'

export function createServerAccount(deps: ServerAccountDeps) {
  const noteLastAccount = (accountId: string) => {
    if (deps.lastAccount && deps.lastAccount.get() !== accountId)
      deps.lastAccount.set(accountId)
  }
  // A device from before `lastAccount` was kept: its cached account is the
  // last one, read before anything can forget it.
  const cachedAtLaunch = deps.storage.get()?.accountId
  if (cachedAtLaunch && deps.lastAccount?.get() == null)
    noteLastAccount(cachedAtLaunch)

  const session = (
    key: AccountSigningKey,
    accountId: string
  ): ServerAccountSession => ({
    accountId,
    signInboxLink: (inboxId, ownerPub) =>
      signInboxLink(key, accountId, inboxId, ownerPub),
  })

  const remember = (
    key: AccountSigningKey,
    account: { accountId: string; status: AccountStatus }
  ) => {
    deps.storage.set({
      accountPub: key.publicKey,
      accountId: account.accountId,
      status: account.status,
    })
    noteLastAccount(account.accountId)
  }

  const markUnavailable = (key: AccountSigningKey) =>
    deps.storage.set({
      accountPub: key.publicKey,
      accountId: null,
      unavailableUntil: deps.now() + ACCOUNTS_UNAVAILABLE_RETRY_MS,
    })

  /** What this device remembers for this account key, without asking. */
  function cached(accountKey: Uint8Array): CachedServerAccount | null {
    const cachedAccount = deps.storage.get()
    return cachedAccount?.accountPub ===
      deriveAccountSigningKey(accountKey).publicKey
      ? cachedAccount
      : null
  }

  /**
   * The account for this account key, through its session: opened (attesting
   * this device, and creating the account the first time) when there's none.
   * Throws `AccountSessionError`: `unavailable` while accounts are off (asked
   * again after a day), `attestation`, `offline`, …. `retry` asks again right
   * away (the User tapped Try Again). `accountId` opens only into that account
   * (a rejoin, or resolving a key change), never creating one.
   */
  async function connect(
    accountKey: Uint8Array,
    call: { retry?: boolean; accountId?: string } = {}
  ): Promise<ServerAccountSession> {
    const key = deriveAccountSigningKey(accountKey)
    const known = cached(accountKey)
    if (
      !call.retry &&
      known &&
      !known.accountId &&
      (known.unavailableUntil ?? 0) > deps.now()
    )
      throw new AccountSessionError('unavailable', {
        serverCode: 'disabled',
      })
    try {
      const opened = await deps.sessions.ensure(accountKey, call)
      if (
        known?.accountId !== opened.accountId ||
        known.status !== opened.status
      )
        remember(key, opened)
      else noteLastAccount(opened.accountId)
      return session(key, opened.accountId)
    } catch (error) {
      if (isDisabled(error)) markUnavailable(key)
      throw toAccountSessionError(error)
    }
  }

  /**
   * The account, or null when there's none to be had (offline, accounts off, or
   * this device can't attest): features like Buddies then work without one, as
   * before accounts.
   */
  async function ensure(
    accountKey: Uint8Array
  ): Promise<ServerAccountSession | null> {
    try {
      return await connect(accountKey)
    } catch {
      return null
    }
  }

  /**
   * The server said the account's status outside `check` (a call refused as
   * `suspended`, or a session's own reading): kept.
   */
  function noteStatus(accountPub: string, status: AccountStatus) {
    const known = deps.storage.get()
    if (
      known?.accountPub !== accountPub ||
      !known.accountId ||
      known.status === status
    )
      return
    deps.storage.set({ ...known, status })
  }

  /** Forgets the account and its session here, without telling the server. */
  function forget() {
    deps.storage.set(null)
    deps.sessions.forget()
  }

  /**
   * Ends this device's session (`session/close`) and forgets the account here.
   * Never throws. Replacing or deleting the account key uses `changeKey`.
   */
  async function close(): Promise<void> {
    await deps.sessions.close().catch(() => undefined)
    deps.storage.set(null)
  }

  /**
   * Replaces or deletes the account key (`swap`) with no session in between:
   * ends the old key's session and forgets its account first, and opens none
   * until `swap` is done (`AccountSessions.changeKey`).
   */
  function changeKey<T>(
    swap: () => Promise<T>,
    keys?: { from?: Uint8Array | null; to?: Uint8Array | null }
  ): Promise<T> {
    return deps.sessions
      .changeKey(async () => {
        deps.storage.set(null)
        return swap()
      }, keys)
      .then((result) => {
        deps.onKeyChanged?.()
        return result
      })
  }

  /**
   * The account key changed on this device and the account kept it
   * (`account/rekey`): the cached account and this device's session move to
   * `toKey` with the same `accountId`, and nothing that keys on the account
   * starts over.
   */
  async function rekeyed(
    fromKey: Uint8Array,
    toKey: Uint8Array,
    {
      accountId,
      tokens,
    }: {
      accountId: string
      tokens?: RekeyedTokens
    }
  ): Promise<void> {
    const from = deriveAccountSigningKey(fromKey).publicKey
    const to = deriveAccountSigningKey(toKey).publicKey
    await deps.sessions.repoint?.(from, to, tokens)
    const known = deps.storage.get()
    deps.storage.set({
      accountPub: to,
      accountId,
      ...(known?.accountId === accountId &&
        known.status && { status: known.status }),
    })
    noteLastAccount(accountId)
  }

  /** The last account this device was on, if any. */
  const lastAccountId = (): string | null => deps.lastAccount?.get() ?? null

  function failedCheck(
    accountKey: Uint8Array,
    error: unknown
  ): ServerAccountCheck {
    const failure = toAccountSessionError(error)
    const known = cached(accountKey)
    if (failure.failure === 'unavailable')
      return { state: 'unavailable', accountId: null }
    if (failure.failure === 'attestation')
      return {
        state: 'unverified',
        problem: failure.attestation ?? 'failed',
        accountId: known?.accountId ?? null,
      }
    if (failure.failure === 'upgrade')
      return { state: 'updateRequired', accountId: known?.accountId ?? null }
    const noConnection =
      (failure.failure === 'offline' || failure.failure === 'cancelled') &&
      getOnline() !== true
    return {
      state: noConnection ? 'offline' : 'unreachable',
      accountId: known?.accountId ?? null,
      lastStatus: known?.status ?? null,
    }
  }

  /**
   * The account's current state: its session opened first when there's none
   * yet, then read back with `account/info` and kept.
   */
  async function check(
    accountKey: Uint8Array,
    call: { retry?: boolean } = {}
  ): Promise<ServerAccountCheck> {
    let account: ServerAccountSession
    try {
      account = await connect(accountKey, call)
    } catch (error) {
      return failedCheck(accountKey, error)
    }
    if (!deps.info) {
      const status = cached(accountKey)?.status ?? 'active'
      return { state: status, accountId: account.accountId }
    }
    const key = deriveAccountSigningKey(accountKey)
    try {
      const info = await deps.info(accountKey)
      remember(key, info)
      deps.sessions.noteStatus?.(key.publicKey, info.status)
      return { state: info.status, accountId: info.accountId }
    } catch (error) {
      if (isDisabled(error)) markUnavailable(key)
      return failedCheck(accountKey, error)
    }
  }

  return {
    connect,
    ensure,
    forget,
    close,
    changeKey,
    rekeyed,
    lastAccountId,
    cached,
    check,
    noteStatus,
  }
}

export type ServerAccount = ReturnType<typeof createServerAccount>
