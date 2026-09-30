import moment from 'moment'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { DayPlan } from '@/types/timeEntry'
import type { NotificationOffset } from '@/lib/notificationOffset'
import { combineDateAndStartTime } from '@/lib/normalizeDate'

export type LocalReminder = {
  id: string
  date: Date
  kind: 'visit' | 'plan' | 'contact'
  name?: string
  note?: string
}

function reminderDate(
  anchor: Date,
  saved: Date | undefined,
  fallback: NotificationOffset
): Date {
  const notification = saved ? new Date(saved) : undefined
  return notification &&
    Number.isFinite(notification.getTime()) &&
    notification <= anchor
    ? notification
    : moment(anchor).subtract(fallback.amount, fallback.unit).toDate()
}

export function buildReminderSchedule(args: {
  contacts: Contact[]
  visits: Visit[]
  plans: DayPlan[]
  visitOffset: NotificationOffset
  planOffset: NotificationOffset
  now: number
}): LocalReminder[] {
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
      id: `witness-work-visit-${visit.id}`,
      date: reminderDate(
        date,
        followUp.notifications?.[0]?.date,
        args.visitOffset
      ),
      kind: 'visit',
      name: contact.name,
      note: followUp.topic,
    })
  }
  for (const plan of args.plans) {
    if (!plan.notifyMe) continue
    const date = combineDateAndStartTime(plan.date, plan.startTimeInMinutes)
    reminders.push({
      id: `witness-work-plan-${plan.id}`,
      date: reminderDate(date, plan.notifications?.[0]?.date, args.planOffset),
      kind: 'plan',
      note: plan.note,
    })
  }
  for (const contact of args.contacts) {
    if (!contact.dismissedUntil) continue
    reminders.push({
      id: `witness-work-contact-${contact.id}`,
      date: new Date(contact.dismissedUntil),
      kind: 'contact',
      name: contact.name,
    })
  }
  return reminders
    .filter(
      (reminder) =>
        Number.isFinite(reminder.date.getTime()) &&
        reminder.date.getTime() > args.now
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 60)
}
