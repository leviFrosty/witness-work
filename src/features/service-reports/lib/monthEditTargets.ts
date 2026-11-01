export type MonthEditTarget = 'status' | 'goal'

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
