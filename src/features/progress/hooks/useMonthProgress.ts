import moment from 'moment'
import useLocalDay from '@/hooks/useLocalDay'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import usePublisher from '@/hooks/usePublisher'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { monthTense } from '@/features/progress/lib/progressCardStats'
import { useShallow } from 'zustand/react/shallow'

export default function useMonthProgress(month: number, year: number) {
  const today = moment(useLocalDay(), 'YYYY-MM-DD')
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const { overrideCreditLimit, customCreditLimitHours } = usePreferences(
    useShallow((s) => ({
      overrideCreditLimit: s.overrideCreditLimit,
      customCreditLimitHours: s.customCreditLimitHours,
    }))
  )
  const publisher = usePublisher({ month, year })
  const { effectiveGoalHours } = useMonthlyGoal({ month, year })
  const reports = getMonthsReports(serviceReports, month, year)
  const adjusted = adjustedMinutesForSpecificMonth(
    reports,
    month,
    year,
    publisher.type,
    { enabled: overrideCreditLimit, customLimitHours: customCreditLimitHours }
  )

  return {
    today,
    tense: monthTense(month, year, today),
    reports,
    adjusted,
    goalMinutes: effectiveGoalHours * 60,
    publisher,
  }
}
