import { logger } from '@/lib/logger'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesSyncNotice } from '@/features/buddies/lib/syncStatus'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'

/**
 * How Buddies' syncs are going, for the Buddies screen: why the latest one
 * failed, whether one is running, and whether the first one after starting
 * Buddies is still on its way.
 */
export default function useBuddiesSyncStatus() {
  const hasInbox = useBuddies((state) => state.registeredInboxId !== null)
  const lastSyncAt = useBuddies((state) => state.lastSyncAt)
  const syncing = useBuddiesSession((state) => state.syncing > 0)
  const failure = useBuddiesSession((state) => state.failure)
  const relayDisabled = useBuddiesSession((state) => state.relayDisabled)

  return {
    notice: hasInbox
      ? buddiesSyncNotice({ failure, relayDisabled }, lastSyncAt)
      : null,
    syncing,
    firstLoad: hasInbox && lastSyncAt === 0 && syncing,
    retry: () => {
      void buddiesEngine
        .sync()
        .catch((error) => logger.warn('[buddies] retry sync', error))
    },
  }
}
