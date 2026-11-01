import { analytics } from '@/lib/analytics'
import { monthlyGoalKey, type CalendarMonth } from '@/lib/monthlyGoals'
import { monthStatusOf, type MonthStatus } from '@/lib/monthStatus'
import {
  addCalendarMonths,
  calendarMonthOf,
  roleForMonth,
} from '@/lib/roleHistory'
import { usePreferences } from '@/stores/preferences'
import { useShallow } from 'zustand/react/shallow'

export type AuxiliaryMonthSource = 'home' | 'settings' | 'notifications_tray'

export type AuxiliaryMonth = {
  target: CalendarMonth

  offset: 0 | 1
  status: MonthStatus
  isAuxiliary: boolean
}

export type AuxiliaryGoal = 'regularAuxiliary' | 'regularAuxiliaryReduced'

const useAuxiliaryMonths = () => {
  const { role, roleHistory, monthlyGoalOverrides, setMonthStatus } =
    usePreferences(
      useShallow((s) => ({
        role: s.role,
        roleHistory: s.roleHistory,
        monthlyGoalOverrides: s.monthlyGoalOverrides,
        setMonthStatus: s.setMonthStatus,
      }))
    )
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
