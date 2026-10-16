import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import { joinBuddiesHere } from '@/app/buddies/joinBuddiesHere'
import { analytics } from '@/lib/analytics'
import {
  type AccountKeyLoss,
  createAccountKeyService,
  type ReplaceAccountKeyResult,
} from '@/lib/accountKey/accountKey'
import { serverAccount } from '@/lib/serverAccount'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * This device's account key (ADR 0026), wired to the native store, the server
 * account and Buddies. In the app tier because replacing the key has to run
 * Delete Buddies first.
 */
export const accountKey = createAccountKeyService({
  store: {
    peek: BuddiesKeychain.peekRootSeed,
    getOrCreate: BuddiesKeychain.getOrCreateRootSeed,
    replace: BuddiesKeychain.replaceRootSeed,
  },
  account: serverAccount,
  buddies: {
    loss: (): AccountKeyLoss => {
      const { buddies, registeredInboxId, pendingRemovals } =
        useBuddies.getState()
      return {
        buddies: buddies.length,
        // Removals still owed to former buddies need the old key too.
        inboxRegistered:
          registeredInboxId !== null || pendingRemovals.length > 0,
      }
    },
    release: () => buddiesEngine.deleteEverything(),
    forget: () => buddiesEngine.dropIdentity(),
  },
})

/** Whether this binary can store an account key, and replace it. */
export const accountKeyAvailable = () => BuddiesKeychain.isAvailable()
export const accountKeyReplaceable = () => BuddiesKeychain.isReplaceAvailable()

export type AccountKeyReplaceSource = 'recovery_key' | 'handoff' | 'tools'

/**
 * Replaces the account key (see `AccountKeyService.replace`), records it, and
 * then lets Buddies start here when the new key already has it elsewhere. A
 * handoff starts Buddies itself once the old phone knows it's done.
 */
export async function replaceAccountKey(
  newKey: Uint8Array,
  {
    source,
    confirmedLoss = false,
  }: { source: AccountKeyReplaceSource; confirmedLoss?: boolean }
): Promise<ReplaceAccountKeyResult> {
  const result = await accountKey.replace(newKey, { confirmedLoss })
  if (result.outcome === 'replaced') {
    analytics.capture('account_key_replaced', {
      source,
      buddies_removed: result.loss.buddies,
      had_inbox: result.loss.inboxRegistered,
      registered: result.accountId !== null,
    })
    if (source !== 'handoff') void joinBuddiesHere().catch(() => undefined)
  }
  return result
}
