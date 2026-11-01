import moment from 'moment'
import { useShallow } from 'zustand/react/shallow'
import useLocalDay from '@/hooks/useLocalDay'
import useRoleForMonth from '@/hooks/useRoleForMonth'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { monthCreditCapMinutes } from '@/lib/serviceReport'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import type { TimeEntry } from '@/types/timeEntry'
import { serviceYearMonthTotals } from '@/features/progress/lib/periodCardStats'

export function useTodayMonth(): CalendarMonth {
  const today = moment(useLocalDay(), 'YYYY-MM-DD')
  return { year: today.year(), month: today.month() }
}

export function useServiceYearMonthTotals(serviceYear: number) {
  const roleFor = useRoleForMonth()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const { overrideCreditLimit, customCreditLimitHours } = usePreferences(
    useShallow((s) => ({
      overrideCreditLimit: s.overrideCreditLimit,
      customCreditLimitHours: s.customCreditLimitHours,
    }))
  )
  return serviceYearMonthTotals(serviceReports, serviceYear, (month) =>
    monthCreditCapMinutes(roleFor(month), {
      enabled: overrideCreditLimit,
      customLimitHours: customCreditLimitHours,
    })
  )
}

export function useAllTimeEntries(): TimeEntry[] {
  const serviceReports = useServiceReport((s) => s.serviceReports)
  return Object.values(serviceReports).flatMap((months) =>
    Object.values(months).flat()
  )
}
