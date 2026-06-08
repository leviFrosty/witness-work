import type { Category } from '@/types/category'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'
import { momentStoredDate, normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  applyMonthCreditCap,
  getEffectiveMinutesForRecurringPlan,
  getPlansIntersectingDay,
  type MonthlyLoggedBreakdown,
} from '@/lib/serviceReport'
import { isPlanCreditTime } from '@/lib/serviceReportCategory'
import moment from 'moment'

export type ProjectedTotalScope =
  | { kind: 'month'; year: number; month: number }
  | { kind: 'serviceYear'; serviceYear: number }

export type ProjectedTotalState =
  | 'empty'
  | 'logged_over_goal'
  | 'projected_over_goal'
  | 'reachable_gap'
  | 'unreachable_gap'

export type ProjectedTotalInput = {
  scope: ProjectedTotalScope
  today: Date
  goalMinutes: number
  /**
   * Raw (uncapped) logged standard/credit minutes per month in scope. Month
   * scope expects the single matching bucket
   * (`getTotalMinutesDetailedForSpecificMonth`); service-year scope one entry
   * per month with logged time (`getServiceYearMonthlyBreakdowns`). Months
   * without an entry are treated as zero; entries outside the scope are
   * ignored.
   */
  loggedMonths: MonthlyLoggedBreakdown[]
  /**
   * Calendar-day keys (`YYYY-MM-DD`, stored-UTC) for days that already have a
   * logged TimeEntry. A day in this set is fully represented by `loggedMonths`,
   * so its Plans are dropped from the projection — actual time wins over
   * planned for the same day, and counting both would double-count it (issue
   * #366: the current day's plan inflated the projection on top of today's
   * logged time, then vanished the next day once the day fell behind the walk).
   * Omit/empty = no day-level exclusion (every future Plan counts).
   */
  loggedDayKeys?: Set<string>
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  /**
   * Category records used to derive each plan's credit-ness from its
   * `categoryId` at read time (`isPlanCreditTime`). Plans with no/dangling
   * Category forecast Standard.
   */
  categories: Category[]
  /**
   * Resolved monthly credit cap in minutes, or null for unlimited. Applied per
   * month for both scopes — the month is the unit the cap governs; there is no
   * annual cap.
   */
  creditCapMinutes: number | null
  /**
   * Off Days the user marked — passed through so the "is the gap reachable?"
   * heuristic only counts days the user is actually willing to go out.
   */
  offDays?: number[]
  params?: {
    stretchMaxHoursPerDay?: number
  }
}

export type ProjectedTotalResult = {
  loggedMinutes: number
  plannedMinutes: number
  projectedMinutes: number
  goalMinutes: number
  state: ProjectedTotalState
  gapMinutes: number
  overMinutes: number
  /**
   * Additional planned STANDARD minutes required for the projection to reach
   * the goal under the mirror cap semantics. Differs from `gapMinutes` when the
   * goal exceeds the credit cap: added standard time first displaces capped
   * credit 1:1 before the projected total moves, so closing the displayed gap
   * takes more standard time than `goal − projected`. The Assistant sizes its
   * (Standard-only) recommendations with this.
   */
  standardGapMinutes: number
  /**
   * Month scope only: the combined logged+planned buckets and the cap the
   * formula ran on — lets month-scoped consumers (Assistant preview) re-run the
   * projection with hypothetical extra standard minutes via
   * `projectStandardAddition`.
   */
  month?: {
    standard: number
    credit: number
    creditCapMinutes: number | null
  }
}

/**
 * Projected total after adding hypothetical standard minutes on top of an
 * existing projection. Month scope re-runs the mirror formula on the stored
 * buckets (added standard can displace capped credit, so the total may move
 * less than the addition); without buckets (year scope) the addition counts
 * linearly, which matches placing the time in a month where standard counts in
 * full.
 */
