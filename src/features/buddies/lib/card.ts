import moment from 'moment'
import {
  DEFAULT_START_TIME_IN_MINUTES,
  storedDayKey,
} from '@/lib/normalizeDate'
import {
  getEffectiveStartTimeInMinutesForRecurringPlan,
  isRecurringPlanAnytimeOnDate,
  resolvePlannedContributionsForDay,
  RecurringPlan,
} from '@/lib/recurrence'
import type { DayPlan } from '@/types/timeEntry'
import type {
  BuddyCardDay,
  BuddyPlanTimes,
  BuddyTimeOfDay,
} from '@/features/buddies/lib/schemas'

export const BUDDY_CARD_HORIZON_DAYS = 56

export function buildBuddyCardDays(
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[],
  today: Date,
  horizonDays = BUDDY_CARD_HORIZON_DAYS
): BuddyCardDay[] {
  const dayPlansByKey = new Map<string, DayPlan[]>()
  for (const plan of dayPlans) {
    const key = storedDayKey(plan.date)
    dayPlansByKey.set(key, [...(dayPlansByKey.get(key) ?? []), plan])
  }

  const days: BuddyCardDay[] = []
  const start = moment(today).startOf('day')
  for (let offset = 0; offset < horizonDays; offset++) {
    const day = start.clone().add(offset, 'days')
    const key = day.format('YYYY-MM-DD')
    const date = day.toDate()
    const plans = resolvePlannedContributionsForDay(
      date,
      dayPlansByKey.get(key) ?? [],
      recurringPlans
    )
      .filter((contribution) => contribution.minutes > 0)
      .map((contribution) => {
        const startTime =
          contribution.source === 'day'
            ? contribution.plan.anytime
              ? undefined
              : contribution.plan.startTimeInMinutes
            : recurringStartTime(contribution.plan, date)
        return {
          ...(startTime === undefined ? {} : { s: startTime }),
          m: Math.min(Math.round(contribution.minutes), 1440),
        }
      })
    if (plans.length > 0) days.push({ d: key, p: plans })
  }
  return days
}

function recurringStartTime(
  plan: RecurringPlan,
  date: Date
): number | undefined {
  if (isRecurringPlanAnytimeOnDate(plan, date)) return undefined
  const effective = getEffectiveStartTimeInMinutesForRecurringPlan(plan, date)
  if (plan.startTimeInMinutes !== undefined) return effective
  return effective === DEFAULT_START_TIME_IN_MINUTES ? undefined : effective
}

export const TIME_OF_DAY_START: Record<BuddyTimeOfDay, number> = {
  m: 6 * 60,
  a: 12 * 60,
  e: 17 * 60,
}

export function timeOfDayFor(startTime: number): BuddyTimeOfDay {
  if (startTime >= TIME_OF_DAY_START.e) return 'e'
  if (startTime >= TIME_OF_DAY_START.a) return 'a'
  return 'm'
}

export function withPlanTimes(
  days: BuddyCardDay[],
  times: BuddyPlanTimes
): BuddyCardDay[] {
  if (times === 'exact') return days
  return days.map((day) => ({
    d: day.d,
    p: day.p.map(({ s, m }) =>
      times === 'timeOfDay' && s !== undefined
        ? { m, t: timeOfDayFor(s) }
        : { m }
    ),
  }))
}
