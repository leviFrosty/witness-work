import type { Category } from '@/types/category'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'
import {
  localDayFromUtcCursor,
  momentStoredDate,
  normalizeDateForStorage,
} from '@/lib/normalizeDate'
import {
  applyMonthCreditCap,
  type MonthlyLoggedBreakdown,
} from '@/lib/serviceReport'
import { resolvePlannedContributionsForDay } from '@/lib/recurrence'
import { periodBounds } from '@/lib/serviceYear'
import { isPlanCreditTime } from '@/lib/serviceReportCategory'
import type { CalendarMonth } from '@/lib/monthlyGoals'

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

  loggedMonths: MonthlyLoggedBreakdown[]

  loggedDayKeys?: Set<string>
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]

  categories: Category[]

  creditCapMinutes: number | null | ((target: CalendarMonth) => number | null)

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

  standardGapMinutes: number

  months: ProjectedTotalMonth[]

  month?: {
    standard: number
    credit: number
    creditCapMinutes: number | null
  }
}

export type ProjectedTotalMonth = CalendarMonth & {
  loggedMinutes: number

  projectedMinutes: number
}

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

const monthKey = (year: number, month: number) => `${year}-${month}`

type PlannedMonthBuckets = { standard: number; credit: number }

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

  const dayPlansByKey = new Map<string, DayPlan[]>()
  dayPlans.forEach((p) => {
    const key = momentStoredDate(p.date).format('YYYY-MM-DD')
    const existing = dayPlansByKey.get(key)
    if (existing) existing.push(p)
    else dayPlansByKey.set(key, [p])
  })

  const recurringIsCredit = new Map(
    recurringPlans.map((p) => [p.id, isPlanCreditTime(p, categories)])
  )

  const plannedByMonth = new Map<string, PlannedMonthBuckets>()
  while (cursor.isSameOrBefore(end, 'day')) {
    const key = cursor.format('YYYY-MM-DD')

    if (loggedDayKeys.has(key)) {
      cursor.add(1, 'day')
      continue
    }
    const dayDate = localDayFromUtcCursor(cursor)

    const contributions = resolvePlannedContributionsForDay(
      dayDate,
      dayPlansByKey.get(key) ?? [],
      recurringPlans,
      {
        dayPlanIsCredit: (plan) => isPlanCreditTime(plan, categories),
        recurringIsCredit: (plan) => recurringIsCredit.get(plan.id) ?? false,
      }
    )
    for (const contribution of contributions) {
      if (contribution.minutes <= 0) continue
      const bucketKey = monthKey(cursor.year(), cursor.month())
      const bucket = plannedByMonth.get(bucketKey) ?? {
        standard: 0,
        credit: 0,
      }
      if (contribution.isCredit) bucket.credit += contribution.minutes
      else bucket.standard += contribution.minutes
      plannedByMonth.set(bucketKey, bucket)
    }
    cursor.add(1, 'day')
  }
  return plannedByMonth
}

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
  const capFor = (target: CalendarMonth) =>
    typeof input.creditCapMinutes === 'function'
      ? input.creditCapMinutes(target)
      : input.creditCapMinutes

  const { start, end } = periodBounds(input.scope)
  let logged = 0
  let projected = 0
  let combinedStandard = 0
  let combinedCredit = 0
  const months: ProjectedTotalMonth[] = []
  const cursor = start.clone()
  while (cursor.isSameOrBefore(end, 'month')) {
    const target = { year: cursor.year(), month: cursor.month() }
    const cap = capFor(target)
    const key = monthKey(target.year, target.month)
    const loggedMonth = loggedByMonth.get(key)
    const loggedStandard = loggedMonth?.standard ?? 0
    const loggedCredit = loggedMonth?.credit ?? 0
    const plannedMonth = plannedByMonth.get(key)
    const plannedStandard = plannedMonth?.standard ?? 0
    const plannedCredit = plannedMonth?.credit ?? 0

    combinedStandard += loggedStandard + plannedStandard
    combinedCredit += loggedCredit + plannedCredit
    const monthLogged = applyMonthCreditCap(loggedStandard, loggedCredit, cap)
    const monthProjected = applyMonthCreditCap(
      loggedStandard + plannedStandard,
      loggedCredit + plannedCredit,
      cap
    )
    logged += monthLogged
    projected += monthProjected
    months.push({
      ...target,
      loggedMinutes: monthLogged,
      projectedMinutes: monthProjected,
    })
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
          creditCapMinutes: capFor(input.scope),
        }
      : undefined

  const standardGap = (() => {
    if (projected >= goal) return 0
    if (
      month &&
      month.creditCapMinutes !== null &&
      goal > month.creditCapMinutes
    ) {
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
    months,
    month,
  }
}
