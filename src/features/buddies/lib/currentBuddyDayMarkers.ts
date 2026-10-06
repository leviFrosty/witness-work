import moment from 'moment'
import type { DayPlan } from '@/types/timeEntry'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import {
  buildBuddyDayMarkers,
  type BuddyDayMarker,
} from '@/features/buddies/lib/calendarMarkers'
import { planShareKey } from '@/features/buddies/lib/shares'
import type { BuddiesState } from '@/features/buddies/lib/state'

/**
 * The calendar's buddy markers from the Buddies store's state, shared by the
 * Schedule calendar and the Calendar widget so both show the same people.
 */
export function currentBuddyDayMarkers({
  buddies,
  cards,
  shareReplies,
  incomingShares,
  registeredInboxId,
  dayPlans,
}: Pick<
  BuddiesState,
  'buddies' | 'cards' | 'shareReplies' | 'incomingShares' | 'registeredInboxId'
> & { dayPlans: DayPlan[] }): Record<string, BuddyDayMarker> {
  return buildBuddyDayMarkers({
    buddies,
    cards,
    dayPlans,
    // Deriving a share id reads the identity seed, so only once Buddies is in use.
    repliesFor: (plan) =>
      registeredInboxId !== null
        ? shareReplies[buddiesEngine.shareIdForKey(planShareKey(plan.id))]
        : undefined,
    incomingShares: Object.values(incomingShares),
    now: Date.now(),
    today: moment().format('YYYY-MM-DD'),
  })
}
