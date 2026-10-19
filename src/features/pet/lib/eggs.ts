import { getStartTimeInMinutes, storedDayKey } from '@/lib/normalizeDate'
import type { SharedPet } from '@/types/pet'
import type { DayPlan } from '@/types/timeEntry'
import type { ResolvedWindow } from '@/features/pet/lib/liveWindow'

/**
 * Hidden moments (`docs/pet-companion.md` → Hidden moments). Pure rules only;
 * the scene decides how to show them. None is listed or explained in the app,
 * and none is triggered by hours.
 */

/** One Home visit in this many shows the lion and lamb in a live daytime sky. */
export const PARADISE_ODDS = 20
/** One Home visit in this many shows a shooting star in a live night sky. */
export const STAR_ODDS = 15
export const TRICK_PATS = 15
export const TRICK_WINDOW_MS = 5_000

type Sky = Pick<ResolvedWindow, 'time' | 'liveTime'>

/** Rolled once per Home visit: a tiny lion and lamb stroll across the hills. */
export const shouldShowParadise = (rng: () => number, sky: Sky): boolean =>
  sky.liveTime && sky.time === 'day' && rng() < 1 / PARADISE_ODDS

/** Rolled once per Home visit: a shooting star crosses the window. */
export const shouldShowStar = (rng: () => number, sky: Sky): boolean =>
  sky.liveTime && sky.time === 'night' && rng() < 1 / STAR_ODDS

/** The rainbow shows on its day until midnight, but not in a night sky. */
export const shouldShowRainbow = (
  life: { rainbowToday: boolean } | null,
  sky: Pick<ResolvedWindow, 'time'>
): boolean => !!life?.rainbowToday && sky.time !== 'night'

/**
 * Counts head pats; `pat` returns true on the pat that makes `TRICK_PATS`
 * within `TRICK_WINDOW_MS`, then starts counting again.
 */
export function createPatCounter({
  pats = TRICK_PATS,
  windowMs = TRICK_WINDOW_MS,
}: { pats?: number; windowMs?: number } = {}) {
  let times: number[] = []
  return {
    pat(nowMs: number = Date.now()): boolean {
      times = times.filter((at) => nowMs - at < windowMs)
      times.push(nowMs)
      if (times.length < pats) return false
      times = []
      return true
    },
    reset(): void {
      times = []
    },
  }
}

export type PatCounter = ReturnType<typeof createPatCounter>

export type BuddyWithPet = {
  /** The buddy's inbox id, as Plans list it (`DayPlan.buddies`). */
  inboxId: string
  pet: SharedPet
}

/**
 * The buddy pet that visits today: a buddy who shares a pet and is on one of
 * today's Plans, invited by the User (`buddies`) or the one whose invitation
 * the User answered (`buddyShare.from`). The earliest Plan wins, then the first
 * buddy on it. Null when nobody visits.
 */
export function visitorForToday({
  dayPlans,
  todayKey,
  buddiesWithPets,
}: {
  dayPlans: readonly Pick<
    DayPlan,
    'date' | 'buddies' | 'buddyShare' | 'startTimeInMinutes'
  >[]
  todayKey: string
  buddiesWithPets: readonly BuddyWithPet[]
}): BuddyWithPet | null {
  if (buddiesWithPets.length === 0) return null
  const byInbox = new Map(
    buddiesWithPets.map((buddy) => [buddy.inboxId, buddy])
  )
  const today = dayPlans
    .filter((plan) => storedDayKey(plan.date) === todayKey)
    .sort((a, b) => getStartTimeInMinutes(a) - getStartTimeInMinutes(b))
  for (const plan of today) {
    const people = [...(plan.buddies ?? [])]
    if (plan.buddyShare) people.push(plan.buddyShare.from)
    for (const inboxId of people) {
      const buddy = byInbox.get(inboxId)
      if (buddy) return buddy
    }
  }
  return null
}
