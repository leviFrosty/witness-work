import _ from 'lodash'
import { Publisher } from '../types/publisher'
import {
  DayPlan,
  ServiceReport,
  ServiceReportsByYears,
  ServiceYear,
} from '../types/serviceReport'
import moment from 'moment'
import { monthCreditMaxMinutes } from '../constants/serviceReports'

export const calculateProgress = ({
  minutes,
  goalHours,
}: {
  minutes: number
  goalHours: number
}) => {
  const percentage = minutes / (goalHours * 60)
  return percentage < 0 ? 0 : percentage <= 1 ? percentage : 1
}

export const calculateMinutesRemaining = ({
  minutes,
  goalHours,
}: {
  minutes: number
  goalHours: number
}) => {
  const goalMinutes = goalHours * 60
  const minutesRemaining = goalMinutes - minutes
  return minutesRemaining < 0
    ? 0
    : minutesRemaining > goalMinutes
      ? goalMinutes
      : minutesRemaining
}

export const getTotalMinutesDetailedForSpecificMonth = (
  monthsReports: ServiceReport[],
  month: number,
  year: number
) => {
  const standard = standardMinutesForSpecificMonth(monthsReports, month, year)
  const ldc = ldcMinutesForSpecificMonth(monthsReports, month, year)
  const other = otherMinutesForSpecificMonth(monthsReports, month, year)

  const reportsForMonth = monthsReports.filter((report) => {
    return (
      moment(report.date).month() === month &&
      moment(report.date).year() === year
    )
  })
  const otherWithNonCreditMinutes = reportsForMonth.reduce((prev, report) => {
    if (report.tag && !report.credit) {
      return prev + report.hours * 60 + report.minutes
    }
    return prev
  }, 0)

  const otherWithCreditMinutes = reportsForMonth.reduce((prev, report) => {
    if (report.tag && report.credit) {
      return prev + report.hours * 60 + report.minutes
    }
    return prev
  }, 0)

  const totalOtherMinutes = other.reduce((p, c) => p + c.minutes, 0)

  return {
    standard: standard + otherWithNonCreditMinutes,
    credit: ldc + otherWithCreditMinutes,
    standardWithoutOtherMinutes: standard,
    ldc,
    other: {
      totalMinutes: totalOtherMinutes,
      minutesWithCredits: otherWithCreditMinutes,
      minutesWithoutCredit: otherWithNonCreditMinutes,
      reports: other,
    },
  }
}

export type AdjustedMinutes = {
  /**
   * Total adjusted hours possible to submit to report, including all possible
   * credit that can be applied.
   */
  value: number
  /** The amount of standard time in the value. */
  standard: number
  /** The amount of credit in the value. */
  credit: number
  creditOverage: number
}

/**
 * Returns minutes for specific month, taking into account potential overage
 * that could occur with credit hours.
 *
 * For example, a user has 50 standard hours and 30 credit hours for January.
 * Their adjusted hours would be 55, since they can only have up to 55 hours of
 * time including their credit.
 *
 * If a user has 70 standard hours and 30 credit hours, they will result with 70
 * hours - because standard has higher priority.
 *
 * Special pioneers and circuit overseers have no credit limit applied by
 * default. Users can override the default credit limit through preferences.
 */
