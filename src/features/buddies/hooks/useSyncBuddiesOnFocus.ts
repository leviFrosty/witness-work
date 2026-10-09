import { useEffect } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { logger } from '@/lib/logger'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { liveSignalHealthy, syncSoon } from '@/features/buddies/lib/autoSync'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Pulls buddies' latest Plans and answers whenever a screen showing them gains
 * focus, e.g. returning to Schedule from another tab or from a buddy, unless
 * the live connection already keeps them current. Shares one floor with the
 * app's other automatic syncs. Does nothing before Buddies has started.
 */
export default function useSyncBuddiesOnFocus() {
  const focused = useIsFocused()
  const enabled = useBuddiesEnabled()
  const hasInbox = useBuddies((state) => state.registeredInboxId !== null)

  useEffect(() => {
    if (!focused || !enabled || !hasInbox || liveSignalHealthy()) return
    void syncSoon().catch((error) => logger.warn('[buddies] focus sync', error))
  }, [focused, enabled, hasInbox])
}
