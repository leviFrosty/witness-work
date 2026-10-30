import { fromB64u, toB64u } from '@/lib/bytes'
import type { RekeyedTokens } from '@/lib/serverAccount/session'

export type { RekeyedTokens }

/**
 * The account key (ADR 0026): the User's one secret, 32 random bytes that every
 * account feature derives its keys from. Today it's the Buddies root seed, kept
 * in iCloud Keychain on iOS and sealed under the Keystore with a Block Store
 * backup on Android. It's created the first time any account feature needs it,
 * and can be replaced by one the User brings from another device (a recovery
 * key).
 */

/** Where the key is kept: base64url text, as the native module takes it. */
export type AccountKeyStore = {
  /** Null when there's none yet. */
  peek: () => Promise<string | null>
  getOrCreate: () => Promise<string>
  replace: (key: string) => Promise<void>
}

/** What replacing the key takes from this device. */
export type AccountKeyLoss = {
  /**
   * Buddies on this device, who are removed from it. Unless `keptElsewhere`,
   * they're removed for good (and leave this User's inbox).
   */
  buddies: number
  /** Their names as this User sees them, for the warning to name them. */
  buddyNames: string[]
  /**
   * The Buddies inbox registered for the current key: deleted, unless
   * `keptElsewhere`.
   */
  inboxRegistered: boolean
  /**
   * Other devices are still signed in to the current account, so its buddies
   * and inbox stay for them: only this device signs out of Buddies.
   */
  keptElsewhere: boolean
}

export const NO_LOSS: AccountKeyLoss = {
  buddies: 0,
  buddyNames: [],
  inboxRegistered: false,
  keptElsewhere: false,
}

export const losesSomething = (loss: AccountKeyLoss) =>
  loss.buddies > 0 || loss.inboxRegistered

export type AccountKeyServiceDeps = {
  store: AccountKeyStore
  /**
   * The server account (`serverAccount`). `changeKey` ends the old key's
   * session and forgets its account, then runs the swap while no session can
   * open, so none is ever opened for the old key in between.
   */
  account: {
    ensure: (
      accountKey: Uint8Array,
      call?: { accountId?: string }
    ) => Promise<{ accountId: string } | null>
    changeKey: (
      swap: () => Promise<void>,
      keys: { from: Uint8Array | null; to: Uint8Array }
    ) => Promise<void>
    /**
     * Whether another device holds a live session for the current account (`GET
     * /accounts/v1/sessions`). Throws when that can't be read: nothing is
     * deleted on a guess.
     */
    signedInElsewhere: () => Promise<boolean>
    /**
     * The account this device was last on (`serverAccount.lastAccountId`): a
     * key for it is a rejoin, not another account.
     */
    lastAccountId?: () => string | null
    /**
     * The account kept this device's session through a key change made here
     * (`serverAccount.rekeyed`): the cached account and session move to the new
     * key.
     */
    rekeyed?: (
      from: Uint8Array,
      to: Uint8Array,
      call: { accountId: string; tokens?: RekeyedTokens }
    ) => Promise<void>
    /**
     * Opens a session for a key that isn't this device's yet, only into
     * `accountId` (`AccountSessions.openDetached`). Throws when the key isn't
     * that account's current one.
     */
    openDetached?: (
      accountKey: Uint8Array,
      call: { accountId: string }
    ) => Promise<SameAccountSession>
  }
  /**
   * Buddies, whose identity derives from the key. Before the key changes,
   * `release` lets go of it: `device` signs this device out of Buddies and
   * leaves the inbox and buddies to the account's other devices; `account`
   * (Delete Buddies, for its last device) leaves every buddy and deletes the
   * inbox, so no one is left with a buddy whose key is gone. Afterwards
   * `forget` drops the identity it cached from the old key.
   */
  buddies: {
    loss: () => Omit<AccountKeyLoss, 'keptElsewhere'>
    release: (scope: 'device' | 'account') => Promise<void>
    forget: () => void
  }
  /**
   * Cloud Sync (ADR 0030 §7): before the key changes, this device sends its
   * last edits, deletes only its own slot, and stops, so the account's other
   * devices keep everything. Bounded, and never throws.
   */
  sync?: { leave: () => Promise<void> }
}