export const adjustedMinutesForSpecificMonth = (
  monthsReports: ServiceReport[],
  targetMonth: number,
  targetYear: number,
  publisher?: Publisher,
  creditLimitOverride?: { enabled: boolean; customLimitHours: number }
): AdjustedMinutes => {
  const { credit, standard } = getTotalMinutesDetailedForSpecificMonth(
    monthsReports,
    targetMonth,
    targetYear
  )

  let minutes = 0
  let creditOverage = 0

  // Determine effective credit limit based on preferences and publisher type
  let effectiveCreditLimitMinutes: number | null = monthCreditMaxMinutes

  if (creditLimitOverride?.enabled) {
    // User has overridden the default credit limit
    effectiveCreditLimitMinutes =
      creditLimitOverride.customLimitHours === 0
        ? null // No limit
        : creditLimitOverride.customLimitHours * 60
  } else if (
    publisher === 'specialPioneer' ||
    publisher === 'circuitOverseer'
  ) {
    // Special pioneers and circuit overseers have no credit limit by default
    effectiveCreditLimitMinutes = null
  }

  const hasNoCreditLimit = effectiveCreditLimitMinutes === null

  if (hasNoCreditLimit) {
    // No credit limit - sum all time
    minutes = standard + credit
    creditOverage = 0
  } else {
    // effectiveCreditLimitMinutes is guaranteed to be a number here since hasNoCreditLimit is false
    const limitMinutes = effectiveCreditLimitMinutes!

    if (standard > limitMinutes) {
      minutes = standard
      if (credit) {
        creditOverage = credit
      }
    } else {
      const standardWithCredit = standard + credit
      if (standardWithCredit > limitMinutes) {
        minutes = limitMinutes
        creditOverage = standardWithCredit - limitMinutes
      } else {
        minutes = standardWithCredit
      }
    }
  }

  return {
    value: minutes,
    standard,
    credit: hasNoCreditLimit
      ? credit
      : (() => {
          const limitMinutes = effectiveCreditLimitMinutes!
          return standard < limitMinutes
            ? credit < limitMinutes - standard
              ? credit
              : limitMinutes - standard
            : 0
        })(),
    creditOverage: creditOverage,
  }
}

export const totalMinutesForSpecificMonthUpToDayOfMonth = (
  serviceReports: ServiceReport[],
  targetDay: number,
  targetMonth: number,
  targetYear: number
): number => {
  const totalMinutesForMonth = serviceReports
    .filter(
      (report) =>
        moment(report.date).month() === targetMonth &&
        moment(report.date).year() === targetYear &&
        moment(report.date).date() <= targetDay
    )
    .reduce((accumulator, report) => {
      return accumulator + report.hours * 60 + report.minutes
    }, 0)

  return totalMinutesForMonth
}
export const ldcMinutesForSpecificMonth = (
  monthsReports: ServiceReport[],
  targetMonth: number,
  targetYear: number
): number => {
  const totalMinutesForMonth = monthsReports
    .filter(
      (report) =>
        moment(report.date).month() === targetMonth &&
        moment(report.date).year() === targetYear &&
        report.ldc
    )
    .reduce((accumulator, report) => {
      return accumulator + report.hours * 60 + report.minutes
    }, 0)

  return totalMinutesForMonth
}

type OtherReports = { tag: string; minutes: number; credit?: boolean }[]

export const otherMinutesForSpecificMonth = (
  monthsReports: ServiceReport[],
  targetMonth: number,
  targetYear: number
): OtherReports => {
  const reportsForMonth = monthsReports.filter((report) => {
    return (
      moment(report.date).month() === targetMonth &&
      moment(report.date).year() === targetYear
    )
  })
  const taggedReports = reportsForMonth.filter((report) => report.tag)

  const otherReportsTotalMinutes = taggedReports.reduce<OtherReports>(
    (accumulator, report) => {
      if (!report.tag) return accumulator

      const existingTag = accumulator.find((item) => item.tag === report.tag)
      if (existingTag) {
        existingTag.minutes += report.hours * 60 + report.minutes
      } else {
        const minutes = report.hours * 60 + report.minutes
        accumulator.push({
          tag: report.tag,
          minutes: minutes,
          credit: report.credit,
        })
      }
      return accumulator
    },
    []
  )

  return otherReportsTotalMinutes
}

export const standardMinutesForSpecificMonth = (
  monthsReports: ServiceReport[],
  targetMonth: number,
  targetYear: number
): number => {
  const totalMinutesForMonth = monthsReports
    .filter(
      (report) =>
        moment(report.date).month() === targetMonth &&
        moment(report.date).year() === targetYear &&
        !report.ldc &&
        !report.tag
    )
    .reduce((accumulator, report) => {
      return accumulator + report.hours * 60 + report.minutes
    }, 0)

  return totalMinutesForMonth
}