export const projectStandardAddition = (
  projection: ProjectedTotalResult,
  additionalStandardMinutes: number
): number => {
  if (!projection.month) {
    return projection.projectedMinutes + additionalStandardMinutes
  }
  const { standard, credit, creditCapMinutes } = projection.month
  return applyMonthCreditCap(
    standard + additionalStandardMinutes,
    credit,
    creditCapMinutes
  )
}

const periodBounds = (
  scope: ProjectedTotalScope
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

const monthKey = (year: number, month: number) => `${year}-${month}`

type PlannedMonthBuckets = { standard: number; credit: number }

/**
 * Sums future planned minutes per month, split into standard/credit by each
 * plan's Category (derived at read time — `isPlanCreditTime`). One winner per
 * day: a Day Plan takes the whole day; otherwise the highest-minutes recurring
 * instance counts. The winner's Type tags the day's whole contribution.
 * Recurring ties on minutes break deterministically — credit beats standard
 * (the conservative forecast: the projection never overpromises), then lowest
 * id — so two devices holding the same plans in different array orders after an
 * iCloud merge project the same number.
 *
 * Days in `loggedDayKeys` are skipped entirely: a day with actual logged time
 * is already counted via `loggedMonths`, so its plan is dropped rather than
 * stacked on top (issue #366). The walk starts at `today`, so this matters
 * mainly for today itself (and any future day the user pre-logged).
 */
const futurePlannedMinutesByMonth = (
  scope: ProjectedTotalScope,
  today: Date,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[],
  categories: Category[],
  loggedDayKeys: Set<string>
): Map<string, PlannedMonthBuckets> => {
  const { start, end } = periodBounds(scope)
  const todayDay = momentStoredDate(normalizeDateForStorage(today))
  const cursor = (todayDay.isAfter(start, 'day') ? todayDay : start).clone()

  const dayPlanByKey = new Map(
    dayPlans.map((p) => [momentStoredDate(p.date).format('YYYY-MM-DD'), p])
  )
  // Credit-ness is per-plan, not per-instance — resolve each recurring plan
  // once instead of per day of the walk.
  const recurringIsCredit = new Map(
    recurringPlans.map((p) => [p.id, isPlanCreditTime(p, categories)])
  )

  const plannedByMonth = new Map<string, PlannedMonthBuckets>()
  while (cursor.isSameOrBefore(end, 'day')) {
    const key = cursor.format('YYYY-MM-DD')
    // A day with actual logged time is already in `loggedMonths`; its plan must
    // not stack on top (issue #366) — actual wins for the day, so skip it.
    if (loggedDayKeys.has(key)) {
      cursor.add(1, 'day')
      continue
    }
    const dayDate = cursor.toDate()
    const dp = dayPlanByKey.get(key)
    let minutes = 0
    let isCredit = false
    if (dp) {
      minutes = dp.minutes
      isCredit = isPlanCreditTime(dp, categories)
    } else {
      const recurringForDay = getPlansIntersectingDay(dayDate, recurringPlans)
      let winner: RecurringPlan | null = null
      for (const plan of recurringForDay) {
        const effective = getEffectiveMinutesForRecurringPlan(plan, dayDate)
        if (effective < minutes) continue
        const credit = recurringIsCredit.get(plan.id) ?? false
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
      if (winner === null) isCredit = false
    }
    if (minutes > 0) {
      const bucketKey = monthKey(cursor.year(), cursor.month())
      const bucket = plannedByMonth.get(bucketKey) ?? {
        standard: 0,
        credit: 0,
      }
      if (isCredit) bucket.credit += minutes
      else bucket.standard += minutes
      plannedByMonth.set(bucketKey, bucket)
    }
    cursor.add(1, 'day')
  }
  return plannedByMonth
}

/** Stretch cap from the recommendation engine — used to decide reachability. */
const DEFAULT_STRETCH_MAX_HOURS_PER_DAY = 6

const eligibleRemainingDays = (
  scope: ProjectedTotalScope,
  today: Date,
  offDays: number[] = []
): number => {
  const { start, end } = periodBounds(scope)
  const todayDay = momentStoredDate(normalizeDateForStorage(today))
  const cursor = (todayDay.isAfter(start, 'day') ? todayDay : start).clone()

  let count = 0
  while (cursor.isSameOrBefore(end, 'day')) {
    if (!offDays.includes(cursor.day())) count++
    cursor.add(1, 'day')
  }
  return count
}

/**
 * A Projected Total is the adjusted total the Service Report would show if
 * every remaining Plan became reality: logged and planned time are combined
 * into standard/credit buckets and run through the same monthly cap formula a
 * finished month gets (`applyMonthCreditCap`), month by month. The returned
 * `plannedMinutes` is the Plans' effective contribution (`projected −
 * loggedAdjusted`), not their raw sum — planned standard time that pushes
 * combined standard past the cap retroactively squeezes out logged credit, and
 * only this mirror accounting keeps the projection a number the report can
 * actually reach. See ADR 0005 and CONTEXT.md → "Projected Total".
 */
export const computeProjectedTotal = (
  input: ProjectedTotalInput
): ProjectedTotalResult => {
  const plannedByMonth = futurePlannedMinutesByMonth(
    input.scope,
    input.today,
    input.dayPlans,
    input.recurringPlans,
    input.categories,
    input.loggedDayKeys ?? new Set()
  )
  const loggedByMonth = new Map(
    input.loggedMonths.map((m) => [monthKey(m.year, m.month), m])
  )
  const cap = input.creditCapMinutes

  const { start, end } = periodBounds(input.scope)
  let logged = 0
  let projected = 0
  let combinedStandard = 0
  let combinedCredit = 0
  const cursor = start.clone()
  while (cursor.isSameOrBefore(end, 'month')) {
    const key = monthKey(cursor.year(), cursor.month())
    const loggedMonth = loggedByMonth.get(key)
    const loggedStandard = loggedMonth?.standard ?? 0
    const loggedCredit = loggedMonth?.credit ?? 0
    const plannedMonth = plannedByMonth.get(key)
    const plannedStandard = plannedMonth?.standard ?? 0
    const plannedCredit = plannedMonth?.credit ?? 0

    combinedStandard += loggedStandard + plannedStandard
    combinedCredit += loggedCredit + plannedCredit
    logged += applyMonthCreditCap(loggedStandard, loggedCredit, cap)
    projected += applyMonthCreditCap(
      loggedStandard + plannedStandard,
      loggedCredit + plannedCredit,
      cap
    )
    cursor.add(1, 'month')
  }

  const planned = projected - logged
  const goal = input.goalMinutes
  const gap = Math.max(0, goal - projected)
  const over = Math.max(0, projected - goal)

  const month =
    input.scope.kind === 'month'
      ? {
          standard: combinedStandard,
          credit: combinedCredit,
          creditCapMinutes: cap,
        }
      : undefined

  // How much MORE standard time reaches the goal. When the goal sits above
  // the cap, only combined standard can carry the projection there — added
  // standard first displaces whatever credit the cap was admitting.
  const standardGap = (() => {
    if (projected >= goal) return 0
    if (month && cap !== null && goal > cap) {
      return Math.max(0, goal - month.standard)
    }
    return goal - projected
  })()

  const state: ProjectedTotalState = (() => {
    if (logged >= goal) return 'logged_over_goal'
    if (projected >= goal) return 'projected_over_goal'
    if (logged === 0 && planned === 0) return 'empty'
    const stretchMinutesPerDay =
      (input.params?.stretchMaxHoursPerDay ??
        DEFAULT_STRETCH_MAX_HOURS_PER_DAY) * 60
    const daysRemaining = eligibleRemainingDays(
      input.scope,
      input.today,
      input.offDays
    )
    const fillable =
      daysRemaining > 0 && gap <= daysRemaining * stretchMinutesPerDay
    return fillable ? 'reachable_gap' : 'unreachable_gap'
  })()

  return {
    loggedMinutes: logged,
    plannedMinutes: planned,
    projectedMinutes: projected,
    goalMinutes: goal,
    state,
    gapMinutes: gap,
    overMinutes: over,
    standardGapMinutes: standardGap,
    month,
  }
}
