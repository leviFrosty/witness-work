import _ from 'lodash'
import { Publisher } from '../types/publisher'
import { ServiceReport } from '../types/serviceReport'
import moment from 'moment'

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

export const getTotalMinutes = (serviceReports: ServiceReport[]): number => {
  const totalMinutes = serviceReports.reduce((accumulator, report) => {
    return accumulator + report.hours * 60 + report.minutes // Convert hours to minutes and accumulate
  }, 0)

  return totalMinutes
}

export const totalMinutesForCurrentMonth = (
  serviceReports: ServiceReport[]
): number => {
  const currentMonth = moment().month()
  const currentYear = moment().year()

  const totalMinutesForMonth = serviceReports
    .filter(
      (report) =>
        moment(report.date).month() === currentMonth &&
        moment(report.date).year() === currentYear
    )
    .reduce((accumulator, report) => {
      return accumulator + report.hours * 60 + report.minutes
    }, 0)

  return totalMinutesForMonth
}

export const getTotalMinutesDetailedForSpecificMonth = (
  serviceReports: ServiceReport[],
  month: number,
  year: number
) => {
  const standard = standardMinutesForSpecificMonth(serviceReports, month, year)
  const ldc = ldcMinutesForSpecificMonth(serviceReports, month, year)
  const other = otherMinutesForSpecificMonth(serviceReports, month, year)

  return {
    standard: standard,
    ldc: ldc,
    other: other,
  }
}

export const totalMinutesForSpecificMonth = (
  serviceReports: ServiceReport[],
  targetMonth: number,
  targetYear: number
): number => {
  const totalMinutesForMonth = serviceReports
    .filter(
      (report) =>
        moment(report.date).month() === targetMonth &&
        moment(report.date).year() === targetYear
    )
    .reduce((accumulator, report) => {
      return accumulator + report.hours * 60 + report.minutes
    }, 0)

  return totalMinutesForMonth
}

export const ldcMinutesForSpecificMonth = (
  serviceReports: ServiceReport[],
  targetMonth: number,
  targetYear: number
): number => {
  const totalMinutesForMonth = serviceReports
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

type OtherReports = { tag: string; minutes: number }[]

export const otherMinutesForSpecificMonth = (
  serviceReports: ServiceReport[],
  targetMonth: number,
  targetYear: number
): OtherReports => {
  const reportsForMonth = serviceReports.filter((report) => {
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
        accumulator.push({ tag: report.tag, minutes: minutes })
      }
      return accumulator
    },
    []
  )

  return otherReportsTotalMinutes
}

export const standardMinutesForSpecificMonth = (
  serviceReports: ServiceReport[],
  targetMonth: number,
  targetYear: number
): number => {
  const totalMinutesForMonth = serviceReports
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

export const hasServiceReportsForMonth = (
  serviceReports: ServiceReport[],
  month: number,
  year: number
): boolean => {
  const hasReportsForMonth = serviceReports.some(
    (report) =>
      moment(report.date).month() === month &&
      moment(report.date).year() === year
  )

  return hasReportsForMonth
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
  serviceReports: ServiceReport[]
  currentDate: {
    month: number

    year: number
  }
  goalHours: number
  serviceYear: number
}) => {
  const { maxDate } = serviceYearsDateRange(serviceYear)
  const annualGoalHours = goalHours * 12

  const month = moment().month(currentDate.month).year(currentDate.year)

  const monthHasReports = hasServiceReportsForMonth(
    serviceReports,
    currentDate.month,
    currentDate.year
  )

  const monthsRemainingOffset = !monthHasReports ? 1 : 0

  const actualMonthsRemaining =
    moment(maxDate).diff(month, 'months') + monthsRemainingOffset

  const monthsRemaining =
    actualMonthsRemaining === 0 ? 1 : actualMonthsRemaining

  const totalMinutesForServiceYear = getTotalMinutesForServiceYear(
    serviceReports,
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

export const reportsForServiceYear = (
  serviceReports: ServiceReport[],
  serviceYear: number
) => {
  const { minDate, maxDate } = serviceYearsDateRange(serviceYear)

  return serviceReports.filter((report) => {
    return moment(report.date).isBetween(minDate, maxDate, 'day', '[]')
  })
}

export const getTotalMinutesForServiceYear = (
  serviceReports: ServiceReport[],
  serviceYear: number
) => {
  const reports = reportsForServiceYear(serviceReports, serviceYear)

  const minutes = reports.reduce((prev, current) => {
    return prev + current.hours * 60 + current.minutes
  }, 0)

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
