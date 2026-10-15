import { HttpError } from '@/lib/http/request'
import type {
  AccountStatus,
  RegisteredAccount,
  ServerAccountInfo,
} from '@/lib/serverAccount/client'
import {
  type AccountSigningKey,
  deriveAccountSigningKey,
  signInboxLink,
} from '@/lib/serverAccount/keys'

/**
 * The server account (ADR 0024): an anonymous account the server owns, so it
 * can suspend someone for abuse, and later move their data between iOS and
 * Android. Not ADR 0011's account id, which is the RevenueCat identity.
 *
 * The account key is the User's one secret (today the Buddies root seed); the
 * server knows the account by a random id and the public half of a key derived
 * from it. The id is kept on this device only, with the public key it belongs
 * to, so a different account key registers again.
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
  register: (key: AccountSigningKey) => Promise<RegisteredAccount>
  /** `account/info`: the account as the server holds it, never creating one. */
  info?: (key: AccountSigningKey) => Promise<ServerAccountInfo>
  storage: ServerAccountStorage
  now: () => number
}

/**
 * The account as the Account screen shows it: `unavailable` while the server
 * has accounts off, `offline` while it can't be reached (with what this device
 * last knew).
 */
export type ServerAccountCheck =
  | { state: AccountStatus; accountId: string }
  | { state: 'unavailable'; accountId: null }
  | {
      state: 'offline'
      accountId: string | null
      lastStatus: AccountStatus | null
    }

/** With accounts off on the server, ask about once a day. */
export const ACCOUNTS_UNAVAILABLE_RETRY_MS = 24 * 60 * 60 * 1000

export function createServerAccount(deps: ServerAccountDeps) {
  const registering = new Map<string, Promise<string | null>>()

  const session = (
    key: AccountSigningKey,
    accountId: string
  ): ServerAccountSession => ({
    accountId,
    signInboxLink: (inboxId, ownerPub) =>
      signInboxLink(key, accountId, inboxId, ownerPub),
  })

  async function register(key: AccountSigningKey): Promise<string | null> {
    try {
      const { accountId, status } = await deps.register(key)
      deps.storage.set({ accountPub: key.publicKey, accountId, status })
      return accountId
    } catch (error) {
      if (error instanceof HttpError && error.serverCode === 'disabled')
        deps.storage.set({
          accountPub: key.publicKey,
          accountId: null,
          unavailableUntil: deps.now() + ACCOUNTS_UNAVAILABLE_RETRY_MS,
        })
      // Anything else (offline, say) is tried again next time.
      return null
    }
  }

  /**
   * The account for this account key, registered on first use. Null while the
   * server can't be reached or has accounts off: features then work without
   * one, as before accounts.
   */
  async function ensure(
    accountKey: Uint8Array
  ): Promise<ServerAccountSession | null> {
    const key = deriveAccountSigningKey(accountKey)
    const cached = deps.storage.get()
    if (cached?.accountPub === key.publicKey) {
      if (cached.accountId) return session(key, cached.accountId)
      if ((cached.unavailableUntil ?? 0) > deps.now()) return null
    }
    let pending = registering.get(key.publicKey)
    if (!pending) {
      pending = register(key).finally(() => registering.delete(key.publicKey))
      registering.set(key.publicKey, pending)
    }
    const accountId = await pending
    return accountId ? session(key, accountId) : null
  }

  /** The server doesn't know the remembered account: register again next time. */
  function forget() {
    deps.storage.set(null)
  }

  /** What this device remembers for this account key, without asking. */
  function cached(accountKey: Uint8Array): CachedServerAccount | null {
    const cachedAccount = deps.storage.get()
    return cachedAccount?.accountPub ===
      deriveAccountSigningKey(accountKey).publicKey
      ? cachedAccount
      : null
  }

  /**
   * The account's current state: registered first when there's none yet, then
   * read back with `account/info` and kept. An account the server no longer
   * knows registers again.
   */
  async function check(accountKey: Uint8Array): Promise<ServerAccountCheck> {
    const offline = (): ServerAccountCheck => {
      const known = cached(accountKey)
      if (
        known &&
        !known.accountId &&
        (known.unavailableUntil ?? 0) > deps.now()
      )
        return { state: 'unavailable', accountId: null }
      return {
        state: 'offline',
        accountId: known?.accountId ?? null,
        lastStatus: known?.status ?? null,
      }
    }
    let account = await ensure(accountKey)
    if (!account) return offline()
    if (!deps.info) {
      const status = cached(accountKey)?.status ?? 'active'
      return { state: status, accountId: account.accountId }
    }
    const key = deriveAccountSigningKey(accountKey)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const info = await deps.info(key)
        deps.storage.set({
          accountPub: key.publicKey,
          accountId: info.accountId,
          status: info.status,
        })
        return { state: info.status, accountId: info.accountId }
      } catch (error) {
        if (!(error instanceof HttpError)) throw error
        if (error.serverCode === 'disabled') {
          deps.storage.set({
            accountPub: key.publicKey,
            accountId: null,
            unavailableUntil: deps.now() + ACCOUNTS_UNAVAILABLE_RETRY_MS,
          })
          return { state: 'unavailable', accountId: null }
        }
        if (error.serverCode !== 'unknown_account' || attempt > 0)
          return offline()
        forget()
        account = await ensure(accountKey)
        if (!account) return offline()
      }
    }
    return offline()
  }

  return { ensure, forget, cached, check }
}

export type ServerAccount = ReturnType<typeof createServerAccount>
