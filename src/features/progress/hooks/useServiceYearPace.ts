import { useState } from 'react'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import {
  getLoggedDayKeys,
  getServiceYearMonthlyBreakdowns,
} from '@/lib/serviceReport'
import { getServiceYearReports } from '@/lib/serviceYear'
import {
  computeProjectedTotal,
  type ProjectedTotalResult,
} from '@/lib/projectedTotal'
import {
  annualGoalHoursByMonth,
  publisherCapabilitiesForMonth,
  type RolePreferences,
} from '@/lib/roleHistory'
import { resolveMonthlyGoalHours, type CalendarMonth } from '@/lib/monthlyGoals'
import type { TimeEntriesByYear } from '@/types/timeEntry'
import {
  buildServiceYearPace,
  type ServiceYearPace,
} from '@/features/progress/lib/serviceYearPace'

export type ServiceYearPaceData = {
  pace: ServiceYearPace
  /** The year's Projected Total, for the status line. */
  projection: ProjectedTotalResult
  today: Date
  monthBars: MonthBars
}

/** What the Year tab's month-row bars share, and which marks they show. */
export type MonthBars = {
  /**
   * What a full-width bar stands for: the largest logged-plus-planned total or
   * Monthly Goal of any month, so every row shares one scale.
   */
  scaleMinutes: number
  /** Some month counts Credit Time. */
  hasCredit: boolean
  /** Some month has Plans left. */
  hasPlanned: boolean
  /** Some month has a Monthly Goal. */
  hasGoal: boolean
}

const loggedForServiceYear = (
  serviceReports: TimeEntriesByYear,
  serviceYear: number
) => {
  const reports = getServiceYearReports(serviceReports, serviceYear)
  const entries = Object.values(reports).flatMap((months) =>
    Object.values(months).flat()
  )
  return {
    loggedMonths: getServiceYearMonthlyBreakdowns(reports),
    loggedDayKeys: getLoggedDayKeys(entries),
  }
}

/**
 * Store-wired Service Year pace for the Year tab: the running goal, logged and
 * planned time, last year's running total, and the month rows' bar scale. Every
 * month is capped and goaled by the role that applied then (Role History), so
 * the chart, the rows, and the year's hero total agree.
 *
 * `serviceYear` is the start year (September of `serviceYear`).
 */
const useServiceYearPace = (serviceYear: number): ServiceYearPaceData => {
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  // Plans take their credit-ness from their Category at read time.
  const categories = useCategories((s) => s.categories)
  const {
    role,
    roleHistory,
    publisherHours,
    userSpecifiedHasAnnualGoal,
    milestoneOverrides,
    overrideCreditLimit,
    customCreditLimitHours,
    logsHours,
    monthlyGoalOverrides,
  } = usePreferences()
  // One "now" per mount so the chart, rows, and status line agree.
  const [today] = useState(() => new Date())

  const rolePrefs: RolePreferences = {
    role,
    roleHistory,
    publisherHours,
    userSpecifiedHasAnnualGoal,
    milestoneOverrides,
    overrideCreditLimit,
    customCreditLimitHours,
    logsHours,
  }
  const capFor = (target: CalendarMonth) =>
    publisherCapabilitiesForMonth(rolePrefs, target).creditCapMinutes

  const goalMinutesByMonth = annualGoalHoursByMonth({
    history: roleHistory,
    currentRole: role,
    publisherHours,
    userSpecifiedHasAnnualGoal,
    serviceYear,
  }).map((hours) => hours * 60)

  const thisYear = loggedForServiceYear(serviceReports, serviceYear)
  const projection = computeProjectedTotal({
    scope: { kind: 'serviceYear', serviceYear },
    today,
    goalMinutes: goalMinutesByMonth.reduce((a, b) => a + b, 0),
    loggedMonths: thisYear.loggedMonths,
    loggedDayKeys: thisYear.loggedDayKeys,
    dayPlans,
    recurringPlans,
    categories,
    creditCapMinutes: capFor,
  })
  const lastYear = computeProjectedTotal({
    scope: { kind: 'serviceYear', serviceYear: serviceYear - 1 },
    today,
    goalMinutes: 0,
    loggedMonths: loggedForServiceYear(serviceReports, serviceYear - 1)
      .loggedMonths,
    dayPlans: [],
    recurringPlans: [],
    categories,
    creditCapMinutes: capFor,
  })

  const pace = buildServiceYearPace({
    serviceYear,
    today,
    goalMinutesByMonth,
    months: projection.months,
    lastYearLoggedByMonth: lastYear.months.map((m) => m.loggedMinutes),
  })

  const monthGoalMinutes = pace.months.map(
    (m) =>
      resolveMonthlyGoalHours(
        publisherCapabilitiesForMonth(rolePrefs, m).monthlyGoalHours,
        monthlyGoalOverrides,
        m
      ) * 60
  )
  const monthBars: MonthBars = {
    scaleMinutes: Math.max(
      0,
      ...pace.months.map((m, i) =>
        Math.max(m.loggedMinutes + m.plannedMinutes, monthGoalMinutes[i])
      )
    ),
    // The cap leaves logged time above standard time only when credit counts.
    hasCredit: thisYear.loggedMonths.some((logged) =>
      pace.months.some(
        (m) =>
          m.year === logged.year &&
          m.month === logged.month &&
          m.loggedMinutes > logged.standard
      )
    ),
    hasPlanned: pace.months.some((m) => m.plannedMinutes > 0),
    hasGoal: monthGoalMinutes.some((minutes) => minutes > 0),
  }

  return { pace, projection, today, monthBars }
}

export default useServiceYearPace
