import moment from 'moment'
import {
  DayPlan,
  MonthlyByWeekdayConfig,
  RecurringPlan,
  RecurringPlanFrequencies,
  RecurringPlanOverride,
} from '@/types/timeEntry'
import { logger } from '@/lib/logger'
import {
  DEFAULT_START_TIME_IN_MINUTES,
  momentStoredDate,
  normalizeDateForStorage,
} from '@/lib/normalizeDate'

// Re-exported for backwards compatibility — canonical home is `types/timeEntry`.
// Consumers historically imported these alongside the recurrence helpers from
// `lib/serviceReport`; re-exporting here keeps their import a single redirect.
export { RecurringPlanFrequencies }
export type { MonthlyByWeekdayConfig, RecurringPlan, RecurringPlanOverride }

// ---------------------------------------------------------------------------
// Recurrence: expanding a Recurring Plan into the dated instances it produces,
// resolving per-day overrides, and reducing a day's plans to a single winner.
//
// This module is the one true home for "does this Recurring Plan fall on this
// day, and what are its effective minutes/note/start-time there?" — previously
// scattered across `lib/serviceReport.ts`.
//
// TZ footgun: every function here takes a *calendar-day* `Date` (a value that
// came through `normalizeDateForStorage`, anchored at noon UTC). A `moment.utc`
// range walk must convert its cursor with `localDayFromUtcCursor`
// (`lib/normalizeDate.ts`) before handing the day in — passing `cursor.toDate()`
// (an instant) lands on the wrong local calendar day in TZs away from UTC.
// ---------------------------------------------------------------------------

/**
 * Single override lookup shared by every effective-* getter: finds the override
 * whose stored calendar day matches `date`. Consolidates what used to be three
 * separate copies of the same `overrides?.find(...)` reduction.
 */
const findOverrideForDay = (
  plan: RecurringPlan,
  date: Date
): RecurringPlanOverride | undefined => {
  const targetDay = momentStoredDate(normalizeDateForStorage(date))
  return plan.overrides?.find((o) =>
    momentStoredDate(o.date).isSame(targetDay, 'day')
  )
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
  const override = findOverrideForDay(plan, date)
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
  const override = findOverrideForDay(plan, date)
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
  const override = findOverrideForDay(plan, date)
  return (
    override?.startTimeInMinutes ??
    plan.startTimeInMinutes ??
    DEFAULT_START_TIME_IN_MINUTES
  )
}

/**
 * The single winning planned contribution for one calendar day.
 *
 * Resolution rule (the one true reduction, previously re-derived per consumer):
 * a Day Plan present for the day wins the whole day outright; otherwise the
 * recurring instance with the highest effective minutes wins. Recurring ties on
 * minutes break deterministically — credit beats standard (the conservative
 * forecast), then lowest id — so two devices holding the same plans in
 * different array orders after an iCloud merge resolve the same winner.
 *
 * `isCredit` is only meaningful when the caller supplies the credit predicates;
 * callers that don't care about credit (the UI's minutes-only reductions) can
 * omit them and read `minutes` alone.
 */
export type DayPlanWinner = {
  source: 'day' | 'recurring'
  plan: DayPlan | RecurringPlan
  minutes: number
  isCredit: boolean
}

export const resolveDayPlanWinner = (
  day: Date,
  dayPlan: DayPlan | undefined,
  recurringPlans: RecurringPlan[],
  opts?: {
    /** Credit-ness of the Day Plan, when one is present. Default false. */
    dayPlanIsCredit?: boolean
    /** Per-plan credit-ness for recurring instances. Default () => false. */
    recurringIsCredit?: (plan: RecurringPlan) => boolean
  }
): DayPlanWinner | null => {
  // A Day Plan takes the whole day — even at zero minutes — matching the
  // projection's and `plannedMinutesToCurrentDayForMonth`'s `if (dayPlan)`
  // precedence. Callers gate on `minutes > 0` themselves where needed.
  if (dayPlan) {
    return {
      source: 'day',
      plan: dayPlan,
      minutes: dayPlan.minutes,
      isCredit: opts?.dayPlanIsCredit ?? false,
    }
  }

  const recurringForDay = getPlansIntersectingDay(day, recurringPlans)
  let winner: RecurringPlan | null = null
  let minutes = 0
  let isCredit = false
  for (const plan of recurringForDay) {
    const effective = getEffectiveMinutesForRecurringPlan(plan, day)
    if (effective < minutes) continue
    const credit = opts?.recurringIsCredit?.(plan) ?? false
    const beats =
      effective > minutes ||
      winner === null ||
      (credit && !isCredit) ||
      (credit === isCredit && plan.id < winner.id)
    if (beats) {
      minutes = effective
      winner = plan
      isCredit = credit
    }
  }

  if (!winner) return null
  return { source: 'recurring', plan: winner, minutes, isCredit }
}

export const plannedMinutesThroughDayForMonth = (
  month: number,
  year: number,
  throughDay: number,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
) => {
  const selectedMonth = moment({ year, month, date: 1 }).startOf('month')
  const dayOfMonth = Math.max(
    0,
    Math.min(throughDay, selectedMonth.daysInMonth())
  )

  let count = 0

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

      const winner = resolveDayPlanWinner(dayDate, dayPlan, recurringPlans)
      if (winner) {
        count += winner.minutes
      }
    })

  return count
}

export const plannedMinutesToCurrentDayForMonth = (
  month: number,
  year: number,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
) => {
  const currentDay = moment()
  const selectedMonth = moment({ year, month, date: 1 }).startOf('month')

  if (selectedMonth.isAfter(currentDay, 'month')) {
    return 0
  }

  const dayOfMonth = selectedMonth.isBefore(currentDay, 'month')
    ? selectedMonth.daysInMonth()
    : currentDay.date()

  return plannedMinutesThroughDayForMonth(
    month,
    year,
    dayOfMonth,
    dayPlans,
    recurringPlans
  )
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
