import { fromB64u } from '@/lib/bytes'
import {
  isCommitted,
  type KeyChangeRecord,
} from '@/lib/accountKey/keyChangeRecord'
import { accountPubOf } from '@/lib/serverAccount/keys'
import type { ResumeResult } from './engine'

/**
 * What this device does when the server refuses its key as retired
 * (docs/account-key-change.md, "Other devices"):
 *
 * 1. A change this device was making decides first: committed, the retired key is
 *    its own old one; not committed, another device won, and its new key is
 *    discarded.
 * 2. When the stored key is already another, unretired one (iCloud Keychain
 *    brought the new key to an Apple device), it rejoins with it, into the same
 *    account.
 * 3. Otherwise it's signed out: the key is ignored from now on (and deleted where
 *    only this device holds it), Cloud Sync, backup and Buddies wait, and local
 *    data stays.
 *
 * Only for a key this device holds: its change's old key, its stored key, or
 * its account's. Any other (a recovery key typed in, refused before it's used)
 * is the caller's to say, and leaves this device as it is.
 */
export type KeyRetiredDeps = {
  record: () => Promise<KeyChangeRecord | null>
  resume: () => Promise<ResumeResult>
  discard: () => Promise<void>
  lastAccountId: () => string | null
  /** The platform store's key, as stored (b64u), ignoring retired keys. */
  storedKey: () => Promise<string | null>
  isRetired: (accountPub: string) => boolean
  /** Opens this device's session with `key`, only into `accountId`. */
  connect: (key: Uint8Array, accountId: string) => Promise<void>
  forgetRetired: (accountPub: string) => Promise<void>
  signOut: (accountId: string | null, changedAt: number | null) => void
  /** The public key of the account this device holds, if any. */
  accountPub: () => string | null
}

export type KeyRetiredOutcome =
  | 'ownChange'
  /** This device's own change can't be resolved yet: asked again later. */
  | 'unresolved'
  | 'rejoined'
  | 'signedOut'
  /** Not a key this device holds. */
  | 'ignored'

export function createKeyRetiredHandler(deps: KeyRetiredDeps) {
  return async function handleKeyRetired(
    accountPub: string,
    changedAt: number | null
  ): Promise<KeyRetiredOutcome> {
    // Unreadable, it throws: nothing is signed out or deleted on a guess.
    const record = await deps.record()
    const ownChange =
      record !== null && accountPubOf(fromB64u(record.oldKey)) === accountPub
    const stored = await deps.storedKey().catch(() => null)
    if (
      !ownChange &&
      deps.accountPub() !== accountPub &&
      (!stored || accountPubOf(fromB64u(stored)) !== accountPub)
    )
      return 'ignored'
    if (record && ownChange) {
      if (isCommitted(record)) return 'ownChange'
      if (record.stage === 'confirmed') {
        const resumed = await deps.resume()
        if (resumed.state === 'done') return 'ownChange'
        // Its K2 may be the account's: nothing is signed out or deleted
        // until the next launch or foreground can tell.
        if (resumed.state === 'unresolved' || resumed.state === 'awaiting')
          return 'unresolved'
      } else {
        await deps.discard().catch(() => undefined)
      }
    }
    const lastAccountId = deps.lastAccountId()
    // Only ever into the account this device knew: never a new one.
    if (stored && lastAccountId) {
      const key = fromB64u(stored)
      const pub = accountPubOf(key)
      if (pub !== accountPub && !deps.isRetired(pub)) {
        try {
          await deps.connect(key, lastAccountId)
          return 'rejoined'
        } catch {
          // Not the account's key either: signed out below.
        }
      }
    }
    await deps.forgetRetired(accountPub)
    deps.signOut(lastAccountId, changedAt)
    return 'signedOut'
  }
}