export const getDaysLeftInCurrentMonth = () => {
  const currentDate = moment()
  const firstDayOfNextMonth = moment().add(1, 'months').startOf('month')
  const daysLeftInMonth = firstDayOfNextMonth.diff(currentDate, 'days')
  return daysLeftInMonth
}

export const getTimeAsMinutesForHourglass = (
  publisher: Publisher,
  wentOutForMonth: boolean | null,
  minutes: number | null
) => {
  if (publisher === 'publisher') {
    if (wentOutForMonth) {
      return 1
    }
    return 0
  }
  return minutes
}

export const serviceReportHoursPerMonthToGoal = ({
  currentDate,
  goalHours,
  serviceReports,
  serviceYear,
}: {
  serviceReports: ServiceReportsByYears
  currentDate: {
    month: number

    year: number
  }
  goalHours: number
  serviceYear: number
}) => {
  const { maxDate } = serviceYearsDateRange(serviceYear)
  const annualGoalHours = goalHours * 12

  const now = moment().month(currentDate.month).year(currentDate.year)

  const monthReports = getMonthsReports(
    serviceReports,
    currentDate.month,
    currentDate.year
  )

  const monthsRemainingOffset = !monthReports.length ? 1 : 0

  const actualMonthsRemaining =
    moment(maxDate).diff(now, 'months') + monthsRemainingOffset

  const monthsRemaining =
    actualMonthsRemaining === 0 ? 1 : actualMonthsRemaining

  const serviceYearReports = getServiceYearReports(serviceReports, serviceYear)
  const totalMinutesForServiceYear = getTotalMinutesForServiceYear(
    serviceYearReports,
    serviceYear
  )

  return _.round(
    (annualGoalHours * 60 - totalMinutesForServiceYear) / 60 / monthsRemaining,
    1
  )
}

export const serviceYearsDateRange = (serviceYear: number) => {
  const minDate = moment().month(8).year(serviceYear).startOf('month')
  const maxDate = moment()
    .month(7)
    .year(serviceYear + 1)
    .endOf('month')

  return { minDate, maxDate }
}

export const getTotalMinutesForServiceYear = (
  serviceYearReports: ServiceReportsByYears,
  serviceYear: number
) => {
  serviceYearReports
  serviceYear
  let minutes = 0

  for (const year in serviceYearReports) {
    for (const month in serviceYearReports[year]) {
      const current = moment().month(parseInt(month)).year(parseInt(year))
      const monthReports = getMonthsReports(
        serviceYearReports,
        parseInt(month),
        parseInt(year)
      )
      const currentMinutes = adjustedMinutesForSpecificMonth(
        monthReports,
        current.month(),
        current.year()
      ).value

      minutes += currentMinutes
    }
  }

  return minutes
}

export const getServiceYearFromDate = (moment: moment.Moment) => {
  const month = moment.month()
  const year = moment.year()

  if (month < 8) {
    return year - 1
  }

  return year
}

export enum RecurringPlanFrequencies {
  WEEKLY,
  BI_WEEKLY,
  MONTHLY,
  MONTHLY_BY_WEEKDAY,
}

// For monthly by weekday patterns (e.g., "first Monday of the month")
export type MonthlyByWeekdayConfig = {
  weekday: number // 0-6 (Sunday-Saturday)
  weekOfMonth: number // 1-4 for first, second, third, fourth week, or -1 for last week
}

export type RecurringPlanOverride = {
  date: Date
  minutes: number
  note?: string
}

export type RecurringPlan = {
  id: string
  startDate: Date
  minutes: number
  recurrence: {
    frequency: RecurringPlanFrequencies
    interval: number
    endDate: Date | null
    // For MONTHLY_BY_WEEKDAY frequency only
    monthlyByWeekdayConfig?: MonthlyByWeekdayConfig
  }
  note?: string
  deletedDates?: Date[]
  overrides?: RecurringPlanOverride[]
}

