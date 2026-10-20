import type moment from 'moment'

import {
  isAnchoredIsoString,
  isStoredDateAnchored,
  localDayKey,
  storedDayKey,
} from '@/lib/normalizeDate'
import type { DayPlan } from '@/types/timeEntry'

const NO_DAY_PLANS: DayPlan[] = []

type DayPlanIndex = {
  byDay: ReadonlyMap<string, DayPlan[]>
  /**
   * Day Plans off the noon-UTC anchor key by the local day they fall on in the
   * device's time zone, so the index remembers each one's instant and UTC
   * offset and is rebuilt once any offset changes. Empty for normalized data.
   */
  offAnchor: { time: number; offset: number }[]
}

const indexes = new WeakMap<DayPlan[], DayPlanIndex>()

const offsetAt = (time: number) => new Date(time).getTimezoneOffset()

const isCurrent = ({ offAnchor }: DayPlanIndex) =>
  offAnchor.every(({ time, offset }) => offsetAt(time) === offset)

/**
 * Day Plans grouped by stored calendar day (`YYYY-MM-DD`), so a walk over a
 * month or a Service Year looks each day up instead of scanning every Day Plan
 * (which are never pruned). Built once per array: the store replaces `dayPlans`
 * on every change instead of mutating it. Don't mutate the lists. Plans whose
 * date isn't normalized yet are re-keyed when the time zone moves them.
 */
export function dayPlansByDayKey(
  dayPlans: DayPlan[]
): ReadonlyMap<string, DayPlan[]> {
  const cached = indexes.get(dayPlans)
  if (cached && isCurrent(cached)) return cached.byDay
  const byDay = new Map<string, DayPlan[]>()
  const offAnchor: DayPlanIndex['offAnchor'] = []
  for (const plan of dayPlans) {
    const { date } = plan
    const key = storedDayKey(date)
    const list = byDay.get(key)
    if (list) list.push(plan)
    else byDay.set(key, [plan])
    if (isAnchoredIsoString(date) || isStoredDateAnchored(date)) continue
    const time = new Date(date).getTime()
    // An unreadable date keys as `Invalid date` in every time zone.
    if (!Number.isNaN(time)) offAnchor.push({ time, offset: offsetAt(time) })
  }
  indexes.set(dayPlans, { byDay, offAnchor })
  return byDay
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
