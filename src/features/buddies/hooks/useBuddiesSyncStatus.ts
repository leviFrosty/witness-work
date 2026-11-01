import { logger } from '@/lib/logger'
import { accountSessions } from '@/lib/serverAccount'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesSyncNotice } from '@/features/buddies/lib/syncStatus'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'

export default function useBuddiesSyncStatus() {
  const hasInbox = useBuddies((state) => state.registeredInboxId !== null)
  const lastSyncAt = useBuddies((state) => state.lastSyncAt)
  const syncing = useBuddiesSession((state) => state.syncing > 0)
  const failure = useBuddiesSession((state) => state.failure)
  const relayDisabled = useBuddiesSession((state) => state.relayDisabled)

  const notice = hasInbox
    ? buddiesSyncNotice({ failure, relayDisabled }, lastSyncAt)
    : null

  return {
    notice,
    syncing,
    firstLoad: hasInbox && lastSyncAt === 0 && syncing,
    retry: async () => {
      if (notice === 'unverified' || notice === 'verifyLater')
        await accountSessions
          .ensure(undefined, { retry: true })
          .catch(() => undefined)
      await buddiesEngine
        .sync()
        .catch((error) => logger.warn('[buddies] retry sync', error))
    },
  }
}