// Helper function to check if a date matches a monthly by weekday pattern
const doesDayMatchMonthlyByWeekday = (
  day: Date,
  config: MonthlyByWeekdayConfig
): boolean => {
  const momentDay = moment(day)
  const dayWeekday = momentDay.day() // 0-6 (Sunday-Saturday)

  // Check if the weekday matches
  if (dayWeekday !== config.weekday) {
    return false
  }

  // Get the first day of the month and find which week of the month this day is in
  const firstDayOfMonth = momentDay.clone().startOf('month')

  if (config.weekOfMonth === -1) {
    // Handle "last [weekday] of month"
    const lastDayOfMonth = momentDay.clone().endOf('month')
    const daysFromEnd = lastDayOfMonth.date() - momentDay.date()
    return daysFromEnd < 7 && dayWeekday === config.weekday
  } else {
    // Handle "first", "second", "third", "fourth" [weekday] of month
    // We need to be more precise about which occurrence this is
    const firstWeekdayOfMonth = firstDayOfMonth.clone()
    while (firstWeekdayOfMonth.day() !== config.weekday) {
      firstWeekdayOfMonth.add(1, 'day')
    }

    // Calculate which occurrence this is (1st, 2nd, 3rd, 4th)
    const weeksBetween = momentDay.diff(firstWeekdayOfMonth, 'weeks')
    const occurrence = weeksBetween + 1

    return occurrence === config.weekOfMonth
  }
}

export const getPlansIntersectingDay = (
  day: Date,
  plans: RecurringPlan[]
): RecurringPlan[] => {
  return plans.filter((plan) => {
    const { startDate, recurrence } = plan
    const { frequency, interval, endDate } = recurrence

    // Convert dates to Moment.js objects for easier manipulation
    const momentDay = moment(day)

    if (
      plan.deletedDates?.some((deletedDate) =>
        moment(deletedDate).isSame(momentDay, 'day')
      )
    ) {
      return false
    }

    const momentStartDate = moment(startDate)

    // Calculate the difference in days between the start date and the given day
    const daysDiff = momentDay.diff(momentStartDate, 'days')

    // Check if the given day falls within the recurrence pattern
    switch (frequency) {
      case RecurringPlanFrequencies.WEEKLY:
        return (
          daysDiff % (interval * 7) === 0 &&
          momentDay.isSameOrAfter(momentStartDate) &&
          (!endDate || momentDay.isSameOrBefore(endDate))
        )
      case RecurringPlanFrequencies.BI_WEEKLY:
        return (
          daysDiff % (interval * 14) === 0 &&
          momentDay.isSameOrAfter(momentStartDate) &&
          (!endDate || momentDay.isSameOrBefore(endDate))
        )
      case RecurringPlanFrequencies.MONTHLY:
        return (
          momentDay.date() === momentStartDate.date() &&
          momentDay.isSameOrAfter(momentStartDate) &&
          (!endDate || momentDay.isSameOrBefore(endDate))
        )
      case RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY:
        return (
          recurrence.monthlyByWeekdayConfig &&
          doesDayMatchMonthlyByWeekday(
            day,
            recurrence.monthlyByWeekdayConfig
          ) &&
          momentDay.isSameOrAfter(momentStartDate) &&
          (!endDate || momentDay.isSameOrBefore(endDate))
        )
      default:
        return false
    }
  })
}

/**
 * Gets the effective minutes for a recurring plan on a specific date,
 * accounting for overrides. This is the function to use for all calculations
 * that need to display or calculate with the correct planned minutes.
 */
export const getEffectiveMinutesForRecurringPlan = (
  plan: RecurringPlan,
  date: Date
): number => {
  const override = plan.overrides?.find((o) => {
    // Normalize both dates to start of day in local timezone to avoid timezone/time issues
    const normalizedOverrideDate = moment(o.date).startOf('day')
    const normalizedInputDate = moment(date).startOf('day')
    return normalizedOverrideDate.isSame(normalizedInputDate, 'day')
  })
  return override ? override.minutes : plan.minutes
}

