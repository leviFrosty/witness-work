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

const weekStartOf = (day: Date, startOfWeek: number) => {
  const cursor = moment.utc(moment(day).format(DAY_KEY), DAY_KEY)
  return cursor.subtract((cursor.day() - startOfWeek + 7) % 7, 'days')
}

export const weekHasDaysAhead = (
  day: Date,
  startOfWeek: number,
  today: Date
): boolean =>
  weekStartOf(day, startOfWeek).add(6, 'days').format(DAY_KEY) >=
  moment(today).format(DAY_KEY)

const slotOf = (plan: Pick<DayPlan, 'anytime' | 'startTimeInMinutes'>) =>
  plan.anytime
    ? 'anytime'
    : String(plan.startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES)

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
  if (offset === undefined) return { notifyMe: true, notifications: [] }
  const start = combineDateAndStartTime(date, source.startTimeInMinutes)
  return {
    notifyMe: true,
    reminderOffsetMinutes: offset,
    notifications: [
      {
        id: reminderRequestId('plan', id),
        date: new Date(start.getTime() - offset * 60_000),
      },
    ],
  }
}

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
  day: Date
  startOfWeek: number
  offDays: number[]
  today: Date
  newId: () => string
}): DayPlan[] {
  const weekStart = weekStartOf(day, startOfWeek)
  const from = weekStart.clone().subtract(7, 'days').format(DAY_KEY)
  const until = weekStart.format(DAY_KEY)
  const todayKey = moment(today).format(DAY_KEY)

  const taken = new Map<string, Set<string>>()
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

export const copiedPlansBucket = (count: number) =>
  count <= 1 ? '1' : count <= 3 ? '2-3' : count <= 6 ? '4-6' : '7+'
