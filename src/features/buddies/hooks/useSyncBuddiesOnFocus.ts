import { useEffect } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { logger } from '@/lib/logger'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** Regaining focus pulls buddies' changes, but not more often than this. */
const FOCUS_SYNC_FLOOR_MS = 10 * 1000

let lastAttempt = 0

/**
 * Pulls buddies' latest Plans and answers whenever a screen showing them gains
 * focus, e.g. returning to Schedule from another tab or from a buddy. Does
 * nothing before Buddies has started.
 */
export default function useSyncBuddiesOnFocus() {
  const focused = useIsFocused()
  const enabled = useBuddiesEnabled()
  const hasInbox = useBuddies((state) => state.registeredInboxId !== null)

  useEffect(() => {
    if (!focused || !enabled || !hasInbox) return
    const last = Math.max(lastAttempt, useBuddies.getState().lastSyncAt)
    if (Date.now() - last < FOCUS_SYNC_FLOOR_MS) return
    lastAttempt = Date.now()
    void buddiesEngine
      .sync()
      .catch((error) => logger.warn('[buddies] focus sync', error))
  }, [focused, enabled, hasInbox])
}
