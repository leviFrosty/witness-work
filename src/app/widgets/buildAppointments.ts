import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import { isAppointment } from '@/lib/conversations'
import { formatMonthDayCompact } from '@/lib/dates'

export type WidgetAppointment = {
  /** Visit ID — used to deep-link with `highlightedVisitId`. */
  id: string
  contactId: string
  contactName: string
  /** Epoch ms of the follow-up date. */
  date: number
  /** Topic the user typed for the follow-up, or `null`. */
  topic: string | null
  /**
   * Pre-formatted, locale-aware time-of-day string. Today renders the time
   * (e.g. `"3:00 PM"`), tomorrow gets `"Tomorrow 3:00 PM"`, this week shows the
   * day name (`"Thu 3:00 PM"`), and anything beyond falls back to a short date
   * (`"Apr 14"`).
   */
  timeFormatted: string
  /**
   * True when the follow-up date is in the past. Surfaces in red on the widget
   * and unlocks the reschedule action.
   */
  isOverdue: boolean
}

export type BuildAppointmentsArgs = {
  contacts: Contact[]
  conversations: Visit[]
}

/**
 * Cap how many we serialize. The widget App Intent narrows by day-window
 * client-side; 20 covers the densest realistic month-long view at large size.
 */
const MAX_APPOINTMENTS = 20
/**
 * Forward window we serialize. Widget intent narrows further. 31 days covers
 * the largest configurable window the user can pick.
 */
const FORWARD_DAYS = 31
/**
 * Backward window for surfacing overdue follow-ups the user never marked
 * complete. Anything older than this is presumed forgotten.
 */
const OVERDUE_LOOKBACK_DAYS = 30

/** Format a follow-up date as a locale-aware "time of day"-style label. */
function formatAppointmentTime(
  date: moment.Moment,
  now: moment.Moment
): string {
  const isSameDay = date.isSame(now, 'day')
  const isTomorrow = date.isSame(now.clone().add(1, 'day'), 'day')
  const isYesterday = date.isSame(now.clone().subtract(1, 'day'), 'day')
  const isThisWeek = date.isSame(now, 'isoWeek')

  // moment honors locale for these tokens — `LT` is short time, `ddd` is short
  // day name, `MMM D` is short date.
  if (isSameDay) return date.format('LT')
  if (isTomorrow) return `${date.calendar(now, { sameElse: 'LT' })}` // localized "Tomorrow at HH:mm"
  if (isYesterday) return date.calendar(now, { sameElse: 'LT' })
  if (isThisWeek) return date.format('ddd LT')
  return formatMonthDayCompact(date)
}

export function buildAppointments(
  args: BuildAppointmentsArgs
): WidgetAppointment[] {
  const now = moment()
  const min = now.clone().subtract(OVERDUE_LOOKBACK_DAYS, 'days').startOf('day')
  const max = now.clone().add(FORWARD_DAYS, 'days').endOf('day')

  const contactsById = new Map(args.contacts.map((c) => [c.id, c]))

  // Index conversation start dates per contact so we can suppress overdue
  // follow-ups that have been superseded by a later visit. Mirrors
  // `overdueFollowUpConversations` in src/lib/conversations.ts.
  const datesByContact = new Map<string, Array<{ id: string; ts: number }>>()
  for (const c of args.conversations) {
    const list = datesByContact.get(c.contact.id) ?? []
    list.push({ id: c.id, ts: moment(c.date).valueOf() })
    datesByContact.set(c.contact.id, list)
  }

  const inWindow = args.conversations
    .filter((conv) => {
      if (!isAppointment(conv)) return false
      const date = conv.followUp?.date
      if (!date) return false
      if (!moment(date).isBetween(min, max, undefined, '[]')) return false

      // Only the overdue side can be "already handled" by a later
      // conversation — future follow-ups can't be superseded yet.
      const followUpTs = moment(date).valueOf()
      if (followUpTs >= now.valueOf()) return true
      const siblings = datesByContact.get(conv.contact.id) ?? []
      const superseded = siblings.some(
        (s) => s.id !== conv.id && s.ts >= followUpTs
      )
      return !superseded
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

  // Overdue first (most urgent), then chronological for upcoming.
  inWindow.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
    return a.date - b.date
  })
  return inWindow.slice(0, MAX_APPOINTMENTS)
}
