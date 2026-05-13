import { Publisher } from '@/types/publisher'

/**
 * Hardcoded sensible milestone ladders per publisher type. Each array lists
 * interior checkpoints _below_ the annual goal; the final rung (year goal =
 * `publisherHours[publisher] * 12`) is appended dynamically by
 * `getEffectiveMilestones` so the ladder always ends at the real goal even when
 * that goal changes in Settings.
 *
 * `publisher` returns an empty list because that publisher type has no annual
 * goal — the Year tab is hidden from the selector in that state.
 */
export const DEFAULT_MILESTONES_BY_PUBLISHER: Record<Publisher, number[]> = {
  publisher: [], // No annual goal
  regularAuxiliary: [], // No annual goal
  regularPioneer: [30, 50, 100, 200, 350],
  circuitOverseer: [100, 200, 300, 400, 500],
  specialPioneer: [], // No annual goal
  custom: [], // Unknown amount by user, can't set a cap.
}

/**
 * Resolve the milestone ladder that should render for this user. Returns the
 * user's overrides when non-null, otherwise the publisher-type defaults — then
 * always appends the current `yearGoalHours` as the final rung, sorts
 * ascending, dedupes, and filters out any value `<= 0` or strictly greater than
 * the year goal. (The year-goal value itself is always preserved.)
 */
export const getEffectiveMilestones = (
  publisher: Publisher,
  overrides: number[] | null,
  yearGoalHours: number
): number[] => {
  const base =
    overrides !== null ? overrides : DEFAULT_MILESTONES_BY_PUBLISHER[publisher]

  const combined: number[] = []
  for (const v of base) {
    if (typeof v !== 'number' || !isFinite(v)) continue
    combined.push(v)
  }
  if (yearGoalHours > 0) combined.push(yearGoalHours)

  const filtered = combined.filter((v) => v > 0 && v <= yearGoalHours)
  const unique = Array.from(new Set(filtered))
  unique.sort((a, b) => a - b)
  return unique
}

/**
 * Compute which milestones have been hit. A milestone counts as hit when
 * `hoursCompleted >= milestoneValue`. `next` is the smallest unhit value, or
 * `null` when every rung is already cleared.
 */
export const getMilestoneHitState = (
  milestones: number[],
  hoursCompleted: number
): {
  hit: number[]
  next: number | null
  totalHit: number
  total: number
} => {
  const hit: number[] = []
  let next: number | null = null
  for (const m of milestones) {
    if (hoursCompleted >= m) {
      hit.push(m)
    } else if (next === null) {
      next = m
    }
  }
  return {
    hit,
    next,
    totalHit: hit.length,
    total: milestones.length,
  }
}

/**
 * Clamp a user-entered milestone value into the legal range. Negative numbers
 * become 0 (caller typically drops those). Values above `yearGoalHours - 1`
 * collapse down to `yearGoalHours - 1` because the final row is reserved for
 * the year goal itself (locked and derived).
 */
export const validateMilestoneValue = (
  value: number,
  yearGoalHours: number
): number => {
  if (!isFinite(value) || value < 0) return 0
  const ceiling = Math.max(0, yearGoalHours - 1)
  if (value > ceiling) return ceiling
  return value
}
