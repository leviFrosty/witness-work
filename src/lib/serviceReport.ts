import round from 'lodash/round'
import { Publisher } from '@/types/publisher'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import {
  TimeEntry,
  TimeEntriesByYear,
  TimeEntriesByMonth,
} from '@/types/timeEntry'
import { hasCategory, isLdcEntry } from '@/lib/serviceReportCategory'
import moment from 'moment'
import { monthCreditMaxMinutes } from '@/constants/serviceReports'
import { creditCapMinutesFor } from '@/lib/publisherCapabilities'
import { isStoredDateAnchored, momentStoredDate } from '@/lib/normalizeDate'
import { getServiceYearFromDate, serviceYearOf } from '@/lib/serviceYear'
import { entryMinutes } from '@/lib/entryMinutes'

export { RecurringPlanFrequencies } from '@/types/timeEntry'
export type {
  MonthlyByWeekdayConfig,
  RecurringPlan,
  RecurringPlanOverride,
} from '@/types/timeEntry'

export const isCountableEntry = (entry: TimeEntry) =>
  entry.rollover !== true && entryMinutes(entry) >= 0

export const timeEntryMode = (
  entry: Pick<TimeEntry, 'hours' | 'minutes'>
): 'hours' | 'checkbox' => (entry.hours || entry.minutes ? 'hours' : 'checkbox')

