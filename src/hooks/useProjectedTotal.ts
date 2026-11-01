import { useMemo } from 'react'

import usePublisher from '@/hooks/usePublisher'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import {
  getLoggedDayKeys,
  getMonthsReports,
  getServiceYearMonthlyBreakdowns,
  getTotalMinutesDetailedForSpecificMonth,
  type MonthlyLoggedBreakdown,
} from '@/lib/serviceReport'
import { getServiceYearReports } from '@/lib/serviceYear'
import {
  computeProjectedTotal,
  type ProjectedTotalResult,
  type ProjectedTotalScope,
} from '@/lib/projectedTotal'

const useProjectedTotal = (
  scope: ProjectedTotalScope,
  goalMinutes: number,

  asOf?: Date
): {
  projection: ProjectedTotalResult
  today: Date
  loggedDayKeys: Set<string>
} => {
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)

  const categories = useCategories((s) => s.categories)
  const { creditCapMinutes } = usePublisher()

  const scopeKind = scope.kind
  const scopeYear = scope.kind === 'month' ? scope.year : scope.serviceYear
  const scopeMonth = scope.kind === 'month' ? scope.month : null
  const stableScope = useMemo<ProjectedTotalScope>(() => {
    if (scopeKind === 'month') {
      return { kind: 'month', year: scopeYear, month: scopeMonth ?? 0 }
    }
    return { kind: 'serviceYear', serviceYear: scopeYear }
  }, [scopeKind, scopeYear, scopeMonth])

  const asOfTime = asOf?.getTime()
  const today = useMemo(
    () => (asOfTime === undefined ? new Date() : new Date(asOfTime)),
    [asOfTime]
  )

  const { loggedMonths, loggedDayKeys } = useMemo<{
    loggedMonths: MonthlyLoggedBreakdown[]
    loggedDayKeys: Set<string>
  }>(() => {
    if (stableScope.kind === 'month') {
      const reports = getMonthsReports(
        serviceReports,
        stableScope.month,
        stableScope.year
      )
      const { standard, credit } = getTotalMinutesDetailedForSpecificMonth(
        reports,
        stableScope.month,
        stableScope.year
      )
      return {
        loggedMonths: [
          {
            year: stableScope.year,
            month: stableScope.month,
            standard,
            credit,
          },
        ],
        loggedDayKeys: getLoggedDayKeys(reports),
      }
    }
    const reports = getServiceYearReports(
      serviceReports,
      stableScope.serviceYear
    )
    const flat = Object.values(reports).flatMap((months) =>
      Object.values(months).flat()
    )
    return {
      loggedMonths: getServiceYearMonthlyBreakdowns(reports),
      loggedDayKeys: getLoggedDayKeys(flat),
    }
  }, [stableScope, serviceReports])

  const projection = useMemo(
    () =>
      computeProjectedTotal({
        scope: stableScope,
        today,
        goalMinutes,
        loggedMonths,
        loggedDayKeys,
        dayPlans,
        recurringPlans,
        categories,
        creditCapMinutes,
      }),
    [
      stableScope,
      today,
      goalMinutes,
      loggedMonths,
      loggedDayKeys,
      dayPlans,
      recurringPlans,
      categories,
      creditCapMinutes,
    ]
  )

  return { projection, today, loggedDayKeys }
}

export default useProjectedTotal
