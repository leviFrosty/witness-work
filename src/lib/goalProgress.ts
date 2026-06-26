/**
 * Single goal-progress read for the whole domain.
 *
 * Given logged (or projected) minutes and the goal expressed in the SAME unit —
 * MINUTES — this returns every value the UI needs to render progress toward a
 * goal: a clamped fraction for progress bars, an unclamped percent for
 * Achievement-Tier resolution, the minutes still remaining, and the minutes
 * logged beyond goal.
 *
 * The unit contract is intentionally MINUTES for both inputs, matching the rest
 * of the domain (`adjustedMinutesForSpecificMonth`, credit caps, etc.) so
 * callers stop converting to hours just to compute progress. Callers holding a
 * goal in hours pass `goalHours * 60`.
 */
export type GoalProgress = {
  /**
   * Progress as a fraction of goal, clamped to [0, 1]. Suitable for progress
   * bars. A zero (or non-positive) goal yields 1 — there's nothing left to do —
   * matching the historical `calculateProgress` behavior.
   */
  fraction: number
  /**
   * Progress as a percent of goal. NOT clamped — values above 100 are expected
   * and required for Achievement-Tier thresholds (reached/exceeded/crushed).
   */
  percent: number
  /** Minutes still needed to reach goal, clamped to [0, goalMinutes]. */
  remaining: number
  /** Minutes logged beyond goal, clamped to be non-negative. */
  over: number
}

export const goalProgress = ({
  minutes,
  goalMinutes,
}: {
  minutes: number
  goalMinutes: number
}): GoalProgress => {
  const rawFraction = minutes / goalMinutes
  // Preserve the historical clamp semantics exactly: negatives floor to 0,
  // anything at/under 1 passes through, and everything else (including the
  // Infinity/NaN produced by a zero goal) tops out at 1.
  const fraction = rawFraction < 0 ? 0 : rawFraction <= 1 ? rawFraction : 1

  const percent = rawFraction * 100

  const rawRemaining = goalMinutes - minutes
  const remaining =
    rawRemaining < 0
      ? 0
      : rawRemaining > goalMinutes
        ? goalMinutes
        : rawRemaining

  const over = Math.max(0, minutes - goalMinutes)

  return { fraction, percent, remaining, over }
}
