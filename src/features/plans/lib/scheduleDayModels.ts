import {
  buildCalendarDayModel,
  type CalendarDayModel,
} from '@/components/calendarDayModel'
import moment from 'moment'
import { _i18n } from '@/lib/locales'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { type RecurringPlan, recurringPlansOverlapping } from '@/lib/recurrence'
import type { ScheduleDayIndex } from '@/features/plans/lib/scheduleDayIndex'
import { calendarMonthKey, dayKeyOf } from '@/features/plans/lib/scheduleRows'

export type ScheduleMonthModels = ReadonlyMap<string, CalendarDayModel>

type MonthCache = {
  locale: string
  months: Map<string, ScheduleMonthModels>
}

const caches = new WeakMap<
  ScheduleDayIndex,
  WeakMap<RecurringPlan[], MonthCache>
>()

const NO_REPORTS: never[] = []
const NO_DAY_PLANS: never[] = []

function cacheFor(
  index: ScheduleDayIndex,
  recurringPlans: RecurringPlan[]
): MonthCache {
  let byPlans = caches.get(index)
  if (!byPlans) {
    byPlans = new WeakMap()
    caches.set(index, byPlans)
  }
  let cache = byPlans.get(recurringPlans)

  const locale = `${_i18n.locale}|${moment.locale()}|${new Date().getTimezoneOffset()}`
  if (!cache || cache.locale !== locale) {
    cache = { locale, months: new Map() }
    byPlans.set(recurringPlans, cache)
  }
  return cache
}

function buildMonth(
  index: ScheduleDayIndex,
  recurringPlans: RecurringPlan[],
  { year, month }: CalendarMonth
): ScheduleMonthModels {
  const models = new Map<string, CalendarDayModel>()
  const days = new Date(year, month + 1, 0).getDate()
  const plans = recurringPlansOverlapping(
    recurringPlans,
    new Date(year, month, 1),
    new Date(year, month, days)
  )
  for (let day = 1; day <= days; day++) {
    const key = dayKeyOf(year, month, day)
    models.set(
      key,
      buildCalendarDayModel({
        dateString: key,
        reports: index.reportsByDay.get(key) ?? NO_REPORTS,
        dayPlans: index.dayPlansByDay.get(key) ?? NO_DAY_PLANS,
        recurringPlans: plans,
      })
    )
  }
  return models
}

export function scheduleMonthModels(
  index: ScheduleDayIndex,
  recurringPlans: RecurringPlan[],
  month: CalendarMonth
): ScheduleMonthModels {
  const cache = cacheFor(index, recurringPlans)
  const key = calendarMonthKey(month)
  let models = cache.months.get(key)
  if (!models) {
    models = buildMonth(index, recurringPlans, month)
    cache.months.set(key, models)
  }
  return models
}

export const isMonthModelled = (
  index: ScheduleDayIndex,
  recurringPlans: RecurringPlan[],
  month: CalendarMonth
) => cacheFor(index, recurringPlans).months.has(calendarMonthKey(month))

const idle: (callback: () => void) => unknown =
  typeof requestIdleCallback === 'function'
    ? (callback) => requestIdleCallback(callback)
    : (callback) => setTimeout(callback, 1)

let queue: (() => void)[] = []
let draining = false

const drain = () => {
  const next = queue.shift()
  if (!next) {
    draining = false
    return
  }
  next()
  idle(drain)
}

export function prefetchScheduleMonths(
  index: ScheduleDayIndex,
  recurringPlans: RecurringPlan[],
  months: CalendarMonth[]
) {
  queue = months
    .filter((month) => !isMonthModelled(index, recurringPlans, month))
    .map((month) => () => {
      scheduleMonthModels(index, recurringPlans, month)
    })
  if (draining || !queue.length) return
  draining = true
  idle(drain)
}
