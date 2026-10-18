import useRoleForMonth from '@/hooks/useRoleForMonth'
import { getTotalMinutesForServiceYear } from '@/lib/serviceReport'
import { getServiceYearReports } from '@/lib/serviceYear'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { useShallow } from 'zustand/react/shallow'

/**
 * A Service Year's credit-capped total, each month capped by the role that
 * applied then, as the Year tab counts it. `serviceYear` is the start year.
 */
export default function useServiceYearTotal(serviceYear: number) {
  const roleFor = useRoleForMonth()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const { overrideCreditLimit, customCreditLimitHours } = usePreferences(
    useShallow((s) => ({
      overrideCreditLimit: s.overrideCreditLimit,
      customCreditLimitHours: s.customCreditLimitHours,
    }))
  )
  return getTotalMinutesForServiceYear(
    getServiceYearReports(serviceReports, serviceYear),
    serviceYear,
    roleFor,
    { enabled: overrideCreditLimit, customLimitHours: customCreditLimitHours }
  )
}
