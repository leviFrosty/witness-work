import { monthlyGoalKey } from '@/lib/monthlyGoals'
import { addCalendarMonths, calendarMonthOf } from '@/lib/roleHistory'

export type MonthEditTarget = 'status' | 'goal'

/**
 * Which of a month's settings can be changed: status through next month (so
 * someone starting auxiliary pioneering next month can plan against its goal),
 * goal when the month's role has a Monthly Goal.
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
    monthlyGoalKey({ year, month }) <=
    monthlyGoalKey(addCalendarMonths(calendarMonthOf(now), 1)),
  goal: baseGoalHours > 0,
})
