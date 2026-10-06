import { storedDayKey } from '@/lib/normalizeDate'
import type { DayPlan } from '@/types/timeEntry'
import type {
  Buddy,
  IncomingShare,
  ReceivedCard,
  ReceivedReply,
} from '@/features/buddies/lib/state'

/** What the calendar shows about buddies on one day. */
export type BuddyDayMarker = {
  /**
   * Who the User goes out with that day: buddies on the User's Plans (minus any
   * who declined) and buddies whose Follow-ups the User is joining.
   */
  withBuddies: Buddy[]
  /** Other buddies shown on the calendar who plan to go out. */
  goingOut: Buddy[]
}

/**
 * `YYYY-MM-DD` → buddy marker, from `today` on. A buddy's own Plans count only
 * while the User shows that buddy on the calendar; the User's Plans with a
 * buddy always do.
 */
export function buildBuddyDayMarkers({
  buddies,
  cards,
  dayPlans,
  repliesFor,
  incomingShares,
  now,
  today,
}: {
  buddies: Buddy[]
  cards: Record<string, ReceivedCard | undefined>
  dayPlans: DayPlan[]
  /** Buddies' answers to the User's invitation to `plan`, by inbox id. */
  repliesFor: (plan: DayPlan) => Record<string, ReceivedReply> | undefined
  incomingShares: IncomingShare[]
  now: number
  today: string
}): Record<string, BuddyDayMarker> {
  const markers: Record<string, BuddyDayMarker> = {}
  const markerFor = (day: string) =>
    (markers[day] ??= { withBuddies: [], goingOut: [] })
  const addWith = (day: string, buddy: Buddy | undefined) => {
    if (!buddy || buddy.status !== 'active' || day < today) return
    const marker = markerFor(day)
    if (!marker.withBuddies.includes(buddy)) marker.withBuddies.push(buddy)
  }
  const byId = (inboxId: string) =>
    buddies.find((buddy) => buddy.inboxId === inboxId)

  for (const plan of dayPlans) {
    const day = storedDayKey(plan.date)
    // A Plan that follows an invitation is with the inviter only; who else
    // they invited isn't shared.
    if (plan.buddyShare) {
      addWith(day, byId(plan.buddyShare.from))
      continue
    }
    if (!plan.buddies?.length) continue
    const replies = repliesFor(plan)
    for (const inboxId of plan.buddies) {
      if (replies?.[inboxId]?.status === 'declined') continue
      addWith(day, byId(inboxId))
    }
  }

  // Accepted Plan invitations are already Plans above; Follow-ups aren't.
  for (const share of incomingShares) {
    if (share.type !== 'followUp' || share.status !== 'going') continue
    if (share.expiresAt <= now) continue
    addWith(share.details.d, byId(share.from))
  }

  for (const buddy of buddies) {
    if (buddy.status !== 'active' || !buddy.showOnCalendar) continue
    for (const day of cards[buddy.inboxId]?.days ?? []) {
      if (day.d < today || day.p.length === 0) continue
      const marker = markerFor(day.d)
      if (marker.withBuddies.includes(buddy)) continue
      if (!marker.goingOut.includes(buddy)) marker.goingOut.push(buddy)
    }
  }
  return markers
}

/** At most this many circles run up a calendar day's right edge. */
export const MAX_STACKED_BUDDIES = 3

/**
 * The avatars a calendar day shows for who the User goes out with, bottom
 * first. When they don't all fit, the top circle counts the rest instead.
 */
export function stackedBuddies(withBuddies: Buddy[]): {
  shown: Buddy[]
  more: number
} {
  if (withBuddies.length <= MAX_STACKED_BUDDIES)
    return { shown: withBuddies, more: 0 }
  const shown = withBuddies.slice(0, MAX_STACKED_BUDDIES - 1)
  return { shown, more: withBuddies.length - shown.length }
}
