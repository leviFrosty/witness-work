import { useState } from 'react'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import { useShallow } from 'zustand/react/shallow'
import {
  sharedServiceYearPace,
  type ServiceYearPaceData,
} from '@/features/progress/lib/serviceYearPaceData'

export type {
  MonthBars,
  ServiceYearPaceData,
} from '@/features/progress/lib/serviceYearPaceData'

/**
 * Store-wired Service Year pace for the Year tab: the running goal, logged and
 * planned time, last year's running total, and the month rows' bar scale. Every
 * month is capped and goaled by the role that applied then (Role History), so
 * the chart, the rows, and the year's hero total agree. Callers with the same
 * stores and Service Year share one computation (`sharedServiceYearPace`).
 *
 * `serviceYear` is the start year (September of `serviceYear`).
 */
const useServiceYearPace = (serviceYear: number): ServiceYearPaceData => {
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  // Plans take their credit-ness from their Category at read time.
  const categories = useCategories((s) => s.categories)
  const prefs = usePreferences(
    useShallow((s) => ({
      role: s.role,
      roleHistory: s.roleHistory,
      publisherHours: s.publisherHours,
      userSpecifiedHasAnnualGoal: s.userSpecifiedHasAnnualGoal,
      milestoneOverrides: s.milestoneOverrides,
      overrideCreditLimit: s.overrideCreditLimit,
      customCreditLimitHours: s.customCreditLimitHours,
      logsHours: s.logsHours,
      monthlyGoalOverrides: s.monthlyGoalOverrides,
    }))
  )
  // One "now" per mount so the chart, rows, and status line agree.
  const [today] = useState(() => new Date())

  const shared = sharedServiceYearPace({
    ...prefs,
    serviceYear,
    today,
    serviceReports,
    dayPlans,
    recurringPlans,
    categories,
  })
  return { ...shared, today }
}

export default useServiceYearPace
