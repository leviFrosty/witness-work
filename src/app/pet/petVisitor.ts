import moment from 'moment'
import { getStartTimeInMinutes, storedDayKey } from '@/lib/normalizeDate'
import { resolveCoat, type PetVisit, type PetVisitActivity } from '@/types/pet'
import type { DayPlan } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import { followUpShareKey, planShareKey } from '@/features/buddies/lib/shares'
import type {
  Buddy,
  IncomingShare,
  ReceivedReply,
} from '@/features/buddies/lib/state'

type VisitorBuddy = Pick<
  Buddy,
  'inboxId' | 'status' | 'pet' | 'name' | 'nickname' | 'overrides'
>

/**
 * The buddy pets that visit today: every active buddy who shares a pet and whom
 * the User goes out with today, each once, earliest first. Going out with them
 * is what the calendar counts (`buildBuddyDayMarkers`): a Plan the User invited
 * them to (unless they declined) or one that follows their invitation, and a
 * Follow-up the User invited them to (unless they declined) or one of theirs
 * the User is joining. `showsPet` leaves out buddies whose pets the User hid.
 */
export function petVisitorsFor({
  buddies,
  dayPlans,
  visits,
  incomingShares,
  todayKey,
  now,
  repliesFor,
  showsPet = () => true,
}: {
  buddies: readonly VisitorBuddy[]
  dayPlans: readonly DayPlan[]
  visits: readonly Pick<Visit, 'id' | 'followUp'>[]
  incomingShares: readonly IncomingShare[]
  todayKey: string
  now: number
  /** Buddies' answers to the User's invitation, by share key and inbox id. */
  repliesFor: (shareKey: string) => Record<string, ReceivedReply> | undefined
  showsPet?: (buddy: VisitorBuddy) => boolean
}): PetVisit[] {
  const byInbox = new Map(
    buddies.flatMap((buddy) =>
      buddy.status === 'active' && buddy.pet && showsPet(buddy)
        ? [[buddy.inboxId, buddy] as const]
        : []
    )
  )
  if (byInbox.size === 0) return []
  const visitsByInbox = new Map<string, PetVisit>()
  const add = (
    inboxId: string,
    startMinutes: number,
    activity: PetVisitActivity
  ) => {
    const buddy = byInbox.get(inboxId)
    if (!buddy?.pet) return
    const earlier = visitsByInbox.get(inboxId)
    if (earlier && earlier.startMinutes <= startMinutes) return
    const { species, coat, name } = buddy.pet
    visitsByInbox.set(inboxId, {
      inboxId,
      // As `buddyDisplayName`: their nickname, else their own name.
      buddyName: buddy.nickname ?? buddy.name,
      // A coat a newer app sent reads as the species' default.
      pet: {
        species,
        coat: resolveCoat(species, coat),
        ...(name ? { name } : {}),
      },
      startMinutes,
      activity,
    })
  }
  const declined = (shareKey: string, inboxId: string) =>
    repliesFor(shareKey)?.[inboxId]?.status === 'declined'

  for (const plan of dayPlans) {
    if (storedDayKey(plan.date) !== todayKey) continue
    const start = getStartTimeInMinutes(plan)
    const activity = { type: 'plan', planId: plan.id } as const
    // A Plan that follows an invitation is with the inviter only.
    if (plan.buddyShare) {
      add(plan.buddyShare.from, start, activity)
      continue
    }
    for (const inboxId of plan.buddies ?? []) {
      if (!declined(planShareKey(plan.id), inboxId))
        add(inboxId, start, activity)
    }
  }

  for (const visit of visits) {
    const followUp = visit.followUp
    if (!followUp?.buddies?.length || followUp.dismissed) continue
    const date = moment(followUp.date)
    if (date.format('YYYY-MM-DD') !== todayKey) continue
    const start = date.hours() * 60 + date.minutes()
    for (const inboxId of followUp.buddies) {
      if (declined(followUpShareKey(visit.id), inboxId)) continue
      add(inboxId, start, { type: 'followUp', visitId: visit.id })
    }
  }

  for (const share of incomingShares) {
    if (share.type !== 'followUp' || share.status !== 'going') continue
    if (share.details.d !== todayKey || share.expiresAt <= now) continue
    add(share.from, share.details.s ?? 0, {
      type: 'followUpInvitation',
      from: share.from,
      shareId: share.shareId,
    })
  }

  return [...visitsByInbox.values()].sort(
    (a, b) => a.startMinutes - b.startMinutes
  )
}
