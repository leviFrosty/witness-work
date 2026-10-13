import { HttpError } from '@/lib/http/request'
import type { RegisteredAccount } from '@/lib/serverAccount/client'
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
  storage: ServerAccountStorage
  now: () => number
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
      const { accountId } = await deps.register(key)
      deps.storage.set({ accountPub: key.publicKey, accountId })
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

  return { ensure, forget }
}

export type ServerAccount = ReturnType<typeof createServerAccount>
