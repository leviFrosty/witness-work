import {
  resolveMonthlyGoalHours,
  type CalendarMonth,
  type MonthlyGoalOverrides,
} from '@/lib/monthlyGoals'

type MonthlyGoalCrossing = {
  beforeMinutes: number
  afterMinutes: number
  baseGoalHours: number
  monthlyGoalOverrides: MonthlyGoalOverrides
  target: CalendarMonth
}

/**
 * True only for the transition from below to at-or-above the target month's
 * goal.
 */
export const didCrossMonthlyGoal = ({
  beforeMinutes,
  afterMinutes,
  baseGoalHours,
  monthlyGoalOverrides,
  target,
}: MonthlyGoalCrossing): boolean => {
  const goalHours = resolveMonthlyGoalHours(
    baseGoalHours,
    monthlyGoalOverrides,
    target
  )
  if (goalHours <= 0) return false

  const goalMinutes = goalHours * 60
  return beforeMinutes < goalMinutes && afterMinutes >= goalMinutes
}
