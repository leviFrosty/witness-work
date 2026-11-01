import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import { useShallow } from 'zustand/react/shallow'
import useToday from '@/hooks/useToday'
import {
  sharedServiceYearPace,
  type ServiceYearPaceData,
} from '@/features/progress/lib/serviceYearPaceData'

export type {
  MonthBars,
  ServiceYearPaceData,
} from '@/features/progress/lib/serviceYearPaceData'

const useServiceYearPace = (serviceYear: number): ServiceYearPaceData => {
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)

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

  const today = useToday()

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
