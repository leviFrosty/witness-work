import { storedDayKey } from '@/lib/normalizeDate'
import type { DayPlan } from '@/types/timeEntry'
import {
  type Buddy,
  type BuddySharing,
  buddySettings,
  type IncomingShare,
  type ReceivedCard,
  type ReceivedReply,
} from '@/features/buddies/lib/state'

export type BuddyDayMarker = {
  withBuddies: Buddy[]

  goingOut: Buddy[]
}

export function buildBuddyDayMarkers({
  buddies,
  sharing,
  cards,
  dayPlans,
  repliesFor,
  incomingShares,
  now,
  today,
}: {
  buddies: Buddy[]

  sharing: BuddySharing
  cards: Record<string, ReceivedCard | undefined>
  dayPlans: DayPlan[]

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

  for (const share of incomingShares) {
    if (share.type !== 'followUp' || share.status !== 'going') continue
    if (share.expiresAt <= now) continue
    addWith(share.details.d, byId(share.from))
  }

  for (const buddy of buddies) {
    if (buddy.status !== 'active') continue
    if (!buddySettings(sharing, buddy).settings.showOnCalendar) continue
    for (const day of cards[buddy.inboxId]?.days ?? []) {
      if (day.d < today || day.p.length === 0) continue
      const marker = markerFor(day.d)
      if (marker.withBuddies.includes(buddy)) continue
      if (!marker.goingOut.includes(buddy)) marker.goingOut.push(buddy)
    }
  }
  return markers
}

export const MAX_STACKED_BUDDIES = 3

export function stackedBuddies(withBuddies: Buddy[]): {
  shown: Buddy[]
  more: number
} {
  if (withBuddies.length <= MAX_STACKED_BUDDIES)
    return { shown: withBuddies, more: 0 }
  const shown = withBuddies.slice(0, MAX_STACKED_BUDDIES - 1)
  return { shown, more: withBuddies.length - shown.length }
}
