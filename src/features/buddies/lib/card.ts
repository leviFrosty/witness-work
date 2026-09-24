import moment from 'moment'
import {
  DEFAULT_START_TIME_IN_MINUTES,
  storedDayKey,
} from '@/lib/normalizeDate'
import {
  getEffectiveStartTimeInMinutesForRecurringPlan,
  resolvePlannedContributionsForDay,
  RecurringPlan,
} from '@/lib/recurrence'
import type { DayPlan } from '@/types/timeEntry'
import type { BuddyCardDay } from '@/features/buddies/lib/schemas'

/** Buddies see today through this many days ahead — never the past. */
export const BUDDY_CARD_HORIZON_DAYS = 56

/**
 * The Plans a Buddy Card shares: for each local day in the window, the Plans
 * that actually count for that day under the app's own resolution rule (Day
 * Plans replace recurring instances). Only start time and minutes leave the
 * device — never Categories, notes, or Time Entries.
 */
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
            ? contribution.plan.startTimeInMinutes
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

/** Undefined when neither the plan nor its override carries a start time. */
function recurringStartTime(
  plan: RecurringPlan,
  date: Date
): number | undefined {
  const effective = getEffectiveStartTimeInMinutesForRecurringPlan(plan, date)
  if (plan.startTimeInMinutes !== undefined) return effective
  return effective === DEFAULT_START_TIME_IN_MINUTES ? undefined : effective
}
