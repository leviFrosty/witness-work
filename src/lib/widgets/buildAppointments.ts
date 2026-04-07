import moment from 'moment'
import { Contact } from '../../types/contact'
import { Conversation } from '../../types/conversation'

export type WidgetAppointment = {
  /** Conversation ID — used to deep-link with `highlightedConversationId`. */
  id: string
  contactId: string
  contactName: string
  /** Epoch ms of the follow-up date. */
  date: number
  /** Topic the user typed for the follow-up, or `null`. */
  topic: string | null
  /** Whether the contact is flagged as a Bible study. Used for icon hinting. */
  isBibleStudy: boolean
}

export type BuildAppointmentsArgs = {
  contacts: Contact[]
  conversations: Conversation[]
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

export function buildAppointments(
  args: BuildAppointmentsArgs
): WidgetAppointment[] {
  const now = moment()
  // Mirror `upcomingFollowUpConversations` minDate: 4 hours back, so an
  // appointment that "just started" still shows as upcoming.
  const min = moment(now).subtract(4, 'hours')
  const max = moment(now).add(FORWARD_DAYS, 'days').endOf('day')

  const contactsById = new Map(args.contacts.map((c) => [c.id, c]))

  const upcoming = args.conversations
    .filter((conv) => {
      const date = conv.followUp?.date
      if (!date) return false
      return moment(date).isBetween(min, max, undefined, '[]')
    })
    .map((conv): WidgetAppointment | null => {
      const contact = contactsById.get(conv.contact.id)
      if (!contact) return null
      return {
        id: conv.id,
        contactId: contact.id,
        contactName: contact.name,
        date: moment(conv.followUp!.date).valueOf(),
        topic: conv.followUp?.topic || null,
        isBibleStudy: conv.isBibleStudy,
      }
    })
    .filter((a): a is WidgetAppointment => a !== null)

  upcoming.sort((a, b) => a.date - b.date)
  return upcoming.slice(0, MAX_APPOINTMENTS)
}
