import { Publisher } from '../types/publisher'
import { ServiceReport } from '../types/serviceReport'
import moment from 'moment'

export const calculateProgress = ({
  hours,
  goalHours,
}: {
  hours: number
  goalHours: number
}) => {
  const percentage = hours / goalHours
  return percentage < 0 ? 0 : percentage <= 1 ? percentage : 1
}

export const calculateHoursRemaining = ({
  hours,
  goalHours,
}: {
  hours: number
  goalHours: number
}) => {
  const remaining = goalHours - hours
  return remaining < 0 ? 0 : remaining > goalHours ? goalHours : remaining
}

export const getTotalHours = (serviceReports: ServiceReport[]): number => {
  const totalMinutes = serviceReports.reduce((accumulator, report) => {
    return accumulator + report.hours * 60 + report.minutes // Convert hours to minutes and accumulate
  }, 0)

  const totalHoursRoundedDown = Math.floor(totalMinutes / 60) // Convert total minutes back to hours and round down

  return totalHoursRoundedDown
}

export const totalHoursForCurrentMonth = (
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

  const totalHoursRoundedDown = Math.floor(totalMinutesForMonth / 60)

  return totalHoursRoundedDown
}

export const getTotalHoursDetailedForSpecificMonth = (
  serviceReports: ServiceReport[],
  month: number,
  year: number
) => {
  const standardHours = standardHoursForSpecificMonth(
    serviceReports,
    month,
    year
  )
  const ldcHours = ldcHoursForSpecificMonth(serviceReports, month, year)
  const otherHours = otherHoursForSpecificMonth(serviceReports, month, year)

  return {
    standard: standardHours,
    ldc: ldcHours,
    other: otherHours,
  }
}

export const totalHoursForSpecificMonth = (
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

  const totalHoursRoundedDown = Math.floor(totalMinutesForMonth / 60)

  return totalHoursRoundedDown
}

export const ldcHoursForSpecificMonth = (
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

  const totalHoursRoundedDown = Math.floor(totalMinutesForMonth / 60)

  return totalHoursRoundedDown
}

type OtherReportsWithMinutes = { tag: string; minutes: number }[]
type OtherReports = { tag: string; hours: number }[]

export const otherHoursForSpecificMonth = (
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

  const otherReportsTotalMinutes =
    taggedReports.reduce<OtherReportsWithMinutes>((accumulator, report) => {
      if (!report.tag) return accumulator

      const existingTag = accumulator.find((item) => item.tag === report.tag)
      if (existingTag) {
        existingTag.minutes += report.hours * 60 + report.minutes
      } else {
        const minutes = report.hours * 60 + report.minutes
        accumulator.push({ tag: report.tag, minutes: minutes })
      }
      return accumulator
    }, [])

  const totalHoursRoundedDown: OtherReports = otherReportsTotalMinutes.map(
    (report) => ({
      tag: report.tag,
      hours: Math.floor(report.minutes / 60),
    })
  )

  return totalHoursRoundedDown
}

export const standardHoursForSpecificMonth = (
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

  const totalHoursRoundedDown = Math.floor(totalMinutesForMonth / 60)

  return totalHoursRoundedDown
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
  // Get the current date
  const currentDate = moment()

  // Get the first day of the next month
  const firstDayOfNextMonth = moment().add(1, 'months').startOf('month')

  // Calculate the number of days left in the current month
  const daysLeftInMonth = firstDayOfNextMonth.diff(currentDate, 'days')

  return daysLeftInMonth
}

export const getTimeAsMinutesForHourglass = (
  publisher: Publisher,
  wentOutForMonth: boolean | null,
  hours: number | null
) => {
  if (publisher === 'publisher') {
    if (wentOutForMonth) {
      return 1
    }
    return 0
  }
  const minutes = (hours || 0) * 60
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

  const totalHoursForServiceYear = getTotalHoursForServiceYear(
    serviceReports,
    serviceYear
  )

  return Math.round(
    (annualGoalHours - totalHoursForServiceYear) / monthsRemaining
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

export const getTotalHoursForServiceYear = (
  serviceReports: ServiceReport[],
  serviceYear: number
) => {
  const reports = reportsForServiceYear(serviceReports, serviceYear)

  const minutes = reports.reduce((prev, current) => {
    return prev + current.hours * 60
  }, 0)

  return Math.floor(minutes / 60)
}
