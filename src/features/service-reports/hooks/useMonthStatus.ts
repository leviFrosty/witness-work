import { analytics } from '@/lib/analytics'
import { monthlyGoalKey, type CalendarMonth } from '@/lib/monthlyGoals'
import {
  monthStatusLabel,
  monthStatusOf,
  type MonthStatus,
} from '@/lib/monthStatus'
import { roleForMonth } from '@/lib/roleHistory'
import { usePreferences } from '@/stores/preferences'

export type MonthStatusSource = 'month_card' | 'year_tab' | 'history_editor'

const useMonthStatus = (target: CalendarMonth) => {
  const {
    role,
    roleHistory,
    monthlyGoalOverrides,
    publisherHours,
    setMonthStatus,
  } = usePreferences()
  const monthRole = roleForMonth(roleHistory, role, target)
  const status = monthStatusOf(
    monthRole,
    monthlyGoalOverrides[monthlyGoalKey(target)]
  )

  const save = (
    next: MonthStatus,
    scope: 'month' | 'onward',
    source: MonthStatusSource
  ) => {
    if (next === status && scope === 'month') return
    setMonthStatus(target, next, scope)
    analytics.capture('role_period_set', {
      source,
      role: next,
      scope: scope === 'onward' ? 'from_month' : 'single_month',
    })
  }

  return {
    status,
    label: monthStatusLabel(status, publisherHours),

    isDifferent: monthRole !== role,
    save,
  }
}

export default useMonthStatus
