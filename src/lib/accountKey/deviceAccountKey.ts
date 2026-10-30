import { fromB64u } from '@/lib/bytes'
import {
  isCommitted,
  type KeyChangeRecord,
} from '@/lib/accountKey/keyChangeRecord'
import { accountPubOf } from '@/lib/serverAccount/keys'

/**
 * This device's account key as every feature reads it (ADR 0039 §4, §7): the
 * platform store's key (iCloud Keychain, or the Keystore with Block Store),
 * except that
 *
 * - A key change that committed on the server wins: from `committed` on, the
 *   change record's new key is the device's key, even before the store holds
 *   it, so no session ever opens with the old one;
 * - A key the server retired (changed on another device) reads as none, and no
 *   new key is made in its place, which would start a new account.
 *
 * Keys are base64url text, as the native module takes them.
 */

export type DeviceAccountKeyDeps = {
  native: {
    peek: () => Promise<string | null>
    getOrCreate: () => Promise<string>
    replace: (key: string) => Promise<void>
    remove: () => Promise<void>
  }
  /** The change record, if a key change is under way on this device. */
  record: () => Promise<KeyChangeRecord | null>
  /** Public keys the server retired, kept on this device. */
  retired: {
    has: (accountPub: string) => boolean
    add: (accountPub: string) => void
    delete: (accountPub: string) => void
  }
  /**
   * The store is shared with the User's other devices (iOS: a synchronizable
   * iCloud Keychain item). Deleting from it there would delete the new key on
   * the device that changed it, so a retired key is only ignored.
   */
  sharedStore: boolean
  /** Signed out after a change elsewhere: no new key until the User signs in. */
  signedOut: () => boolean
}

/**
 * No account key here: the key changed elsewhere, and this device must sign in
 * again.
 */
export class AccountKeySignedOutError extends Error {
  constructor() {
    super('The account key changed on another device')
    this.name = 'AccountKeySignedOutError'
  }
}

export function createDeviceAccountKey(deps: DeviceAccountKeyDeps) {
  let derived: { key: string; pub: string } | null = null
  const pubOf = (key: string) => {
    if (derived?.key !== key)
      derived = {
        key,
        pub: accountPubOf(fromB64u(key)),
      }
    return derived.pub
  }

  /**
   * The new key of a change that committed. A record that can't be read throws:
   * the stored key may be K1, which must never open a session then.
   */
  const committedKey = async () => {
    const record = await deps.record()
    return record && isCommitted(record) ? record.newKey : null
  }

  /** The stored key, or null; `retired` when it's a retired one. */
  const stored = async () => {
    const key = await deps.native.peek()
    if (!key) return { key: null, retired: false }
    return deps.retired.has(pubOf(key))
      ? { key: null, retired: true }
      : { key, retired: false }
  }

  return {
    /** The key, or null when there's none (or only a retired one). */
    async peek(): Promise<string | null> {
      return (await committedKey()) ?? (await stored()).key
    },

    /**
     * The key, created when this device has none. Throws
     * `AccountKeySignedOutError` instead of creating one while it holds a
     * retired key or is signed out after a change elsewhere.
     */
    async getOrCreate(): Promise<string> {
      const committed = await committedKey()
      if (committed) return committed
      const current = await stored()
      if (current.key) return current.key
      if (current.retired || deps.signedOut())
        throw new AccountKeySignedOutError()
      return deps.native.getOrCreate()
    },

    /** Stores `key` as the account key; it's never read as retired after. */
    async replace(key: string): Promise<void> {
      await deps.native.replace(key)
      deps.retired.delete(pubOf(key))
    },

    /**
     * The server retired `accountPub` (`key_retired`): it's never this device's
     * key again. Deleted from a store this device holds alone, and only while
     * it's still that key; never from a shared one.
     */
    async forgetRetired(accountPub: string): Promise<void> {
      deps.retired.add(accountPub)
      if (deps.sharedStore) return
      const key = await deps.native.peek()
      if (key && pubOf(key) === accountPub) await deps.native.remove()
    },

    isRetired: (accountPub: string) => deps.retired.has(accountPub),
  }
}

export type DeviceAccountKey = ReturnType<typeof createDeviceAccountKey>
