import _ from 'lodash'
import { Publisher } from '@/types/publisher'
import {
  DayPlan,
  MonthlyByWeekdayConfig,
  RecurringPlan,
  RecurringPlanFrequencies,
  RecurringPlanOverride,
  ServiceReport,
  ServiceReportsByYears,
  ServiceYear,
} from '@/types/serviceReport'
import { hasCategory, isLdcEntry } from '@/lib/serviceReportCategory'
import moment from 'moment'
import { monthCreditMaxMinutes } from '@/constants/serviceReports'
import { creditCapMinutesFor, getEntryMode } from '@/lib/publisherCapabilities'
import { logger } from '@/lib/logger'
import {
  DEFAULT_START_TIME_IN_MINUTES,
  momentStoredDate,
  normalizeDateForStorage,
} from '@/lib/normalizeDate'

// Re-exported for backwards compatibility — canonical home is `types/serviceReport`.
export { RecurringPlanFrequencies }
export type { MonthlyByWeekdayConfig, RecurringPlan, RecurringPlanOverride }

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

  // Effective credit cap is derived once, in publisherCapabilities — both
  // role defaults (specialPioneer/circuitOverseer = unlimited) and the
  // user's override live behind that single seam.
  const effectiveCreditLimitMinutes = publisher
    ? creditCapMinutesFor(publisher, creditLimitOverride)
    : monthCreditMaxMinutes

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
    .filter((report) => {
      const m = momentStoredDate(report.date)
      return (
        m.month() === targetMonth &&
        m.year() === targetYear &&
        m.date() <= targetDay
      )
    })
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
  monthsReports: ServiceReport[],
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
  monthsReports: ServiceReport[],
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

export const getTimeAsMinutesForHourglass = (
  publisher: Publisher,
  wentOutForMonth: boolean | null,
  minutes: number | null
) => {
  if (getEntryMode(publisher) === 'checkbox') {
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
          // cap math below folds it back into the credit total anyway.
          ldc += m
        } else if (hasCategory(report)) {
          if (report.credit) otherWithCredit += m
          else otherWithoutCredit += m
        } else {
          standardOnly += m
        }
      }

      const standard = standardOnly + otherWithoutCredit
      const credit = ldc + otherWithCredit
      const limit = monthCreditMaxMinutes
      const monthMinutes =
        standard > limit ? standard : Math.min(standard + credit, limit)

      minutes += monthMinutes
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

// ---------------------------------------------------------------------------
// Lifetime / all-time aggregation helpers
//
// Used by the Progress screen's "All-time" tab (LifetimeHoursCard +
// YearByYearList). These helpers operate over a FLAT `ServiceReport[]`
// (callers flatten the store's `ServiceReportsByYears` before passing it in)
// so they stay pure and easy to test. Lifetime hours are intentionally the
// RAW sum of `hours + minutes/60` across every report — i.e. NOT adjusted for
// the monthly credit cap. The surrounding UI shows an "unadjusted" info
// affordance so the number's meaning stays clear.
// ---------------------------------------------------------------------------

/**
 * Raw lifetime hours across every `ServiceReport` — unadjusted for credit caps.
 * Rounded to 1 decimal place.
 */
export const getLifetimeHours = (serviceReports: ServiceReport[]): number => {
  return _.round(getLifetimeMinutes(serviceReports) / 60, 1)
}

/**
 * Raw lifetime minutes across every `ServiceReport` — unadjusted for credit
 * caps. Preferred for rendering, since the display formatter takes minutes.
 */
export const getLifetimeMinutes = (serviceReports: ServiceReport[]): number => {
  return serviceReports.reduce(
    (sum, report) => sum + report.hours * 60 + report.minutes,
    0
  )
}

/** Earliest `date` found across all reports, or `null` if none. */
export const getEarliestReportDate = (
  serviceReports: ServiceReport[]
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
  serviceReports: ServiceReport[],
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
  serviceReports: ServiceReport[],
  endYear: number
): number => {
  return _.round(
    getMinutesForServiceYearEndYear(serviceReports, endYear) / 60,
    1
  )
}

/**
 * Raw minutes summed across reports whose service year matches `endYear`.
 * Preferred for rendering so display formatters can respect the user's
 * time-display preference.
 */
