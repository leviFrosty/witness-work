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
import {
  resolveMonthlyGoalHours,
  type CalendarMonth,
  type MonthlyGoalOverrides,
} from '@/lib/monthlyGoals'
import type {
  DayPlan,
  RecurringPlan,
  TimeEntriesByYear,
} from '@/types/timeEntry'
import type { Category } from '@/types/category'
import {
  buildServiceYearPace,
  type ServiceYearPace,
} from '@/features/progress/lib/serviceYearPace'

export type ServiceYearPaceData = {
  pace: ServiceYearPace

  projection: ProjectedTotalResult
  today: Date
  monthBars: MonthBars

  monthGoalMinutes: number[]
}

export type MonthBars = {
  scaleMinutes: number

  hasCredit: boolean

  hasPlanned: boolean

  hasGoal: boolean
}

export type ServiceYearPaceInput = RolePreferences & {
  serviceYear: number
  today: Date
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  categories: Category[]
  monthlyGoalOverrides: MonthlyGoalOverrides
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

export const computeServiceYearPace = ({
  serviceYear,
  today,
  serviceReports,
  dayPlans,
  recurringPlans,
  categories,
  monthlyGoalOverrides,
  ...rolePrefs
}: ServiceYearPaceInput): ServiceYearPaceData => {
  const { role, roleHistory, publisherHours, userSpecifiedHasAnnualGoal } =
    rolePrefs
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

  return { pace, projection, today, monthBars, monthGoalMinutes }
}

const cacheKey = ({ today, ...rest }: ServiceYearPaceInput): unknown[] => [
  today.getFullYear(),
  today.getMonth(),
  today.getDate(),
  ...Object.keys(rest)
    .sort()
    .map((key) => rest[key as keyof typeof rest]),
]

const sameKey = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every((value, i) => Object.is(value, b[i]))

const CACHE_SIZE = 4
const cache: { key: unknown[]; data: ServiceYearPaceData }[] = []

export const sharedServiceYearPace = (
  input: ServiceYearPaceInput
): ServiceYearPaceData => {
  const key = cacheKey(input)
  const index = cache.findIndex((entry) => sameKey(entry.key, key))
  if (index >= 0) {
    const [entry] = cache.splice(index, 1)
    cache.unshift(entry)
    return entry.data
  }
  const data = computeServiceYearPace(input)
  cache.unshift({ key, data })
  cache.length = Math.min(cache.length, CACHE_SIZE)
  return data
}
