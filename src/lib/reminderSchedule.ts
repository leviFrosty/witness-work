import moment from 'moment'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'
import {
  reminderFireDate,
  reminderOffsetMinutesBetween,
  type NotificationOffset,
} from '@/lib/notificationOffset'
import {
  combineDateAndStartTime,
  normalizeDateForStorage,
} from '@/lib/normalizeDate'
import {
  getEffectiveMinutesForRecurringPlan,
  getEffectiveNoteForRecurringPlan,
  getEffectiveStartTimeInMinutesForRecurringPlan,
  getPlansIntersectingDay,
  isRecurringPlanAnytimeOnDate,
} from '@/lib/recurrence'
import {
  streakReminderAt,
  type ServiceStreak,
  type StreakKind,
} from '@/lib/serviceStreak'
import {
  unloggedDayReminderGroups,
  type UnloggedDaySources,
} from '@/lib/unloggedDayReminders'
import {
  nextMonthReportReminder,
  type MonthReportSources,
} from '@/lib/monthReportReminders'
import {
  weekPlanReminderDates,
  type WeekPlanSources,
} from '@/lib/weekPlanReminders'

export type LocalReminder = {
  id: string
  date: Date
  kind:
    | 'visit'
    | 'plan'
    | 'contact'
    | 'unloggedDay'
    | 'streak'
    | 'monthReport'
    | 'weekPlan'

  targetId: string

  contactId?: string

  day?: string

  anchor: Date
  name?: string

  note?: string

  title?: string
  minutes?: number

  days?: string[]

  streak?: { count: number; kind: StreakKind }
}

export const reminderRequestId = (
  kind: LocalReminder['kind'],
  targetId: string
) => `witness-work-${kind}-${targetId}`

export function savedReminderOffsetMinutes(
  anchor: Date,
  saved: {
    reminderOffsetMinutes?: number
    notifications?: { date: Date }[]
  }
): number | undefined {
  if (
    typeof saved.reminderOffsetMinutes === 'number' &&
    Number.isFinite(saved.reminderOffsetMinutes) &&
    saved.reminderOffsetMinutes >= 0
  )
    return saved.reminderOffsetMinutes
  const notification = saved.notifications?.[0]?.date
  if (!notification) return undefined
  const minutes = reminderOffsetMinutesBetween(anchor, new Date(notification))
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : undefined
}

function reminderDate(
  anchor: Date,
  saved: Parameters<typeof savedReminderOffsetMinutes>[1],
  fallback: NotificationOffset
): Date {
  const minutes = savedReminderOffsetMinutes(anchor, saved)
  return minutes === undefined
    ? moment(anchor).subtract(fallback.amount, fallback.unit).toDate()
    : reminderFireDate(anchor, minutes)
}

export const ANYTIME_PLAN_REMINDER_MINUTES = 8 * 60

export const anytimePlanReminderDate = (date: Date | string) =>
  combineDateAndStartTime(date, ANYTIME_PLAN_REMINDER_MINUTES)

const DAY_MS = 24 * 60 * 60_000

export const RECURRING_PLAN_REMINDER_HORIZON_MS = 14 * DAY_MS

const MAX_RECURRING_LEAD_MS = 366 * DAY_MS

export function recurringPlanOnDay(plan: RecurringPlan, day: string): boolean {
  const [year, month, date] = day.split('-').map(Number)
  return (
    getPlansIntersectingDay(new Date(year, month - 1, date, 12), [plan])
      .length > 0
  )
}

function recurringPlanReminders(
  plan: RecurringPlan,
  fallback: NotificationOffset,
  now: number
): LocalReminder[] {
  const reminders: LocalReminder[] = []
  const to = now + RECURRING_PLAN_REMINDER_HORIZON_MS
  const leadMinutes =
    savedReminderOffsetMinutes(new Date(now), plan) ??
    moment.duration(fallback.amount, fallback.unit).asMinutes()
  const lead = Math.min(
    Number.isFinite(leadMinutes) ? Math.max(leadMinutes, 0) * 60_000 : 0,
    MAX_RECURRING_LEAD_MS
  )
  const last = moment(to + lead).endOf('day')
  for (
    const cursor = moment(now).startOf('day').subtract(1, 'day');
    cursor.isSameOrBefore(last);
    cursor.add(1, 'day')
  ) {
    const day = new Date(cursor.year(), cursor.month(), cursor.date(), 12)
    if (!getPlansIntersectingDay(day, [plan]).length) continue
    const stored = normalizeDateForStorage(day)
    const anytimeAt = isRecurringPlanAnytimeOnDate(plan, day)
      ? anytimePlanReminderDate(stored)
      : null
    const anchor =
      anytimeAt ??
      combineDateAndStartTime(
        stored,
        getEffectiveStartTimeInMinutesForRecurringPlan(plan, day)
      )
    const date = anytimeAt ?? reminderDate(anchor, plan, fallback)
    if (date.getTime() > to) continue
    const key = cursor.format('YYYY-MM-DD')
    reminders.push({
      id: reminderRequestId('plan', `${plan.id}-${key}`),
      date,
      kind: 'plan',
      targetId: plan.id,
      day: key,
      anchor,
      note: getEffectiveNoteForRecurringPlan(plan, day).note,
      title: plan.title,
      minutes: getEffectiveMinutesForRecurringPlan(plan, day),
    })
  }
  return reminders
}

