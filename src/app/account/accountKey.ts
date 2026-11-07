import { endPhotoPasses } from '@/lib/syncTransport/photoEpoch'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import { usePreferences } from '@/stores/preferences'
import { deviceAccountKey, keyChangeRecords } from '@/lib/accountKey'
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
import { holdCloudSyncDefault } from '@/app/sync/cloudSyncDefaultHold'

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
  keyChangeUnfinished: async () => (await keyChangeRecords.read()) !== null,
  sync: {
    leave: () =>
      leaveCloudSyncAccount(async () => {
        iCloudSync.resetPushBackoff()
        if (usePreferences.getState().iCloudSyncPendingPush)
          await iCloudSync.push('leave-account')

        usePreferences.setState({ iCloudSyncEnabled: false })
        endPhotoPasses()
        await iCloudSync.waitForSyncIdle()
      }),
  },
})

export const accountKeyAvailable = () => BuddiesKeychain.isAvailable()
export const accountKeyReplaceable = () => BuddiesKeychain.isReplaceAvailable()

export type AccountKeyReplaceSource =
  | 'recovery_key'
  | 'handoff'
  | 'passkey'
  | 'tools'

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

    accountId?: string
  }
): Promise<ReplaceAccountKeyResult> {
  if (!accountKeyReplaceable())
    throw new Error('This device can’t replace its account key')
  const result = await holdCloudSyncDefault(() =>
    accountKey.replace(newKey, { confirmedLoss, session, accountId })
  )
  if (result.outcome === 'replaced') {
    analytics.capture('account_key_replaced', {
      source,
      buddies_removed: result.loss.buddies,
      had_inbox: result.loss.inboxRegistered,
      buddies_kept_elsewhere: result.loss.keptElsewhere,
      registered: result.accountId !== null,
      same_account: result.sameAccount,
    })
    if (source !== 'handoff' && source !== 'passkey')
      void joinBuddiesHere().catch(() => undefined)
  }
  return result
}
