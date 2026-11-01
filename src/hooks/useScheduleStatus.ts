import usePublisher from '@/hooks/usePublisher'
import { roleForMonth } from '@/lib/roleHistory'
import {
  getScheduleStatusForMonth,
  getScheduleStatusForServiceYear,
} from '@/lib/scheduleStatus'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { useShallow } from 'zustand/react/shallow'

const useScheduleStatus = ({
  month,
  year,
}: {
  month: number
  year: number
}) => {
  const serviceReports = useServiceReport((state) => state.serviceReports)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const { overrideCreditLimit, customCreditLimitHours } = usePreferences(
    useShallow((s) => ({
      overrideCreditLimit: s.overrideCreditLimit,
      customCreditLimitHours: s.customCreditLimitHours,
    }))
  )
  const { type: role } = usePublisher({ month, year })

  return getScheduleStatusForMonth({
    month,
    year,
    serviceReports,
    dayPlans,
    recurringPlans,
    publisher: role,
    creditLimit: {
      enabled: overrideCreditLimit,
      customLimitHours: customCreditLimitHours,
    },
  })
}

export const useServiceYearScheduleStatus = (serviceYear: number) => {
  const serviceReports = useServiceReport((state) => state.serviceReports)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const { role, roleHistory, overrideCreditLimit, customCreditLimitHours } =
    usePreferences(
      useShallow((s) => ({
        role: s.role,
        roleHistory: s.roleHistory,
        overrideCreditLimit: s.overrideCreditLimit,
        customCreditLimitHours: s.customCreditLimitHours,
      }))
    )

  return getScheduleStatusForServiceYear({
    serviceYear,
    serviceReports,
    dayPlans,
    recurringPlans,
    publisherForMonth: (month) => roleForMonth(roleHistory, role, month),
    creditLimit: {
      enabled: overrideCreditLimit,
      customLimitHours: customCreditLimitHours,
    },
  })
}

export default useScheduleStatus
