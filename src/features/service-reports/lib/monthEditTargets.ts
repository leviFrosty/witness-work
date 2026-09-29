export type MonthEditTarget = 'status' | 'goal'

/**
 * Which of a month's settings can be changed: status for months that have
 * started, goal when the month's role has a Monthly Goal.
 */
export const monthEditTargets = ({
  month,
  year,
  baseGoalHours,
  now = new Date(),
}: {
  month: number
  year: number
  baseGoalHours: number
  now?: Date
}): Record<MonthEditTarget, boolean> => ({
  status:
    year < now.getFullYear() ||
    (year === now.getFullYear() && month <= now.getMonth()),
  goal: baseGoalHours > 0,
})
