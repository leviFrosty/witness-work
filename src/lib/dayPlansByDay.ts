import type moment from 'moment'

import { localDayKey, storedDayKey } from '@/lib/normalizeDate'
import type { DayPlan } from '@/types/timeEntry'

const NO_DAY_PLANS: DayPlan[] = []
const indexes = new WeakMap<DayPlan[], ReadonlyMap<string, DayPlan[]>>()

/**
 * Day Plans grouped by stored calendar day (`YYYY-MM-DD`), so a walk over a
 * month or a Service Year looks each day up instead of scanning every Day Plan
 * (which are never pruned). Built once per array: the store replaces `dayPlans`
 * on every change instead of mutating it. Don't mutate the lists.
 */
export function dayPlansByDayKey(
  dayPlans: DayPlan[]
): ReadonlyMap<string, DayPlan[]> {
  const cached = indexes.get(dayPlans)
  if (cached) return cached
  const index = new Map<string, DayPlan[]>()
  for (const plan of dayPlans) {
    const key = storedDayKey(plan.date)
    const list = index.get(key)
    if (list) list.push(plan)
    else index.set(key, [plan])
  }
  indexes.set(dayPlans, index)
  return index
}

/**
 * The Day Plans on a local calendar day, in store order. `localDay` takes the
 * forms `isStoredDateOnLocalDay` does.
 */
export const dayPlansOnLocalDay = (
  dayPlans: DayPlan[],
  localDay: Date | string | moment.Moment
): DayPlan[] =>
  dayPlansByDayKey(dayPlans).get(localDayKey(localDay)) ?? NO_DAY_PLANS
