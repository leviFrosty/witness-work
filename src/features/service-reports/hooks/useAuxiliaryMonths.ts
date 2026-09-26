import { analytics } from '@/lib/analytics'
import { monthlyGoalKey, type CalendarMonth } from '@/lib/monthlyGoals'
import { monthStatusOf, type MonthStatus } from '@/lib/monthStatus'
import {
  addCalendarMonths,
  calendarMonthOf,
  roleForMonth,
} from '@/lib/roleHistory'
import { usePreferences } from '@/stores/preferences'

export type AuxiliaryMonthSource = 'home' | 'settings'

export type AuxiliaryMonth = {
  target: CalendarMonth
  /** 0 = this month, 1 = next month. */
  offset: 0 | 1
  status: MonthStatus
  isAuxiliary: boolean
}

export type AuxiliaryGoal = 'regularAuxiliary' | 'regularAuxiliaryReduced'

/**
 * A Kingdom Publisher's one-month auxiliary pioneering for this month and next
 * — the most common Role History change, surfaced without Settings or the
 * Progress tab. Months not auxiliary pioneering return to the standing role.
 */
const useAuxiliaryMonths = () => {
  const { role, roleHistory, monthlyGoalOverrides, setMonthStatus } =
    usePreferences()
  const thisMonth = calendarMonthOf()

  const months: AuxiliaryMonth[] = ([0, 1] as const).map((offset) => {
    const target = addCalendarMonths(thisMonth, offset)
    const status = monthStatusOf(
      roleForMonth(roleHistory, role, target),
      monthlyGoalOverrides[monthlyGoalKey(target)]
    )
    return {
      target,
      offset,
      status,
      isAuxiliary:
        status === 'regularAuxiliary' || status === 'regularAuxiliaryReduced',
    }
  })

  const setAuxiliary = (
    month: AuxiliaryMonth,
    goal: AuxiliaryGoal | null,
    source: AuxiliaryMonthSource
  ) => {
    // `null` ends it: the month returns to the User's standing role.
    const next: MonthStatus = goal ?? role
    if (next === month.status) return
    setMonthStatus(month.target, next, 'month')
    analytics.capture('role_period_set', {
      source: `${source}_auxiliary`,
      role: next,
      scope: 'single_month',
      month_offset: month.offset,
    })
  }

  return { months, setAuxiliary }
}

export default useAuxiliaryMonths
