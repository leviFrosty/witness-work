import moment from 'moment'
import {
  combineDateAndStartTime,
  DEFAULT_START_TIME_IN_MINUTES,
  localDayFromUtcCursor,
  storedDayKey,
} from '@/lib/normalizeDate'
import {
  getEffectiveStartTimeInMinutesForRecurringPlan,
  getPlansIntersectingDay,
  isRecurringPlanAnytimeOnDate,
  type RecurringPlan,
} from '@/lib/recurrence'
import {
  anytimePlanReminderDate,
  reminderRequestId,
  savedReminderOffsetMinutes,
} from '@/lib/reminderSchedule'
import type { DayPlan } from '@/types/timeEntry'

const DAY_KEY = 'YYYY-MM-DD'

/**
 * The first day of the week holding local day `day`, as a UTC-mode cursor. Day
 * arithmetic in UTC mode never meets a DST change.
 */
const weekStartOf = (day: Date, startOfWeek: number) => {
  const cursor = moment.utc(moment(day).format(DAY_KEY), DAY_KEY)
  return cursor.subtract((cursor.day() - startOfWeek + 7) % 7, 'days')
}

/**
 * Whether the week holding `day` has a day from `today` on. Plans are only
 * copied onto those: a copied Plan on a past day would be a planned day without
 * time, which ends a Service Streak.
 */
export const weekHasDaysAhead = (
  day: Date,
  startOfWeek: number,
  today: Date
): boolean =>
  weekStartOf(day, startOfWeek).add(6, 'days').format(DAY_KEY) >=
  moment(today).format(DAY_KEY)

/** When a Plan starts, for telling two Plans on a day apart. */
const slotOf = (plan: Pick<DayPlan, 'anytime' | 'startTimeInMinutes'>) =>
  plan.anytime
    ? 'anytime'
    : String(plan.startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES)

/**
 * The copy's reminder, as the source's was set, saved the way the Plan form
 * saves one.
 */
const reminderOf = (
  source: DayPlan,
  id: string,
  date: Date
): Pick<DayPlan, 'notifyMe' | 'reminderOffsetMinutes' | 'notifications'> => {
  if (!source.notifyMe) return {}
  if (source.anytime)
    return {
      notifyMe: true,
      notifications: [
        {
          id: reminderRequestId('plan', id),
          date: anytimePlanReminderDate(date),
        },
      ],
    }
  const offset = savedReminderOffsetMinutes(
    combineDateAndStartTime(source.date, source.startTimeInMinutes),
    source
  )
  // Without a saved offset, the reminder follows the default offset.
  if (offset === undefined) return { notifyMe: true, notifications: [] }
  const start = combineDateAndStartTime(date, source.startTimeInMinutes)
  return {
    notifyMe: true,
    reminderOffsetMinutes: offset,
    // The fire time, for older app versions on other devices.
    notifications: [
      {
        id: reminderRequestId('plan', id),
        date: new Date(start.getTime() - offset * 60_000),
      },
    ],
  }
}

/**
 * Copies of last week's one-time Day Plans for the same weekdays of the week
 * holding `day`, by Start of Week: the same start time, length, Type, title,
 * place, note, and reminder. Each copy is a new Plan: no Buddies are invited,
 * and Plans the User joined through a buddy's invitation aren't copied.
 * Recurring Plans already repeat, so their dates are left alone. Days before
 * `today`, Off Days, and days that already have a Plan starting at the same
 * time (or, for a Plan without a set time, one without one too) get no copy, so
 * copying twice adds nothing the second time.
 *
 * The copies' `date`s are local-mode days, as `addDayPlan` expects.
 */
export function lastWeekPlanCopies({
  dayPlans,
  recurringPlans,
  day,
  startOfWeek,
  offDays,
  today,
  newId,
}: {
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  /** Any local day of the week the copies go onto. */
  day: Date
  /** 0 = Sunday … 6 = Saturday. */
  startOfWeek: number
  /** Off Day weekdays, 0 = Sunday … 6 = Saturday. */
  offDays: number[]
  today: Date
  newId: () => string
}): DayPlan[] {
  const weekStart = weekStartOf(day, startOfWeek)
  const from = weekStart.clone().subtract(7, 'days').format(DAY_KEY)
  const until = weekStart.format(DAY_KEY)
  const todayKey = moment(today).format(DAY_KEY)

  const taken = new Map<string, Set<string>>()
  /** The start times a day's Plans already hold. */
  const takenOn = (key: string, date: Date) => {
    let slots = taken.get(key)
    if (slots) return slots
    slots = new Set<string>()
    for (const plan of dayPlans)
      if (storedDayKey(plan.date) === key) slots.add(slotOf(plan))
    for (const plan of getPlansIntersectingDay(date, recurringPlans))
      slots.add(
        slotOf({
          anytime: isRecurringPlanAnytimeOnDate(plan, date),
          startTimeInMinutes: getEffectiveStartTimeInMinutesForRecurringPlan(
            plan,
            date
          ),
        })
      )
    taken.set(key, slots)
    return slots
  }

  const copies: DayPlan[] = []
  for (const plan of dayPlans) {
    if (plan.buddyShare) continue
    const sourceKey = storedDayKey(plan.date)
    if (sourceKey < from || sourceKey >= until) continue
    const target = moment.utc(sourceKey, DAY_KEY).add(7, 'days')
    const targetKey = target.format(DAY_KEY)
    if (targetKey < todayKey || offDays.includes(target.day())) continue
    const date = localDayFromUtcCursor(target)
    if (takenOn(targetKey, date).has(slotOf(plan))) continue
    const id = newId()
    copies.push({
      id,
      date,
      minutes: plan.minutes,
      startTimeInMinutes: plan.startTimeInMinutes,
      ...(plan.anytime ? { anytime: true } : {}),
      categoryId: plan.categoryId,
      title: plan.title,
      location: plan.location,
      note: plan.note,
      noteDoc: plan.noteDoc,
      ...reminderOf(plan, id, date),
    })
  }
  return copies
}

/** The analytics bucket for how many Plans one copy added. */
export const copiedPlansBucket = (count: number) =>
  count <= 1 ? '1' : count <= 3 ? '2-3' : count <= 6 ? '4-6' : '7+'
