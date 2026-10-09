import { useEffect } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { logger } from '@/lib/logger'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { startFallbackPoll, syncSoon } from '@/features/buddies/lib/autoSync'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const warn = (error: unknown) => logger.warn('[buddies] live sync', error)

/**
 * Keeps the visible Buddies list current: syncs when the screen gains focus
 * (within the shared floor; returning to the app is BuddiesRuntime's), and
 * polls while it's open only when the live connection is down. Does nothing
 * before Buddies has started.
 */
export default function useLiveBuddiesSync() {
  const focused = useIsFocused()
  const hasInbox = useBuddies((state) => state.registeredInboxId !== null)
  const live = focused && hasInbox

  useEffect(() => {
    if (!live) return
    void syncSoon().catch(warn)
    return startFallbackPoll(() =>
      buddiesEngine.sync({ automatic: true }).then(
        () => true,
        (error: unknown) => {
          warn(error)
          return false
        }
      )
    )
  }, [live])
}
