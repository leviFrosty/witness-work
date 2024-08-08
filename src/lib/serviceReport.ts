import _ from 'lodash'
import { Publisher } from '../types/publisher'
import {
  ServiceReport,
  ServiceReportsByYears,
  ServiceYear,
} from '../types/serviceReport'
import moment from 'moment'
import { DayPlan } from '../stores/serviceReport'
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
 */
export const adjustedMinutesForSpecificMonth = (
  monthsReports: ServiceReport[],
  targetMonth: number,
  targetYear: number
): AdjustedMinutes => {
  const { credit, standard } = getTotalMinutesDetailedForSpecificMonth(
    monthsReports,
    targetMonth,
    targetYear
  )

  let minutes = 0
  let creditOverage = 0

  if (standard > monthCreditMaxMinutes) {
    minutes = standard
    if (credit) {
      creditOverage = credit
    }
  } else {
    const standardWithCredit = standard + credit
    if (standardWithCredit > monthCreditMaxMinutes) {
      minutes = monthCreditMaxMinutes
      creditOverage = standardWithCredit - monthCreditMaxMinutes
    } else {
      minutes = standardWithCredit
    }
  }

  return {
    value: minutes,
    standard,
    credit:
      standard < monthCreditMaxMinutes
        ? credit < monthCreditMaxMinutes - standard
          ? credit
          : monthCreditMaxMinutes - standard
        : 0,
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
}

export type RecurringPlan = {
  id: string
  startDate: Date
  minutes: number
  recurrence: {
    frequency: RecurringPlanFrequencies
    interval: number
    endDate: Date | null
  }
  note?: string
  deletedDates?: Date[]
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
          momentDay.date() === startDate.getDate() &&
          momentDay.isSameOrAfter(momentStartDate) &&
          (!endDate || momentDay.isSameOrBefore(endDate))
        )
      default:
        return false
    }
  })
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

      const dayPlan = dayPlans.find((plan) =>
        moment(plan.date).isSame(day, 'day')
      )

      const recurringPlansForDay = getPlansIntersectingDay(
        day.toDate(),
        recurringPlans
      )

      const highestRecurringPlanForDay = recurringPlansForDay.sort(
        (a, b) => b.minutes - a.minutes
      )[0]

      if (dayPlan) {
        count += dayPlan.minutes
      } else if (highestRecurringPlanForDay) {
        count += highestRecurringPlanForDay.minutes
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
