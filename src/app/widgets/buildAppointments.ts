import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import {
  followUpAnswer,
  isAppointment,
  visitsByContact,
} from '@/lib/conversations'
import {
  formatCalendar,
  formatMonthDayCompact,
  formatTime,
  formatDisplay,
} from '@/lib/dates'

export type WidgetAppointment = {
  id: string
  contactId: string
  contactName: string

  date: number

  topic: string | null

  timeFormatted: string

  isOverdue: boolean
}

export type BuildAppointmentsArgs = {
  contacts: Contact[]
  conversations: Visit[]
}

const MAX_APPOINTMENTS = 20

const FORWARD_DAYS = 31

const OVERDUE_LOOKBACK_DAYS = 30

function formatAppointmentTime(
  date: moment.Moment,
  now: moment.Moment
): string {
  const isSameDay = date.isSame(now, 'day')
  const isTomorrow = date.isSame(now.clone().add(1, 'day'), 'day')
  const isYesterday = date.isSame(now.clone().subtract(1, 'day'), 'day')
  const isThisWeek = date.isSame(now, 'isoWeek')

  if (isSameDay) return formatTime(date)

  if (isTomorrow)
    return formatCalendar(date, {
      referenceTime: now,
      formats: { sameElse: 'LT' },
    })
  if (isYesterday)
    return formatCalendar(date, {
      referenceTime: now,
      formats: { sameElse: 'LT' },
    })
  if (isThisWeek) return formatDisplay(date, 'ddd LT')
  return formatMonthDayCompact(date)
}

export function buildAppointments(
  args: BuildAppointmentsArgs
): WidgetAppointment[] {
  const now = moment()
  const min = now.clone().subtract(OVERDUE_LOOKBACK_DAYS, 'days').startOf('day')
  const max = now.clone().add(FORWARD_DAYS, 'days').endOf('day')

  const contactsById = new Map(args.contacts.map((c) => [c.id, c]))

  const byContact = visitsByContact(args.conversations)

  const inWindow = args.conversations
    .filter((conv) => {
      if (!isAppointment(conv)) return false
      const date = conv.followUp?.date
      if (!date) return false
      if (!moment(date).isBetween(min, max, undefined, '[]')) return false
      return !followUpAnswer(conv, byContact.get(conv.contact.id) ?? [])
    })
    .map((conv): WidgetAppointment | null => {
      const contact = contactsById.get(conv.contact.id)
      if (!contact) return null
      const followUpMoment = moment(conv.followUp!.date)
      return {
        id: conv.id,
        contactId: contact.id,
        contactName: contact.name,
        date: followUpMoment.valueOf(),
        topic: conv.followUp?.topic || null,
        timeFormatted: formatAppointmentTime(followUpMoment, now),
        isOverdue: followUpMoment.isBefore(now),
      }
    })
    .filter((a): a is WidgetAppointment => a !== null)

  inWindow.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
    return a.date - b.date
  })
  return inWindow.slice(0, MAX_APPOINTMENTS)
}