/**
 * Gets the effective note for a recurring plan on a specific date, accounting
 * for overrides.
 */
export const getEffectiveNoteForRecurringPlan = (
  plan: RecurringPlan,
  date: Date
): string | undefined => {
  const override = plan.overrides?.find((o) => {
    // Normalize both dates to start of day in local timezone to avoid timezone/time issues
    const normalizedOverrideDate = moment(o.date).startOf('day')
    const normalizedInputDate = moment(date).startOf('day')
    return normalizedOverrideDate.isSame(normalizedInputDate, 'day')
  })
  return override?.note || plan.note
}

export const plannedMinutesToCurrentDayForMonth = (
  month: number,
  year: number,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
) => {
  const selectedMonth = moment().month(month).year(year)

  const dayOfMonth = selectedMonth.isBefore(moment(), 'month')
    ? selectedMonth.daysInMonth()
    : moment().date()

  let count = 0

  if (selectedMonth.isAfter(moment(), 'month')) {
    return 0
  }

  Array(dayOfMonth)
    .fill(1)
    .forEach((_, i) => {
      const day = selectedMonth.clone().date(i + 1)
      const dayDate = day.toDate()

      const dayPlan = dayPlans.find((plan) =>
        moment(plan.date).isSame(day, 'day')
      )

      const recurringPlansForDay = getPlansIntersectingDay(
        dayDate,
        recurringPlans
      )

      // Get the highest recurring plan for the day, but use effective minutes (with overrides)
      const highestRecurringPlanForDay = recurringPlansForDay
        .map((plan) => ({
          plan,
          effectiveMinutes: getEffectiveMinutesForRecurringPlan(plan, dayDate),
        }))
        .sort((a, b) => b.effectiveMinutes - a.effectiveMinutes)[0]

      if (dayPlan) {
        count += dayPlan.minutes
      } else if (highestRecurringPlanForDay) {
        count += highestRecurringPlanForDay.effectiveMinutes
      }
    })

  return count
}

type ReportQueryResult = {
  month: number
  year: number
  report: ServiceReport
}

export const getReport = (
  years: ServiceReportsByYears,
  report: ServiceReport | undefined
): ReportQueryResult | undefined => {
  if (!report) {
    return
  }
  const month = moment(report.date).month()
  const year = moment(report.date).year()
  if (!years[year] || !years[year][month]) {
    return
  }

  const found = years[year][month].find((r) => r.id === report.id)
  if (!found) {
    return
  }

  return {
    month,
    year,
    report: found,
  }
}

export const getYearsReports = (
  serviceReports: ServiceReportsByYears,
  year: number
): ServiceYear => {
  if (!serviceReports[year]) {
    return {}
  }
  return serviceReports[year]
}

export const getMonthsReports = (
  serviceReports: ServiceReportsByYears,
  month: number | undefined,
  _year: number | undefined
): ServiceReport[] => {
  if (_year === undefined || month === undefined) {
    return []
  }

  const year = getYearsReports(serviceReports, _year)
  if (!year || !year[month]) {
    return []
  }
  return [...year[month]] // Need to return new array so memoization functions doesn't reference existing array
}

export const getServiceYearReports = (
  serviceReports: ServiceReportsByYears,
  serviceYear: number
): ServiceReportsByYears => {
  const result: ServiceReportsByYears = {}
  const first = getYearsReports(serviceReports, serviceYear)
  const firstYear: ServiceYear = {}

  for (let month = 8; month < 12; month++) {
    if (first[month]) {
      firstYear[month] = first[month]
    }
  }
  result[serviceYear] = firstYear

  const second = getYearsReports(serviceReports, serviceYear + 1)
  const secondYear: ServiceYear = {}
  for (let month = 0; month < 8; month++) {
    if (second[month]) {
      secondYear[month] = second[month]
    }
  }
  result[serviceYear + 1] = secondYear

  return result
}
