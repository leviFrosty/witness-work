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

  offAnchor: { time: number; offset: number }[]
}

const indexes = new WeakMap<DayPlan[], DayPlanIndex>()

const offsetAt = (time: number) => new Date(time).getTimezoneOffset()

const isCurrent = ({ offAnchor }: DayPlanIndex) =>
  offAnchor.every(({ time, offset }) => offsetAt(time) === offset)

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

    if (!Number.isNaN(time)) offAnchor.push({ time, offset: offsetAt(time) })
  }
  indexes.set(dayPlans, { byDay, offAnchor })
  return byDay
}

export const dayPlansOnLocalDay = (
  dayPlans: DayPlan[],
  localDay: Date | string | moment.Moment
): DayPlan[] =>
  dayPlansByDayKey(dayPlans).get(localDayKey(localDay)) ?? NO_DAY_PLANS
