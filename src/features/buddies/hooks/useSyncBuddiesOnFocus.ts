import { useEffect } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { logger } from '@/lib/logger'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { liveSignalHealthy, syncSoon } from '@/features/buddies/lib/autoSync'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function useSyncBuddiesOnFocus() {
  const focused = useIsFocused()
  const enabled = useBuddiesEnabled()
  const hasInbox = useBuddies((state) => state.registeredInboxId !== null)

  useEffect(() => {
    if (!focused || !enabled || !hasInbox || liveSignalHealthy()) return
    void syncSoon().catch((error) => logger.warn('[buddies] focus sync', error))
  }, [focused, enabled, hasInbox])
}
