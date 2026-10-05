import moment from 'moment'
import useServiceReport from '@/stores/serviceReport'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import {
  buildBuddyDayMarkers,
  type BuddyDayMarker,
} from '@/features/buddies/lib/calendarMarkers'
import { planShareKey } from '@/features/buddies/lib/shares'
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
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  if (!enabled) return {}

  const today = moment().format('YYYY-MM-DD')
  return buildBuddyDayMarkers({
    buddies,
    cards,
    dayPlans,
    // Deriving a share id reads the identity seed, so only once Buddies is in use.
    repliesFor: (plan) =>
      started
        ? shareReplies[buddiesEngine.shareIdForKey(planShareKey(plan.id))]
        : undefined,
    incomingShares: Object.values(incomingShares),
    now: Date.now(),
    today,
  })
}
