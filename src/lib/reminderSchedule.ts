import moment from 'moment'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { DayPlan } from '@/types/timeEntry'
import type { NotificationOffset } from '@/lib/notificationOffset'
import { combineDateAndStartTime } from '@/lib/normalizeDate'
import {
  unloggedDayReminderGroups,
  type UnloggedDaySources,
} from '@/lib/unloggedDayReminders'

export type LocalReminder = {
  /** The OS request id. Stable per record, so reconciling replaces it. */
  id: string
  date: Date
  kind: 'visit' | 'plan' | 'contact' | 'unloggedDay'
  /**
   * The Visit, Plan, or Contact the reminder opens; for a reminder to log time,
   * its earliest planned day (`YYYY-MM-DD`).
   */
  targetId: string
  /** The Visit's Contact. */
  contactId?: string
  /**
   * When the Follow-up or Plan starts, or the planned day's Plans end; the
   * Contact's return otherwise.
   */
  anchor: Date
  name?: string
  /** A Follow-up's topic or a Plan's note. */
  note?: string
  /** A Plan's title and planned minutes (the earliest day's, to log time). */
  title?: string
  minutes?: number
  /** The planned days a reminder to log time covers, earliest first. */
  days?: string[]
}

export const reminderRequestId = (
  kind: LocalReminder['kind'],
  targetId: string
) => `witness-work-${kind}-${targetId}`

/**
 * The minutes ahead of `anchor` a reminder fires, from what the record saved:
 * the chosen offset when it has one, else (records saved before offsets were
 * kept, or by an older app on another device) its saved fire time.
 */
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
  const minutes = Math.round(
    (anchor.getTime() - new Date(notification).getTime()) / 60_000
  )
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
    : new Date(anchor.getTime() - minutes * 60_000)
}

type ReminderSources = {
  contacts: Contact[]
  visits: Visit[]
  plans: DayPlan[]
  visitOffset: NotificationOffset
  planOffset: NotificationOffset
  /** Planned days still without time logged; absent when that's off. */
  unloggedDays?: UnloggedDaySources
}

/**
 * Every reminder the records ask for, past or future, in no order. Built from
 * records alone, so it is the same after an edit, sync, or restore. The OS
 * schedule and the notifications tray both read it. Reminders to log time are
 * the exception: they run from a week back to two weeks after `now`.
 */
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
    const date = combineDateAndStartTime(plan.date, plan.startTimeInMinutes)
    reminders.push({
      id: reminderRequestId('plan', plan.id),
      date: reminderDate(date, plan, args.planOffset),
      kind: 'plan',
      targetId: plan.id,
      anchor: date,
      note: plan.note,
      title: plan.title,
      minutes: plan.minutes,
    })
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
  return reminders.filter((reminder) =>
    Number.isFinite(reminder.date.getTime())
  )
}

/** The local reminders this device should have scheduled, soonest first. */
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
