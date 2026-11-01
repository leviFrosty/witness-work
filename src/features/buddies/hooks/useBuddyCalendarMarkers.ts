import useServiceReport from '@/stores/serviceReport'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import type { BuddyDayMarker } from '@/features/buddies/lib/calendarMarkers'
import { currentBuddyDayMarkers } from '@/features/buddies/lib/currentBuddyDayMarkers'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function useBuddyCalendarMarkers(): Record<
  string,
  BuddyDayMarker
> {
  const enabled = useBuddiesEnabled()
  const buddies = useBuddies((state) => state.buddies)
  const sharing = useBuddies((state) => state.sharing)
  const cards = useBuddies((state) => state.cards)
  const shareReplies = useBuddies((state) => state.shareReplies)
  const incomingShares = useBuddies((state) => state.incomingShares)
  const registeredInboxId = useBuddies((state) => state.registeredInboxId)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  if (!enabled) return {}

  return currentBuddyDayMarkers({
    buddies,
    sharing,
    cards,
    shareReplies,
    incomingShares,
    registeredInboxId,
    dayPlans,
  })
}
