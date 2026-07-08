import round from 'lodash/round'
import { Publisher } from '@/types/publisher'
import {
  TimeEntry,
  TimeEntriesByYear,
  TimeEntriesByMonth,
} from '@/types/timeEntry'
import { hasCategory, isLdcEntry } from '@/lib/serviceReportCategory'
import moment from 'moment'
import { monthCreditMaxMinutes } from '@/constants/serviceReports'
import { creditCapMinutesFor } from '@/lib/publisherCapabilities'
import { momentStoredDate } from '@/lib/normalizeDate'
import { getServiceYearFromDate } from '@/lib/serviceYear'

// Re-exported for backwards compatibility — canonical home is `types/timeEntry`.
// Recurrence helpers that used to live here now live in `@/lib/recurrence`;
// Service-Year helpers in `@/lib/serviceYear`.
export { RecurringPlanFrequencies } from '@/types/timeEntry'
export type {
  MonthlyByWeekdayConfig,
  RecurringPlan,
  RecurringPlanOverride,
} from '@/types/timeEntry'

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
  // "Other" deliberately excludes LDC entries — LDC has its own visual slice
  // in the breakdown via `ldcMinutesForSpecificMonth`, and double-counting it
  // here would inflate the credit total.
  const otherWithNonCreditMinutes = reportsForMonth.reduce((prev, report) => {
    if (hasCategory(report) && !isLdcEntry(report) && !report.credit) {
      return prev + report.hours * 60 + report.minutes
    }
    return prev
  }, 0)

  const otherWithCreditMinutes = reportsForMonth.reduce((prev, report) => {
    if (hasCategory(report) && !isLdcEntry(report) && report.credit) {
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

/**
 * The monthly credit-cap formula every Service Report total runs through:
 * standard time always counts in full (it can exceed the cap on its own);
 * credit only fills whatever headroom remains under the cap. `null` cap means
 * unlimited (special pioneer / circuit overseer / user override).
 *
 * Single source of the formula — `adjustedMinutesForSpecificMonth`,
 * `getTotalMinutesForServiceYear`, and the Projected Total
 * (`src/lib/projectedTotal.ts`) all defer here so a projection can never
 * disagree with the report it mirrors (ADR 0005).
 */
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

  // Effective credit cap is derived once, in publisherCapabilities — both
  // role defaults (specialPioneer/circuitOverseer = unlimited) and the
  // user's override live behind that single seam.
  const effectiveCreditLimitMinutes = publisher
    ? creditCapMinutesFor(publisher, creditLimitOverride)
    : monthCreditMaxMinutes

  const value = applyMonthCreditCap(
    standard,
    credit,
    effectiveCreditLimitMinutes
  )

  return {
    value,
    standard,
    // Credit that made it into the value vs. credit the cap squeezed out.
    // `value` is always ≥ standard, so both deltas are non-negative.
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
      return accumulator + report.hours * 60 + report.minutes
    }, 0)

  return totalMinutesForMonth
}

/**
 * Per-Category aggregation row used by the breakdown UI. `categoryId` is the
 * canonical key after the tag → Category refactor; `tag` is the user-visible
 * label sourced from the Category record's `name` (or the legacy `tag` string
 * for unmigrated entries).
 */
type OtherReports = {
  /**
   * Stable id of the underlying Category record, or undefined for unmigrated
   * entries.
   */
  categoryId?: string
  /** Display label — Category name (post-migration) or legacy tag string. */
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
  // LDC entries are surfaced via their own breakdown slice (see
  // `ldcMinutesForSpecificMonth`); exclude them from "other" so the LDC
  // builtin doesn't appear as a duplicate row in the user Categories list.
  const taggedReports = reportsForMonth.filter(
    (report) => hasCategory(report) && !isLdcEntry(report)
  )

  const otherReportsTotalMinutes = taggedReports.reduce<OtherReports>(
    (accumulator, report) => {
      // Prefer grouping by categoryId so two entries pointing at the same
      // Category record always collapse into one row even if their stored
      // labels disagree (e.g. one was edited after the rename). Fall back to
      // the legacy `tag` string for unmigrated entries.
      const groupKey = report.categoryId ?? report.tag
      if (!groupKey) return accumulator

      const existingTag = accumulator.find((item) =>
        report.categoryId
          ? item.categoryId === report.categoryId
          : item.tag === report.tag
      )
      if (existingTag) {
        existingTag.minutes += report.hours * 60 + report.minutes
      } else {
        const minutes = report.hours * 60 + report.minutes
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

/**
 * Raw standard/credit logged minutes for one calendar month, before any credit
 * cap is applied. Produced by `getServiceYearMonthlyBreakdowns` and consumed by
 * the Projected Total (`src/lib/projectedTotal.ts`), which runs the cap formula
 * per month on the combined logged + planned buckets.
 */
export type MonthlyLoggedBreakdown = {
  year: number
  /** 0-indexed month, 0-11. */
  month: number
  standard: number
  credit: number
}

/**
 * Walks a service year's report buckets and returns the raw (uncapped)
 * standard/credit minutes per month. Shared by `getTotalMinutesForServiceYear`
 * and the year-scope Projected Total so both read the months identically.
 */
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

      // Trust the bucket key: `monthReports` are already keyed under
      // (year, month). Re-filtering by `report.date` would also drop entries
      // whose stored UTC calendar day drifts off its bucket (legacy pre-
      // normalization data still in the user's store).
      let standardOnly = 0
      let ldc = 0
      let otherWithCredit = 0
      let otherWithoutCredit = 0
      for (const report of monthReports) {
        const m = report.hours * 60 + report.minutes
        if (isLdcEntry(report)) {
          // LDC keeps its own bucket so visual breakdowns stay separable; the
          // cap math folds it back into the credit total anyway.
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

/**
 * Calendar-day keys (`YYYY-MM-DD`, stored-UTC) for every day with at least one
 * logged TimeEntry. The Projected Total uses this to drop a day's Plans once
 * actual time exists for that day so planned minutes never stack on top of a
 * logged day (issue #366). Keys use the same stored-UTC format the projection's
 * day walk and the Day Plan lookup use, so they line up exactly.
 */
export const getLoggedDayKeys = (reports: TimeEntry[]): Set<string> =>
  new Set(reports.map((r) => momentStoredDate(r.date).format('YYYY-MM-DD')))

export const getTotalMinutesForServiceYear = (
  serviceYearReports: TimeEntriesByYear,
  _serviceYear: number,
  publisher?: Publisher,
  creditLimitOverride?: { enabled: boolean; customLimitHours: number }
) => {
  // Same effective-cap resolution as `adjustedMinutesForSpecificMonth`: role
  // defaults and the user's override live behind `creditCapMinutesFor`;
  // callers that don't know the publisher keep the legacy 55h default.
  const effectiveCreditLimitMinutes = publisher
    ? creditCapMinutesFor(publisher, creditLimitOverride)
    : monthCreditMaxMinutes

  return getServiceYearMonthlyBreakdowns(serviceYearReports).reduce(
    (minutes, m) =>
      minutes +
      applyMonthCreditCap(m.standard, m.credit, effectiveCreditLimitMinutes),
    0
  )
}

// ---------------------------------------------------------------------------
// Lifetime / all-time aggregation helpers
//
// Used by the Progress screen's "All-time" tab (LifetimeHoursCard +
// YearByYearList). These helpers operate over a FLAT `TimeEntry[]`
// (callers flatten the store's `TimeEntriesByYear` before passing it in)
// so they stay pure and easy to test. Lifetime hours are intentionally the
// RAW sum of `hours + minutes/60` across every report — i.e. NOT adjusted for
// the monthly credit cap. The surrounding UI shows an "unadjusted" info
// affordance so the number's meaning stays clear.
// ---------------------------------------------------------------------------

/**
 * Raw lifetime hours across every `TimeEntry` — unadjusted for credit caps.
 * Rounded to 1 decimal place.
 */
export const getLifetimeHours = (serviceReports: TimeEntry[]): number => {
  return round(getLifetimeMinutes(serviceReports) / 60, 1)
}

/**
 * Raw lifetime minutes across every `TimeEntry` — unadjusted for credit caps.
 * Preferred for rendering, since the display formatter takes minutes.
 */
export const getLifetimeMinutes = (serviceReports: TimeEntry[]): number => {
  return serviceReports.reduce(
    (sum, report) => sum + report.hours * 60 + report.minutes,
    0
  )
}

/** Earliest `date` found across all reports, or `null` if none. */
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

// `getServiceYearEndYearsSpan` and friends below feed `report.date` into
// `getServiceYearFromDate` (which calls `.month()/.year()`). Wrap stored Dates
// in UTC mode so the calendar day is read consistently across device TZs.

/**
 * Continuous span of service-year END years from the earliest report's service
 * year up to the current service year (inclusive).
 *
 * Service-year convention (matches `getServiceYearFromDate`):
 *
 * - Months Jan–Aug (0–7) roll into the PRIOR service year; its end-year is the
 *   calendar year itself.
 * - Months Sep–Dec (8–11) roll into the NEXT service year; its end-year is `year
 *
 *   - 1`.
 *
 * Returns an empty array when there are no reports.
 */
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

  // End-year = start-year + 1 (service year Sep `start` → Aug `start+1`).
  const firstEnd = earliestStart + 1
  const lastEnd = currentStart + 1
  if (lastEnd < firstEnd) return []

  const endYears: number[] = []
  for (let y = firstEnd; y <= lastEnd; y++) endYears.push(y)
  return endYears
}

/**
 * Raw hours summed across reports whose service year matches `endYear` (i.e.
 * the service year ending Aug 31 of `endYear`). Rounded to 1 dp.
 */
export const getHoursForServiceYearEndYear = (
  serviceReports: TimeEntry[],
  endYear: number
): number => {
  return round(getMinutesForServiceYearEndYear(serviceReports, endYear) / 60, 1)
}

/**
 * Raw minutes summed across reports whose service year matches `endYear`.
 * Preferred for rendering so display formatters can respect the user's
 * time-display preference.
 */
export const getMinutesForServiceYearEndYear = (
  serviceReports: TimeEntry[],
  endYear: number
): number => {
  const startYear = endYear - 1
  return serviceReports.reduce((sum, report) => {
    const m = momentStoredDate(report.date)
    const reportStartYear = getServiceYearFromDate(m)
    if (reportStartYear !== startYear) return sum
    return sum + report.hours * 60 + report.minutes
  }, 0)
}

/**
 * Number of reports whose service year matches `endYear`. Distinguishes a year
 * that merely falls inside the rendered span (no entries) from one holding
 * actual entries — even zero-hour placeholders count.
 */
export const getReportCountForServiceYearEndYear = (
  serviceReports: TimeEntry[],
  endYear: number
): number => {
  const startYear = endYear - 1
  return serviceReports.reduce((count, report) => {
    const reportStartYear = getServiceYearFromDate(
      momentStoredDate(report.date)
    )
    return reportStartYear === startYear ? count + 1 : count
  }, 0)
}

/**
 * Compute the list of service-year `endYear`s the user is allowed to backdate
 * into from the All-time tab's "Add earlier year" picker.
 *
 * Range: from `currentEndYear - floorYearsBack` up to (earliest present
 * endYear) - 1, descending. Excludes any year already in `endYears` (defensive;
 * `getServiceYearEndYearsSpan` already returns a continuous span, but we don't
 * want to rely on that contract here).
 *
 * Returns `[]` if `endYears` is empty or if every candidate year is already
 * present / below the floor.
 */
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
  const m = momentStoredDate(report.date)
  const month = m.month()
  const year = m.year()
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
  return [...year[month]] // Need to return new array so memoization functions doesn't reference existing array
}
