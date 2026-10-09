import usePublisher from '@/hooks/usePublisher'
import { getScheduleStatusForMonth } from '@/lib/scheduleStatus'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { useShallow } from 'zustand/react/shallow'

/** Builds a month's schedule status from the current Plans and Time Entries. */
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

export default useScheduleStatus
