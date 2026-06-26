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

/**
 * Store-wired Projected Total for a scope: subscribes to the report / plan /
 * Category slices, assembles the per-month raw logged breakdowns, and runs the
 * mirror-cap projection (ADR 0005). The single seam for every surface that
 * renders a projection — keeps the cards and sections that show one from
 * drifting apart input-by-input.
 *
 * Returns `today` alongside the projection so parents and children (tense copy,
 * AssistantSection) agree on the same captured "now".
 */
const useProjectedTotal = (
  scope: ProjectedTotalScope,
  goalMinutes: number
): { projection: ProjectedTotalResult; today: Date } => {
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  // Plans derive their credit-ness from their referenced Category at read
  // time, so the projection re-runs when a Category's credit setting flips.
  const categories = useCategories((s) => s.categories)
  const { creditCapMinutes } = usePublisher()

  // Normalize the (usually inline-constructed) scope object to a stable
  // identity keyed on its primitive parts so callers don't bust the memos on
  // every render.
  const scopeKind = scope.kind
  const scopeYear = scope.kind === 'month' ? scope.year : scope.serviceYear
  const scopeMonth = scope.kind === 'month' ? scope.month : null
  const stableScope = useMemo<ProjectedTotalScope>(() => {
    if (scopeKind === 'month') {
      return { kind: 'month', year: scopeYear, month: scopeMonth ?? 0 }
    }
    return { kind: 'serviceYear', serviceYear: scopeYear }
  }, [scopeKind, scopeYear, scopeMonth])

  // Captured once per mount. Memoizing keeps the downstream useMemos stable
  // across renders that didn't actually cross midnight.
  const today = useMemo(() => new Date(), [])

  // Raw standard/credit buckets per month plus the set of days that already
  // have a logged entry. The projection applies the cap itself, month by month,
  // so logged and planned time run through the same formula a finished report
  // gets; `loggedDayKeys` lets it drop a day's plan once actual time exists so
  // the two never double-count the same day (issue #366).
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

  return { projection, today }
}

export default useProjectedTotal
