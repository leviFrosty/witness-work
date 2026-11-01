import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import { usePreferences } from '@/stores/preferences'
import { joinBuddiesHere } from '@/app/buddies/joinBuddiesHere'
import { analytics } from '@/lib/analytics'
import {
  type AccountKeyLoss,
  createAccountKeyService,
  type OpenedAccountSession,
  type ReplaceAccountKeyResult,
} from '@/lib/accountKey/accountKey'
import { serverAccount } from '@/lib/serverAccount'
import { signedInElsewhere } from '@/lib/serverAccount/accountDevices'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { leaveCloudSyncAccount } from '@/app/sync/cloudSync'
import { iCloudSync } from '@/app/sync/iCloudSync'

export const accountKey = createAccountKeyService({
  store: {
    peek: BuddiesKeychain.peekRootSeed,
    getOrCreate: BuddiesKeychain.getOrCreateRootSeed,
    replace: BuddiesKeychain.replaceRootSeed,
  },
  account: {
    ensure: serverAccount.ensure,
    changeKey: serverAccount.changeKey,
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

        usePreferences.setState({ iCloudSyncEnabled: false })
        await iCloudSync.waitForSyncIdle()
      }),
  },
})

export const accountKeyAvailable = () => BuddiesKeychain.isAvailable()
export const accountKeyReplaceable = () => BuddiesKeychain.isReplaceAvailable()

export type AccountKeyReplaceSource = 'recovery_key' | 'handoff' | 'tools'

export async function replaceAccountKey(
  newKey: Uint8Array,
  {
    source,
    confirmedLoss = false,
    session,
  }: {
    source: AccountKeyReplaceSource
    confirmedLoss?: boolean
    session?: OpenedAccountSession
  }
): Promise<ReplaceAccountKeyResult> {
  const result = await accountKey.replace(newKey, { confirmedLoss, session })
  if (result.outcome === 'replaced') {
    analytics.capture('account_key_replaced', {
      source,
      buddies_removed: result.loss.buddies,
      had_inbox: result.loss.inboxRegistered,
      buddies_kept_elsewhere: result.loss.keptElsewhere,
      registered: result.accountId !== null,
    })
    if (source !== 'handoff') void joinBuddiesHere().catch(() => undefined)
  }
  return result
}
