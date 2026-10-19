import { storedDayKey } from '@/lib/normalizeDate'
import { resolveCoat, type SharedPet } from '@/types/pet'
import type { DayPlan } from '@/types/timeEntry'
import type { Buddy, ReceivedReply } from '@/features/buddies/lib/state'
import { visitorForToday } from '@/features/pet/lib/eggs'

/**
 * The buddy pet that sits beside the User's today (the `visitor` hidden
 * moment): an active buddy who shares a pet and is on one of today's Plans,
 * minus buddies who declined that Plan's invitation, as the calendar counts who
 * the User goes out with. `visitorForToday` picks: the earliest Plan, then the
 * first buddy on it. Null when nobody visits.
 */
export function petVisitorFor({
  buddies,
  dayPlans,
  todayKey,
  repliesFor,
}: {
  buddies: readonly Pick<Buddy, 'inboxId' | 'status' | 'pet'>[]
  dayPlans: readonly DayPlan[]
  todayKey: string
  /** Buddies' answers to the User's invitation to `plan`, by inbox id. */
  repliesFor: (plan: DayPlan) => Record<string, ReceivedReply> | undefined
}): SharedPet | null {
  const buddiesWithPets = buddies.flatMap((buddy) =>
    buddy.status === 'active' && buddy.pet
      ? [{ inboxId: buddy.inboxId, pet: buddy.pet }]
      : []
  )
  if (buddiesWithPets.length === 0) return null
  const today = dayPlans
    .filter((plan) => storedDayKey(plan.date) === todayKey)
    .map((plan) => {
      // A Plan that follows an invitation is with the inviter only.
      if (plan.buddyShare || !plan.buddies?.length) return plan
      const replies = repliesFor(plan)
      return {
        ...plan,
        buddies: plan.buddies.filter(
          (inboxId) => replies?.[inboxId]?.status !== 'declined'
        ),
      }
    })
  const visitor = visitorForToday({
    dayPlans: today,
    todayKey,
    buddiesWithPets,
  })
  if (!visitor) return null
  const { species, coat, name } = visitor.pet
  return {
    species,
    // A coat a newer app sent reads as the species' default.
    coat: resolveCoat(species, coat),
    ...(name ? { name } : {}),
  }
}
