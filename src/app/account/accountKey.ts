import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import { usePreferences } from '@/stores/preferences'
import { deviceAccountKey } from '@/lib/accountKey'
import { joinBuddiesHere } from '@/app/buddies/joinBuddiesHere'
import { analytics } from '@/lib/analytics'
import {
  type AccountKeyLoss,
  createAccountKeyService,
  type OpenedAccountSession,
  type ReplaceAccountKeyResult,
} from '@/lib/accountKey/accountKey'
import { accountSessions, serverAccount } from '@/lib/serverAccount'
import { signedInElsewhere } from '@/lib/serverAccount/accountDevices'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { leaveCloudSyncAccount } from '@/app/sync/cloudSync'
import { iCloudSync } from '@/app/sync/iCloudSync'

/**
 * This device's account key (ADR 0026), wired to the native store, the server
 * account and Buddies. In the app tier because replacing the key has to let go
 * of Buddies first: Delete Buddies on the account's last device, else signing
 * this one out of it.
 */
export const accountKey = createAccountKeyService({
  store: {
    peek: deviceAccountKey.peek,
    getOrCreate: deviceAccountKey.getOrCreate,
    replace: deviceAccountKey.replace,
  },
  account: {
    ensure: (key, call) =>
      call?.accountId
        ? serverAccount
            .connect(key, { accountId: call.accountId })
            .catch(() => null)
        : serverAccount.ensure(key),
    changeKey: serverAccount.changeKey,
    lastAccountId: serverAccount.lastAccountId,
    rekeyed: serverAccount.rekeyed,
    openDetached: (key, call) => accountSessions.openDetached(key, call),
    signedInElsewhere: async () => {
      const key = await accountKey.peek()
      if (!key) throw new Error('No account key on this device')
      return signedInElsewhere(key)
    },
  },
  buddies: {
    loss: (): Omit<AccountKeyLoss, 'keptElsewhere'> => {
      const { buddies, registeredInboxId, pendingRemovals } =
        useBuddies.getState()
      return {
        buddies: buddies.length,
        buddyNames: buddies.map(buddyDisplayName),
        // Removals still owed to former buddies need the old key too.
        inboxRegistered:
          registeredInboxId !== null || pendingRemovals.length > 0,
      }
    },
    release: (scope) =>
      scope === 'device'
        ? buddiesEngine.leaveThisDevice()
        : buddiesEngine.deleteEverything(),
    forget: () => buddiesEngine.dropIdentity(),
  },
  sync: {
    leave: () =>
      leaveCloudSyncAccount(async () => {
        iCloudSync.resetPushBackoff()
        if (usePreferences.getState().iCloudSyncPendingPush)
          await iCloudSync.push('leave-account')
        // Nothing may start against the old account from here.
        usePreferences.setState({ iCloudSyncEnabled: false })
        await iCloudSync.waitForSyncIdle()
      }),
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
    session,
    accountId,
  }: {
    source: AccountKeyReplaceSource
    confirmedLoss?: boolean
    session?: OpenedAccountSession
    /** The new key's account, when known: the same one is a rejoin. */
    accountId?: string
  }
): Promise<ReplaceAccountKeyResult> {
  const result = await accountKey.replace(newKey, {
    confirmedLoss,
    session,
    accountId,
  })
  if (result.outcome === 'replaced') {
    analytics.capture('account_key_replaced', {
      source,
      buddies_removed: result.loss.buddies,
      had_inbox: result.loss.inboxRegistered,
      buddies_kept_elsewhere: result.loss.keptElsewhere,
      registered: result.accountId !== null,
      same_account: result.sameAccount,
    })
    if (source !== 'handoff') void joinBuddiesHere().catch(() => undefined)
  }
  return result
}
