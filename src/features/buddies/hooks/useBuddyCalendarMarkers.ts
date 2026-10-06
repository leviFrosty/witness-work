import useServiceReport from '@/stores/serviceReport'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import type { BuddyDayMarker } from '@/features/buddies/lib/calendarMarkers'
import { currentBuddyDayMarkers } from '@/features/buddies/lib/currentBuddyDayMarkers'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * `YYYY-MM-DD` → who the User goes out with that day, and which other buddies
 * plan to go out. Past days are dropped even when a buddy's card is stale.
 */
export default function useBuddyCalendarMarkers(): Record<
  string,
  BuddyDayMarker
> {
  const enabled = useBuddiesEnabled()
  const buddies = useBuddies((state) => state.buddies)
  const cards = useBuddies((state) => state.cards)
  const shareReplies = useBuddies((state) => state.shareReplies)
  const incomingShares = useBuddies((state) => state.incomingShares)
  const registeredInboxId = useBuddies((state) => state.registeredInboxId)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  if (!enabled) return {}

  return currentBuddyDayMarkers({
    buddies,
    cards,
    shareReplies,
    incomingShares,
    registeredInboxId,
    dayPlans,
  })
}
