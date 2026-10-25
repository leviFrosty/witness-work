import type { ServiceStreak } from '@/lib/serviceStreak'

export type LampLevel = 0 | 1 | 2 | 3 | 4 | 5

/** The level the lamp burns at when the User hides streaks. */
export const LAMP_LEVEL_STREAKS_HIDDEN: LampLevel = 3

/** Lowest count for levels 1–5, by streak kind (`docs/pet-companion.md`). */
const THRESHOLDS: Record<ServiceStreak['kind'], readonly number[]> = {
  plans: [1, 3, 7, 14, 30],
  months: [1, 2, 3, 6, 12],
}

/**
 * The room lamp's brightness, 0–5, from the raw Service Streak count. With
 * streaks hidden it still burns, at 3.
 */
export function lampLevel(
  streak: Pick<ServiceStreak, 'kind' | 'count'>,
  showStreaks: boolean
): LampLevel {
  if (!showStreaks) return LAMP_LEVEL_STREAKS_HIDDEN
  const thresholds = THRESHOLDS[streak.kind]
  let level = 0
  for (const threshold of thresholds) if (streak.count >= threshold) level++
  return level as LampLevel
}
