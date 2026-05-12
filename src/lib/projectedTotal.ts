import type { DayPlan, RecurringPlan } from '../types/serviceReport'
import { momentStoredDate, normalizeDateForStorage } from './normalizeDate'
import {
  getEffectiveMinutesForRecurringPlan,
  getPlansIntersectingDay,
} from './serviceReport'
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
  loggedAdjustedMinutes: number
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  /** Resolved credit cap in minutes, or null for unlimited. */
  creditCapMinutes: number | null
  excludedWeekdays?: number[]
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

const futurePlannedMinutes = (
  scope: ProjectedTotalScope,
  today: Date,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): number => {
  const { start, end } = periodBounds(scope)
  const todayDay = momentStoredDate(normalizeDateForStorage(today))
  const cursor = (todayDay.isAfter(start, 'day') ? todayDay : start).clone()

  const dayPlanByKey = new Map(
    dayPlans.map((p) => [momentStoredDate(p.date).format('YYYY-MM-DD'), p])
  )

  let sum = 0
  while (cursor.isSameOrBefore(end, 'day')) {
    const key = cursor.format('YYYY-MM-DD')
    const dp = dayPlanByKey.get(key)
    if (dp) {
      sum += dp.minutes
    } else {
      const recurringForDay = getPlansIntersectingDay(
        cursor.toDate(),
        recurringPlans
      )
      const highest = recurringForDay.reduce(
        (max, plan) =>
          Math.max(
            max,
            getEffectiveMinutesForRecurringPlan(plan, cursor.toDate())
          ),
        0
      )
      sum += highest
    }
    cursor.add(1, 'day')
  }
  return sum
}

/** Stretch cap from the recommendation engine — used to decide reachability. */
const DEFAULT_STRETCH_MAX_HOURS_PER_DAY = 6

const eligibleRemainingDays = (
  scope: ProjectedTotalScope,
  today: Date,
  excludedWeekdays: number[] = []
): number => {
  const { start, end } = periodBounds(scope)
  const todayDay = momentStoredDate(normalizeDateForStorage(today))
  const cursor = (todayDay.isAfter(start, 'day') ? todayDay : start).clone()

  let count = 0
  while (cursor.isSameOrBefore(end, 'day')) {
    if (!excludedWeekdays.includes(cursor.day())) count++
    cursor.add(1, 'day')
  }
  return count
}

export const computeProjectedTotal = (
  input: ProjectedTotalInput
): ProjectedTotalResult => {
  const rawPlanned = futurePlannedMinutes(
    input.scope,
    input.today,
    input.dayPlans,
    input.recurringPlans
  )

  const logged = input.loggedAdjustedMinutes
  const cap = input.creditCapMinutes
  const planned =
    cap !== null ? Math.max(0, Math.min(rawPlanned, cap - logged)) : rawPlanned
  const projected = logged + planned
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
      input.excludedWeekdays
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