type ReminderSources = {
  contacts: Contact[]
  visits: Visit[]
  plans: DayPlan[]

  recurringPlans?: RecurringPlan[]
  visitOffset: NotificationOffset
  planOffset: NotificationOffset

  unloggedDays?: UnloggedDaySources

  streak?: ServiceStreak

  monthReport?: MonthReportSources

  weekPlan?: WeekPlanSources
}

export function reminderOccurrences(
  args: ReminderSources & { now?: number }
): LocalReminder[] {
  const reminders: LocalReminder[] = []
  const contacts = new Map(
    args.contacts.map((contact) => [contact.id, contact])
  )
  for (const visit of args.visits) {
    const followUp = visit.followUp
    const contact = contacts.get(visit.contact.id)
    if (!contact || !followUp?.notifyMe || followUp.dismissed) continue
    const date = new Date(followUp.date)
    reminders.push({
      id: reminderRequestId('visit', visit.id),
      date: reminderDate(date, followUp, args.visitOffset),
      kind: 'visit',
      targetId: visit.id,
      contactId: contact.id,
      anchor: date,
      name: contact.name,
      note: followUp.topic,
    })
  }
  for (const plan of args.plans) {
    if (!plan.notifyMe) continue
    const anytimeAt = plan.anytime ? anytimePlanReminderDate(plan.date) : null
    const date =
      anytimeAt ?? combineDateAndStartTime(plan.date, plan.startTimeInMinutes)
    reminders.push({
      id: reminderRequestId('plan', plan.id),
      date: anytimeAt ?? reminderDate(date, plan, args.planOffset),
      kind: 'plan',
      targetId: plan.id,
      anchor: date,
      note: plan.note,
      title: plan.title,
      minutes: plan.minutes,
    })
  }
  for (const plan of args.recurringPlans ?? []) {
    if (!plan.notifyMe) continue
    reminders.push(
      ...recurringPlanReminders(plan, args.planOffset, args.now ?? Date.now())
    )
  }
  for (const contact of args.contacts) {
    if (!contact.dismissedUntil) continue
    const date = new Date(contact.dismissedUntil)
    reminders.push({
      id: reminderRequestId('contact', contact.id),
      date,
      kind: 'contact',
      targetId: contact.id,
      contactId: contact.id,
      anchor: date,
      name: contact.name,
    })
  }
  if (args.unloggedDays) {
    const groups = unloggedDayReminderGroups(
      args.unloggedDays,
      args.now ?? Date.now()
    )
    for (const { date, days } of groups) {
      const [first] = days
      reminders.push({
        id: reminderRequestId('unloggedDay', first.key),
        date,
        kind: 'unloggedDay',
        targetId: first.key,
        anchor: first.end,
        minutes: first.minutes,
        days: days.map((day) => day.key),
      })
    }
  }
  const streakAt = args.streak ? streakReminderAt(args.streak) : null
  if (args.streak?.due && streakAt) {
    const { due, count, kind } = args.streak
    reminders.push({
      id: reminderRequestId('streak', due.period),
      date: streakAt,
      kind: 'streak',
      targetId: due.period,
      anchor: due.endsAt,
      streak: { count, kind },
    })
  }
  const report = args.monthReport
    ? nextMonthReportReminder(args.monthReport, args.now ?? Date.now())
    : null
  if (report)
    reminders.push({
      id: reminderRequestId('monthReport', report.month),
      date: report.date,
      kind: 'monthReport',
      targetId: report.month,
      anchor: report.date,
    })
  if (args.weekPlan) {
    for (const { date, week } of weekPlanReminderDates(
      args.weekPlan,
      args.now ?? Date.now()
    ))
      reminders.push({
        id: reminderRequestId('weekPlan', week),
        date,
        kind: 'weekPlan',
        targetId: week,
        anchor: moment(week, 'YYYY-MM-DD').toDate(),
      })
  }
  return reminders.filter((reminder) =>
    Number.isFinite(reminder.date.getTime())
  )
}

export function buildReminderSchedule(
  args: ReminderSources & { now: number }
): LocalReminder[] {
  return reminderOccurrences(args)
    .filter(
      (reminder) =>
        Number.isFinite(reminder.date.getTime()) &&
        reminder.date.getTime() > args.now
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 60)
}
