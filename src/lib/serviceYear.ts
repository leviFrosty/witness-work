import moment from 'moment'
import { TimeEntriesByMonth, TimeEntriesByYear } from '@/types/timeEntry'

export type PeriodScope =
  | { kind: 'month'; year: number; month: number }
  | { kind: 'serviceYear'; serviceYear: number }

type YearMonth = { year: number; month: number }

export const serviceYearOf = ({ year, month }: YearMonth): number =>
  month < 8 ? year - 1 : year

export const getServiceYearFromDate = (date: moment.Moment | Date): number => {
  const m = moment.isMoment(date) ? date : moment(date)
  return serviceYearOf({ year: m.year(), month: m.month() })
}

export const serviceYearBounds = (
  serviceYear: number
): { start: moment.Moment; end: moment.Moment } => ({
  start: moment({ year: serviceYear, month: 8, day: 1 }),
  end: moment({ year: serviceYear + 1, month: 7, day: 31 }).endOf('day'),
})

export const isInServiceYear = (
  date: moment.Moment | Date,
  serviceYear: number
): boolean => getServiceYearFromDate(date) === serviceYear

export const serviceYearMonthIndex = (
  { year, month }: YearMonth,
  serviceYear: number
): number => (year - serviceYear) * 12 + month - 8

export const getServiceYearReports = (
  serviceReports: TimeEntriesByYear,
  serviceYear: number
): TimeEntriesByYear => {
  const result: TimeEntriesByYear = {}
  const first = serviceReports[serviceYear]
  const firstYear: TimeEntriesByMonth = {}

  for (let month = 8; month < 12; month++) {
    if (first?.[month]) {
      firstYear[month] = first[month]
    }
  }
  result[serviceYear] = firstYear

  const second = serviceReports[serviceYear + 1]
  const secondYear: TimeEntriesByMonth = {}
  for (let month = 0; month < 8; month++) {
    if (second?.[month]) {
      secondYear[month] = second[month]
    }
  }
  result[serviceYear + 1] = secondYear

  return result
}

export const periodBounds = (
  scope: PeriodScope
): { start: moment.Moment; end: moment.Moment } => {
  if (scope.kind === 'month') {
    const m = moment.utc({ year: scope.year, month: scope.month, day: 1 })
    return { start: m.clone().startOf('month'), end: m.clone().endOf('month') }
  }
  const start = moment.utc({ year: scope.serviceYear, month: 8, day: 1 })
  const end = moment
    .utc({ year: scope.serviceYear + 1, month: 7, day: 1 })
    .endOf('month')
  return { start, end }
}
