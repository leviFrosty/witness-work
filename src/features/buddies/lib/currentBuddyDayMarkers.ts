import moment from 'moment'
import type { DayPlan } from '@/types/timeEntry'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import {
  buildBuddyDayMarkers,
  type BuddyDayMarker,
} from '@/features/buddies/lib/calendarMarkers'
import { planShareKey } from '@/features/buddies/lib/shares'
import type { BuddiesState } from '@/features/buddies/lib/state'

export function currentBuddyDayMarkers({
  buddies,
  sharing,
  cards,
  shareReplies,
  incomingShares,
  registeredInboxId,
  dayPlans,
}: Pick<
  BuddiesState,
  | 'buddies'
  | 'sharing'
  | 'cards'
  | 'shareReplies'
  | 'incomingShares'
  | 'registeredInboxId'
> & { dayPlans: DayPlan[] }): Record<string, BuddyDayMarker> {
  return buildBuddyDayMarkers({
    buddies,
    sharing,
    cards,
    dayPlans,

    repliesFor: (plan) =>
      registeredInboxId !== null
        ? shareReplies[buddiesEngine.shareIdForKey(planShareKey(plan.id))]
        : undefined,
    incomingShares: Object.values(incomingShares),
    now: Date.now(),
    today: moment().format('YYYY-MM-DD'),
  })
}