/**
 * A session already opened for the new key (a handoff's new phone checks the
 * account with one): kept once the key is stored, instead of opening another.
 */
export type OpenedAccountSession = { adopt: () => Promise<void> }

/** A session opened for a key into the account this device was on. */
export type SameAccountSession = OpenedAccountSession & {
  accountId: string
  close: () => Promise<void>
}

export type ReplaceAccountKeyResult =
  | { outcome: 'unchanged' }
  | {
      outcome: 'replaced'
      loss: AccountKeyLoss
      /** Null while the server can't be reached or has accounts off. */
      accountId: string | null
      /**
       * The key is the account this device was last on (its key changed
       * elsewhere): nothing was left or released.
       */
      sameAccount: boolean
    }

/**
 * Replacing the key would take something from this device, and the caller
 * didn't confirm it: show the User `loss`, then call again with
 * `confirmedLoss`.
 */
export class AccountKeyLossError extends Error {
  constructor(readonly loss: AccountKeyLoss) {
    super('Replacing the account key would delete Buddies data')
    this.name = 'AccountKeyLossError'
  }
}

const KEY_BYTES = 32

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i])

export function createAccountKeyService(deps: AccountKeyServiceDeps) {
  let replacing: Promise<ReplaceAccountKeyResult> | null = null

  /** The key, or null when this device has none yet. */
  async function peek(): Promise<Uint8Array | null> {
    const key = await deps.store.peek()
    return key ? fromB64u(key) : null
  }

  /** The key, created (32 random bytes) when there's none. */
  async function getOrCreate(): Promise<Uint8Array> {
    return fromB64u(await deps.store.getOrCreate())
  }

  /** `accountId` is the account this device was last on. */
  const isSameAccount = (accountId: string | undefined) =>
    accountId !== undefined &&
    accountId === (deps.account.lastAccountId?.() ?? null)

  /**
   * What replacing the key with `newKey` would take from this device: nothing
   * when it's the same key, when there's no key yet, or when `accountId` (the
   * new key's account, when known) is the account this device was on.
   */
  async function lossIfReplaced(
    newKey?: Uint8Array,
    { accountId }: { accountId?: string } = {}
  ): Promise<AccountKeyLoss> {
    if (isSameAccount(accountId)) return NO_LOSS
    const current = await peek()
    if (!current || (newKey && sameBytes(current, newKey))) return NO_LOSS
    return currentLoss()
  }

  /** Throws while the account's other devices can't be checked. */
  async function currentLoss(): Promise<AccountKeyLoss> {
    const loss = { ...deps.buddies.loss(), keptElsewhere: false }
    if (!losesSomething(loss)) return loss
    return { ...loss, keptElsewhere: await deps.account.signedInElsewhere() }
  }

  /**
   * The same account under a new key (docs/account-key-change.md, "Rejoining
   * the same account"): no Buddies loss to confirm or release, and no Cloud
   * Sync leave, so its bookkeeping and the backup slot carry on. Buddies drops
   * the old key's identity, and resets its local data on its next sync.
   */
  async function rejoin(
    current: Uint8Array | null,
    newKey: Uint8Array,
    accountId: string,
    session: OpenedAccountSession | undefined
  ): Promise<ReplaceAccountKeyResult> {
    await deps.account.changeKey(
      async () => {
        await deps.store.replace(toB64u(newKey))
        deps.buddies.forget()
        await session?.adopt()
      },
      { from: current, to: newKey }
    )
    const account = await deps.account
      .ensure(newKey, { accountId })
      .catch(() => null)
    return {
      outcome: 'replaced',
      loss: NO_LOSS,
      accountId: account?.accountId ?? null,
      sameAccount: true,
    }
  }

  async function run(
    newKey: Uint8Array,
    confirmedLoss: boolean,
    session: OpenedAccountSession | undefined,
    accountId: string | undefined
  ): Promise<ReplaceAccountKeyResult> {
    const current = await peek()
    if (current && sameBytes(current, newKey)) return { outcome: 'unchanged' }
    if (isSameAccount(accountId))
      return rejoin(current, newKey, accountId!, session)
    // Read again: Buddies is deleted for good only when this is still the
    // account's last device.
    const loss = current ? await currentLoss() : NO_LOSS
    if (losesSomething(loss)) {
      if (!confirmedLoss) throw new AccountKeyLossError(loss)
      // Throws, changing nothing more, while a buddy can't be left yet.
      await deps.buddies.release(loss.keptElsewhere ? 'device' : 'account')
    }
    // Cloud Sync leaves the old account while its session still works.
    if (current) await deps.sync?.leave().catch(() => undefined)
    // The old key's session ends before the new key is stored, and the new
    // one (or `session`) is the next to open.
    await deps.account.changeKey(
      async () => {
        await deps.store.replace(toB64u(newKey))
        deps.buddies.forget()
        await session?.adopt()
      },
      { from: current, to: newKey }
    )
    const account = await deps.account.ensure(newKey).catch(() => null)
    return {
      outcome: 'replaced',
      loss,
      accountId: account?.accountId ?? null,
      sameAccount: false,
    }
  }

  /**
   * Makes `newKey` this device's account key. The same key changes nothing.
   * Otherwise, when this device's Buddies has buddies or an inbox, it needs
   * `confirmedLoss` (else `AccountKeyLossError`) and lets go of Buddies first:
   * on the account's last device it runs Delete Buddies, which tells the
   * buddies; while other devices are signed in, only this one signs out. Then
   * it ends the old key's session, stores the key, forgets the old Buddies
   * identity, and adopts `session` (with no session opened for either key in
   * between), and opens the new account's session if it has none. One at a
   * time. `accountId`, the new key's account when the caller knows it (a
   * handoff's), makes it a rejoin when it's the account this device was on:
   * nothing is lost, released or left.
   */
  function replace(
    newKey: Uint8Array,
    {
      confirmedLoss = false,
      session,
      accountId,
    }: {
      confirmedLoss?: boolean
      session?: OpenedAccountSession
      accountId?: string
    } = {}
  ): Promise<ReplaceAccountKeyResult> {
    if (newKey.length !== KEY_BYTES)
      return Promise.reject(new Error('Account key must be 32 bytes'))
    const previous = replacing ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(() => run(newKey, confirmedLoss, session, accountId))
    replacing = next
    void next
      .catch(() => undefined)
      .finally(() => {
        if (replacing === next) replacing = null
      })
    return next
  }

  /**
   * When `newKey` (a recovery key, a passkey's) is the current key of the
   * account this device was on, a session for it, opened into that account:
   * replacing with it and this session is a rejoin. Null for another account's
   * key, or when this device was never on one; never creates an account.
   */
  async function sameAccountSession(
    newKey: Uint8Array
  ): Promise<SameAccountSession | null> {
    const accountId = deps.account.lastAccountId?.() ?? null
    if (!accountId || !deps.account.openDetached) return null
    try {
      return await deps.account.openDetached(newKey, { accountId })
    } catch {
      return null
    }
  }

  /**
   * Step 4 of a key change made on this device (docs/account-key-change.md):
   * the account moved to `newKey` and kept this device's session, so the
   * session and cached account move with it (`rekeyed`), then the key is
   * stored, and Buddies drops the old key's identity. Nothing is left or
   * released. Throws when the store refuses it; running it again is safe.
   */
  async function adoptChangedKey(
    oldKey: Uint8Array,
    newKey: Uint8Array,
    call: { accountId: string; tokens?: RekeyedTokens }
  ): Promise<void> {
    if (newKey.length !== KEY_BYTES)
      throw new Error('Account key must be 32 bytes')
    if (!deps.account.rekeyed) throw new Error('Key changes need rekeyed')
    await deps.account.rekeyed(oldKey, newKey, call)
    // Always written: what this device reads (`peek`) is already the new key
    // once the change committed, whatever the platform store holds.
    await deps.store.replace(toB64u(newKey))
    deps.buddies.forget()
  }

  return {
    peek,
    getOrCreate,
    lossIfReplaced,
    replace,
    adoptChangedKey,
    sameAccountSession,
  }
}

export type AccountKeyService = ReturnType<typeof createAccountKeyService>
