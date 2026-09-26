import { analytics } from '@/lib/analytics'
import { monthlyGoalKey, type CalendarMonth } from '@/lib/monthlyGoals'
import {
  monthStatusLabel,
  monthStatusOf,
  type MonthStatus,
} from '@/lib/monthStatus'
import { roleForMonth } from '@/lib/roleHistory'
import { usePreferences } from '@/stores/preferences'

export type MonthStatusSource = 'month_chip' | 'history_editor'

/** One month's status (Role History) plus a setter that records analytics. */
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
    /** The month's role differs from the User's standing role. */
    isDifferent: monthRole !== role,
    save,
  }
}

export default useMonthStatus
