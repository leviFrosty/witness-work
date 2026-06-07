import type { DayPlan, RecurringPlan } from '@/types/timeEntry'
import { momentStoredDate, normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  applyMonthCreditCap,
  getEffectiveMinutesForRecurringPlan,
  getPlansIntersectingDay,
  type MonthlyLoggedBreakdown,
} from '@/lib/serviceReport'
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
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
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

/**
 * Sums future planned minutes per month. One winner per day: a Day Plan takes
 * the whole day; otherwise the highest-minutes recurring instance counts.
 */
const futurePlannedMinutesByMonth = (
  scope: ProjectedTotalScope,
  today: Date,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): Map<string, number> => {
  const { start, end } = periodBounds(scope)
  const todayDay = momentStoredDate(normalizeDateForStorage(today))
  const cursor = (todayDay.isAfter(start, 'day') ? todayDay : start).clone()

  const dayPlanByKey = new Map(
    dayPlans.map((p) => [momentStoredDate(p.date).format('YYYY-MM-DD'), p])
  )

  const plannedByMonth = new Map<string, number>()
  while (cursor.isSameOrBefore(end, 'day')) {
    const key = cursor.format('YYYY-MM-DD')
    const dp = dayPlanByKey.get(key)
    let minutes = 0
    if (dp) {
      minutes = dp.minutes
    } else {
      const recurringForDay = getPlansIntersectingDay(
        cursor.toDate(),
        recurringPlans
      )
      minutes = recurringForDay.reduce(
        (max, plan) =>
          Math.max(
            max,
            getEffectiveMinutesForRecurringPlan(plan, cursor.toDate())
          ),
        0
      )
    }
    if (minutes > 0) {
      const bucket = monthKey(cursor.year(), cursor.month())
      plannedByMonth.set(bucket, (plannedByMonth.get(bucket) ?? 0) + minutes)
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
    input.recurringPlans
  )
  const loggedByMonth = new Map(
    input.loggedMonths.map((m) => [monthKey(m.year, m.month), m])
  )
  const cap = input.creditCapMinutes

  const { start, end } = periodBounds(input.scope)
  let logged = 0
  let projected = 0
  const cursor = start.clone()
  while (cursor.isSameOrBefore(end, 'month')) {
    const key = monthKey(cursor.year(), cursor.month())
    const loggedMonth = loggedByMonth.get(key)
    const loggedStandard = loggedMonth?.standard ?? 0
    const loggedCredit = loggedMonth?.credit ?? 0
    const plannedStandard = plannedByMonth.get(key) ?? 0

    logged += applyMonthCreditCap(loggedStandard, loggedCredit, cap)
    projected += applyMonthCreditCap(
      loggedStandard + plannedStandard,
      loggedCredit,
      cap
    )
    cursor.add(1, 'month')
  }

  const planned = projected - logged
  const goal = input.goalMinutes
  const gap = Math.max(0, goal - projected)
  const over = Math.max(0, projected - goal)

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
  }
}