export const getTotalMinutesDetailedForSpecificMonth = (
  monthsReports: TimeEntry[],
  month: number,
  year: number
) => {
  const standard = standardMinutesForSpecificMonth(monthsReports, month, year)
  const ldc = ldcMinutesForSpecificMonth(monthsReports, month, year)
  const other = otherMinutesForSpecificMonth(monthsReports, month, year)

  const reportsForMonth = monthsReports.filter((report) => {
    const m = momentStoredDate(report.date)
    return m.month() === month && m.year() === year
  })

  const otherWithNonCreditMinutes = reportsForMonth.reduce((prev, report) => {
    if (hasCategory(report) && !isLdcEntry(report) && !report.credit) {
      return prev + entryMinutes(report)
    }
    return prev
  }, 0)

  const otherWithCreditMinutes = reportsForMonth.reduce((prev, report) => {
    if (hasCategory(report) && !isLdcEntry(report) && report.credit) {
      return prev + entryMinutes(report)
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

export const applyMonthCreditCap = (
  standardMinutes: number,
  creditMinutes: number,
  creditCapMinutes: number | null
): number =>
  creditCapMinutes === null
    ? standardMinutes + creditMinutes
    : standardMinutes > creditCapMinutes
      ? standardMinutes
      : Math.min(standardMinutes + creditMinutes, creditCapMinutes)

export const monthCreditCapMinutes = (
  publisher?: Publisher,
  creditLimitOverride?: { enabled: boolean; customLimitHours: number }
): number | null =>
  publisher
    ? creditCapMinutesFor(publisher, creditLimitOverride)
    : monthCreditMaxMinutes

export type AdjustedMinutes = {
  value: number

  standard: number

  credit: number
  creditOverage: number
}

export const adjustedMinutesForSpecificMonth = (
  monthsReports: TimeEntry[],
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

  const value = applyMonthCreditCap(
    standard,
    credit,
    monthCreditCapMinutes(publisher, creditLimitOverride)
  )

  return {
    value,
    standard,

    credit: value - standard,
    creditOverage: standard + credit - value,
  }
}

export const ldcMinutesForSpecificMonth = (
  monthsReports: TimeEntry[],
  targetMonth: number,
  targetYear: number
): number => {
  const totalMinutesForMonth = monthsReports
    .filter((report) => {
      const m = momentStoredDate(report.date)
      return (
        m.month() === targetMonth &&
        m.year() === targetYear &&
        isLdcEntry(report)
      )
    })
    .reduce((accumulator, report) => {
      return accumulator + entryMinutes(report)
    }, 0)

  return totalMinutesForMonth
}

export type OtherReports = {
  categoryId?: string

  tag: string
  minutes: number
  credit?: boolean
}[]

export const otherMinutesForSpecificMonth = (
  monthsReports: TimeEntry[],
  targetMonth: number,
  targetYear: number
): OtherReports => {
  const reportsForMonth = monthsReports.filter((report) => {
    const m = momentStoredDate(report.date)
    return m.month() === targetMonth && m.year() === targetYear
  })

  const taggedReports = reportsForMonth.filter(
    (report) => hasCategory(report) && !isLdcEntry(report)
  )

  const otherReportsTotalMinutes = taggedReports.reduce<OtherReports>(
    (accumulator, report) => {
      const groupKey = report.categoryId ?? report.tag
      if (!groupKey) return accumulator

      const existingTag = accumulator.find((item) =>
        report.categoryId
          ? item.categoryId === report.categoryId
          : item.tag === report.tag
      )
      if (existingTag) {
        existingTag.minutes += entryMinutes(report)
      } else {
        const minutes = entryMinutes(report)
        accumulator.push({
          categoryId: report.categoryId,
          tag: report.tag ?? report.categoryId ?? '',
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
  monthsReports: TimeEntry[],
  targetMonth: number,
  targetYear: number
): number => {
  const totalMinutesForMonth = monthsReports
    .filter((report) => {
      const m = momentStoredDate(report.date)
      return (
        m.month() === targetMonth &&
        m.year() === targetYear &&
        !isLdcEntry(report) &&
        !hasCategory(report)
      )
    })
    .reduce((accumulator, report) => {
      return accumulator + entryMinutes(report)
    }, 0)

  return totalMinutesForMonth
}

export type MonthlyLoggedBreakdown = {
  year: number

  month: number
  standard: number
  credit: number
}

export const getServiceYearMonthlyBreakdowns = (
  serviceYearReports: TimeEntriesByYear
): MonthlyLoggedBreakdown[] => {
  const breakdowns: MonthlyLoggedBreakdown[] = []

  for (const year in serviceYearReports) {
    for (const month in serviceYearReports[year]) {
      const monthReports = getMonthsReports(
        serviceYearReports,
        parseInt(month),
        parseInt(year)
      )

      let standardOnly = 0
      let ldc = 0
      let otherWithCredit = 0
      let otherWithoutCredit = 0
      for (const report of monthReports) {
        const m = entryMinutes(report)
        if (isLdcEntry(report)) {
          ldc += m
        } else if (hasCategory(report)) {
          if (report.credit) otherWithCredit += m
          else otherWithoutCredit += m
        } else {
          standardOnly += m
        }
      }

      breakdowns.push({
        year: parseInt(year),
        month: parseInt(month),
        standard: standardOnly + otherWithoutCredit,
        credit: ldc + otherWithCredit,
      })
    }
  }

  return breakdowns
}

export const getLoggedDayKeys = (reports: TimeEntry[]): Set<string> =>
  new Set(
    reports
      .filter(isCountableEntry)
      .map((r) => momentStoredDate(r.date).format('YYYY-MM-DD'))
  )

export const getTotalMinutesForServiceYear = (
  serviceYearReports: TimeEntriesByYear,
  _serviceYear: number,

  publisher?: Publisher | ((target: CalendarMonth) => Publisher),
  creditLimitOverride?: { enabled: boolean; customLimitHours: number }
) => {
  const capFor = (target: CalendarMonth): number | null =>
    monthCreditCapMinutes(
      typeof publisher === 'function' ? publisher(target) : publisher,
      creditLimitOverride
    )

  return getServiceYearMonthlyBreakdowns(serviceYearReports).reduce(
    (minutes, m) =>
      minutes + applyMonthCreditCap(m.standard, m.credit, capFor(m)),
    0
  )
}

export type ServiceYearCategoryBreakdown = {
  standard: number

  ldc: number

  other: OtherReports
}

export const getCategoryBreakdownForServiceYear = (
  serviceYearReports: TimeEntriesByYear
): ServiceYearCategoryBreakdown => {
  let standard = 0
  let ldc = 0
  const other: OtherReports = []

  for (const year in serviceYearReports) {
    for (const month in serviceYearReports[year]) {
      const monthReports = getMonthsReports(
        serviceYearReports,
        parseInt(month),
        parseInt(year)
      )

      for (const report of monthReports) {
        const minutes = entryMinutes(report)
        if (isLdcEntry(report)) {
          ldc += minutes
        } else if (hasCategory(report)) {
          const existing = other.find((item) =>
            report.categoryId
              ? item.categoryId === report.categoryId
              : item.tag === report.tag
          )
          if (existing) {
            existing.minutes += minutes
          } else {
            other.push({
              categoryId: report.categoryId,
              tag: report.tag ?? report.categoryId ?? '',
              minutes,
              credit: report.credit,
            })
          }
        } else {
          standard += minutes
        }
      }
    }
  }

  return { standard, ldc, other }
}

export const getLifetimeHours = (serviceReports: TimeEntry[]): number => {
  return round(getLifetimeMinutes(serviceReports) / 60, 1)
}

export const getLifetimeMinutes = (serviceReports: TimeEntry[]): number => {
  return serviceReports.reduce((sum, report) => sum + entryMinutes(report), 0)
}

export const getEarliestReportDate = (
  serviceReports: TimeEntry[]
): Date | null => {
  if (serviceReports.length === 0) return null
  let earliestMs = Infinity
  for (const report of serviceReports) {
    const ms = new Date(report.date).getTime()
    if (ms < earliestMs) earliestMs = ms
  }
  return earliestMs === Infinity ? null : new Date(earliestMs)
}

export const getServiceYearEndYearsSpan = (
  serviceReports: TimeEntry[],
  nowMoment?: moment.Moment
): number[] => {
  const earliest = getEarliestReportDate(serviceReports)
  if (!earliest) return []

  const earliestMoment = momentStoredDate(earliest)
  const earliestStart = getServiceYearFromDate(earliestMoment)
  const now = nowMoment ?? moment()
  const currentStart = getServiceYearFromDate(now)

  const firstEnd = earliestStart + 1
  const lastEnd = currentStart + 1
  if (lastEnd < firstEnd) return []

  const endYears: number[] = []
  for (let y = firstEnd; y <= lastEnd; y++) endYears.push(y)
  return endYears
}

const storedYearMonth = (date: Date | string) => {
  const m = momentStoredDate(date)
  return { year: m.year(), month: m.month() }
}

export type ServiceYearTotal = {
  minutes: number

  reportCount: number
}

export const getServiceYearTotalsByEndYear = (
  serviceReports: TimeEntry[]
): Map<number, ServiceYearTotal> => {
  const totals = new Map<number, ServiceYearTotal>()
  for (const report of serviceReports) {
    const instant = new Date(report.date)
    const stored = isStoredDateAnchored(instant)
      ? { year: instant.getUTCFullYear(), month: instant.getUTCMonth() }
      : storedYearMonth(report.date)
    const endYear = serviceYearOf(stored) + 1
    const total = totals.get(endYear)
    if (total) {
      total.minutes += entryMinutes(report)
      total.reportCount += 1
    } else {
      totals.set(endYear, { minutes: entryMinutes(report), reportCount: 1 })
    }
  }
  return totals
}

export const getAvailableEarlierEndYears = (
  endYears: number[],
  currentEndYear: number,
  floorYearsBack: number
): number[] => {
  if (endYears.length === 0) return []
  const earliest = Math.min(...endYears)
  const floor = currentEndYear - floorYearsBack
  const upper = earliest - 1
  if (upper < floor) return []
  const present = new Set(endYears)
  const out: number[] = []
  for (let y = upper; y >= floor; y--) {
    if (!present.has(y)) out.push(y)
  }
  return out
}

type ReportQueryResult = {
  month: number
  year: number
  report: TimeEntry
}

export const getReport = (
  years: TimeEntriesByYear,
  report: TimeEntry | undefined
): ReportQueryResult | undefined => {
  if (!report) {
    return
  }
  for (const [year, months] of Object.entries(years)) {
    for (const [month, entries] of Object.entries(months)) {
      const found = entries.find((entry) => entry.id === report.id)
      if (found)
        return { year: Number(year), month: Number(month), report: found }
    }
  }
}

export const getYearsReports = (
  serviceReports: TimeEntriesByYear,
  year: number
): TimeEntriesByMonth => {
  if (!serviceReports[year]) {
    return {}
  }
  return serviceReports[year]
}

export const getMonthsReports = (
  serviceReports: TimeEntriesByYear,
  month: number | undefined,
  _year: number | undefined
): TimeEntry[] => {
  if (_year === undefined || month === undefined) {
    return []
  }

  const year = getYearsReports(serviceReports, _year)
  if (!year || !year[month]) {
    return []
  }
  return [...year[month]]
}