export const getMinutesForServiceYearEndYear = (
  serviceReports: ServiceReport[],
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

// Helper function to check if a date matches a monthly by weekday pattern.
// Caller is responsible for passing a calendar-day Date that's already been
// normalized via `normalizeDateForStorage`; this fn reads it via UTC mode.
const doesDayMatchMonthlyByWeekday = (
  day: Date,
  config: MonthlyByWeekdayConfig
): boolean => {
  const momentDay = momentStoredDate(day)
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
  // `day` is whatever the caller had — often a local-mode Date built from
  // `selectedMonth.clone().date(i+1).toDate()`. Normalize it so it sits on the
  // same noon-UTC anchor as the stored plan dates, then read everything in
  // UTC mode. This is what makes recurrence math TZ-stable: in NZDT (+13) a
  // local-mode `diff` against a noon-UTC startDate would silently round to a
  // negative day count and miss every weekly occurrence.
  const normalizedDay = normalizeDateForStorage(day)
  const momentDay = momentStoredDate(normalizedDay)

  return plans.filter((plan) => {
    const { startDate, recurrence } = plan
    const { frequency, interval, endDate } = recurrence

    if (
      plan.deletedDates?.some((deletedDate) =>
        momentStoredDate(deletedDate).isSame(momentDay, 'day')
      )
    ) {
      return false
    }

    const momentStartDate = momentStoredDate(startDate)
    const momentEndDate = endDate ? momentStoredDate(endDate) : null

    // Calculate the difference in days between the start date and the given day
    const daysDiff = momentDay.diff(momentStartDate, 'days')

    // Check if the given day falls within the recurrence pattern
    switch (frequency) {
      case RecurringPlanFrequencies.WEEKLY:
        return (
          daysDiff % (interval * 7) === 0 &&
          momentDay.isSameOrAfter(momentStartDate) &&
          (!momentEndDate || momentDay.isSameOrBefore(momentEndDate))
        )
      case RecurringPlanFrequencies.BI_WEEKLY:
        return (
          daysDiff % (interval * 14) === 0 &&
          momentDay.isSameOrAfter(momentStartDate) &&
          (!momentEndDate || momentDay.isSameOrBefore(momentEndDate))
        )
      case RecurringPlanFrequencies.MONTHLY:
        return (
          momentDay.date() === momentStartDate.date() &&
          momentDay.isSameOrAfter(momentStartDate) &&
          (!momentEndDate || momentDay.isSameOrBefore(momentEndDate))
        )
      case RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY:
        return (
          recurrence.monthlyByWeekdayConfig &&
          doesDayMatchMonthlyByWeekday(
            normalizedDay,
            recurrence.monthlyByWeekdayConfig
          ) &&
          momentDay.isSameOrAfter(momentStartDate) &&
          (!momentEndDate || momentDay.isSameOrBefore(momentEndDate))
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
  const targetDay = momentStoredDate(normalizeDateForStorage(date))
  const override = plan.overrides?.find((o) =>
    momentStoredDate(o.date).isSame(targetDay, 'day')
  )
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
  const targetDay = momentStoredDate(normalizeDateForStorage(date))
  const override = plan.overrides?.find((o) =>
    momentStoredDate(o.date).isSame(targetDay, 'day')
  )
  return override?.note || plan.note
}

/**
 * Gets the effective start time (minutes since midnight) for a recurring plan
 * on a specific date, accounting for overrides. Falls back to noon (720) when
 * neither the override nor the plan has a stored time.
 */
export const getEffectiveStartTimeInMinutesForRecurringPlan = (
  plan: RecurringPlan,
  date: Date
): number => {
  const targetDay = momentStoredDate(normalizeDateForStorage(date))
  const override = plan.overrides?.find((o) =>
    momentStoredDate(o.date).isSame(targetDay, 'day')
  )
  return (
    override?.startTimeInMinutes ??
    plan.startTimeInMinutes ??
    DEFAULT_START_TIME_IN_MINUTES
  )
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
        momentStoredDate(plan.date).isSame(
          momentStoredDate(normalizeDateForStorage(dayDate)),
          'day'
        )
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

/**
 * Optimized calculation for planned minutes up to current day using
 * pre-computed recurring plans.
 */
export const calculatePlannedMinutesToCurrentDayOptimized = (
  month: number,
  year: number,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): number => {
  const perfStart = performance.now()
  const selectedMonth = moment().month(month).year(year)

  const dayOfMonth = selectedMonth.isBefore(moment(), 'month')
    ? selectedMonth.daysInMonth()
    : moment().date()

  if (selectedMonth.isAfter(moment(), 'month')) {
    return 0
  }

  logger.log(
    `[calculateCurrentDayOptimized] Calculating for ${selectedMonth.format('MMMM YYYY')} up to day ${dayOfMonth} with ${dayPlans.length} day plans and ${recurringPlans.length} recurring plans`
  )

  // Create day plan lookup map for O(1) access
  const dayPlanMap = new Map(
    dayPlans.map((p) => [momentStoredDate(p.date).format('YYYY-MM-DD'), p])
  )
  logger.log(
    `[calculateCurrentDayOptimized] Created day plan map with ${dayPlanMap.size} entries`
  )

  // Pre-compute recurring plans for the range
  const minDate = selectedMonth.clone().startOf('month')
  const maxDate = selectedMonth.clone().date(dayOfMonth)
  const recurringPlanCache = precomputeRecurringPlansForRange(
    recurringPlans,
    minDate,
    maxDate
  )

  let count = 0

  for (let i = 0; i < dayOfMonth; i++) {
    const day = selectedMonth.clone().date(i + 1)
    const dayKey = day.format('YYYY-MM-DD')

    const dayPlan = dayPlanMap.get(dayKey)

    if (dayPlan) {
      count += dayPlan.minutes
    } else {
      // Get pre-computed recurring plans for this day
      const recurringPlansForDay = recurringPlanCache.get(dayKey) || []

      // Find the highest minutes value
      const highestMinutes = recurringPlansForDay.reduce(
        (max, p) => Math.max(max, p.effectiveMinutes),
        0
      )

      count += highestMinutes
    }
  }

  logger.log(
    `[calculateCurrentDayOptimized] Completed in ${(performance.now() - perfStart).toFixed(2)}ms - total minutes: ${count}`
  )

  return count
}

/**
 * Generates a stable hash of plans to detect if cache needs invalidation. This
 * is a simple hash based on plan count and last modified times.
 */
export const generatePlanHash = (
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): string => {
  const dayPlanIds = dayPlans
    .map((p) => p.id)
    .sort()
    .join(',')
  const recurringPlanIds = recurringPlans
    .map((p) => p.id)
    .sort()
    .join(',')
  return `d:${dayPlans.length}:${dayPlanIds}|r:${recurringPlans.length}:${recurringPlanIds}`
}

/**
 * Pre-computes all recurring plan occurrences for a given date range. Returns a
 * Map where key is date string (YYYY-MM-DD) and value is array of plans with
 * effective minutes.
 */
export const precomputeRecurringPlansForRange = (
  recurringPlans: RecurringPlan[],
  minDate: moment.Moment,
  maxDate: moment.Moment
): Map<string, { plan: RecurringPlan; effectiveMinutes: number }[]> => {
  const perfStart = performance.now()
  const cache = new Map<
    string,
    { plan: RecurringPlan; effectiveMinutes: number }[]
  >()

  logger.log(
    `[precomputeRecurringPlans] Starting pre-computation for ${recurringPlans.length} plans from ${minDate.format('YYYY-MM-DD')} to ${maxDate.format('YYYY-MM-DD')}`
  )

  recurringPlans.forEach((plan) => {
    const current = minDate.clone()

    while (current.isSameOrBefore(maxDate)) {
      const currentDate = current.toDate()
      const plansForDay = getPlansIntersectingDay(currentDate, [plan])

      if (plansForDay.length > 0) {
        const key = current.format('YYYY-MM-DD')
        const existing = cache.get(key) || []
        existing.push({
          plan,
          effectiveMinutes: getEffectiveMinutesForRecurringPlan(
            plan,
            currentDate
          ),
        })
        cache.set(key, existing)
      }

      current.add(1, 'd')
    }
  })

  logger.log(
    `[precomputeRecurringPlans] Completed in ${(performance.now() - perfStart).toFixed(2)}ms - cached ${cache.size} unique dates`
  )

  return cache
}

/**
 * Optimized calculation for monthly planned minutes using pre-computed
 * recurring plans.
 */
export const calculateMonthlyPlannedMinutesOptimized = (
  month: number,
  year: number,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): number => {
  const perfStart = performance.now()
  const selectedMonth = moment().month(month).year(year)
  const dayOfMonth = selectedMonth.daysInMonth()

  logger.log(
    `[calculateMonthlyOptimized] Calculating for ${selectedMonth.format('MMMM YYYY')} with ${dayPlans.length} day plans and ${recurringPlans.length} recurring plans`
  )

  // Create day plan lookup map for O(1) access
  const dayPlanMap = new Map(
    dayPlans.map((p) => [momentStoredDate(p.date).format('YYYY-MM-DD'), p])
  )
  logger.log(
    `[calculateMonthlyOptimized] Created day plan map with ${dayPlanMap.size} entries`
  )

  // Pre-compute recurring plans for the month
  const minDate = selectedMonth.clone().startOf('month')
  const maxDate = selectedMonth.clone().endOf('month')
  const recurringPlanCache = precomputeRecurringPlansForRange(
    recurringPlans,
    minDate,
    maxDate
  )

  let count = 0

  for (let i = 0; i < dayOfMonth; i++) {
    const day = selectedMonth.clone().date(i + 1)
    const dayKey = day.format('YYYY-MM-DD')

    const dayPlan = dayPlanMap.get(dayKey)

    if (dayPlan) {
      count += dayPlan.minutes
    } else {
      // Get pre-computed recurring plans for this day
      const recurringPlansForDay = recurringPlanCache.get(dayKey) || []

      // Find the highest minutes value
      const highestMinutes = recurringPlansForDay.reduce(
        (max, p) => Math.max(max, p.effectiveMinutes),
        0
      )

      count += highestMinutes
    }
  }

  logger.log(
    `[calculateMonthlyOptimized] Completed in ${(performance.now() - perfStart).toFixed(2)}ms - total minutes: ${count}`
  )

  return count
}

/**
 * Optimized calculation for annual planned minutes using pre-computed recurring
 * plans.
 */
export const calculateAnnualPlannedMinutesOptimized = (
  serviceYear: number,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): number => {
  const perfStart = performance.now()
  const { minDate, maxDate } = serviceYearsDateRange(serviceYear)

  logger.log(
    `[calculateAnnualOptimized] Calculating service year ${serviceYear} (${minDate.format('YYYY-MM-DD')} to ${maxDate.format('YYYY-MM-DD')}) with ${dayPlans.length} day plans and ${recurringPlans.length} recurring plans`
  )

  // Create day plan lookup map for O(1) access
  const dayPlanMap = new Map(
    dayPlans.map((p) => [momentStoredDate(p.date).format('YYYY-MM-DD'), p])
  )
  logger.log(
    `[calculateAnnualOptimized] Created day plan map with ${dayPlanMap.size} entries`
  )

  // Pre-compute recurring plans for the entire year
  const recurringPlanCache = precomputeRecurringPlansForRange(
    recurringPlans,
    minDate,
    maxDate
  )

  let minutes = 0
  const current = minDate.clone()

  while (current.isSameOrBefore(maxDate)) {
    const dayKey = current.format('YYYY-MM-DD')

    const dayPlan = dayPlanMap.get(dayKey)

    if (dayPlan) {
      minutes += dayPlan.minutes
    } else {
      // Get pre-computed recurring plans for this day
      const recurringPlansForDay = recurringPlanCache.get(dayKey) || []

      // Find the highest minutes value
      const highestMinutes = recurringPlansForDay.reduce(
        (max, p) => Math.max(max, p.effectiveMinutes),
        0
      )

      minutes += highestMinutes
    }

    current.add(1, 'd')
  }

  logger.log(
    `[calculateAnnualOptimized] Completed in ${(performance.now() - perfStart).toFixed(2)}ms - total minutes: ${minutes}`
  )

  return minutes
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
