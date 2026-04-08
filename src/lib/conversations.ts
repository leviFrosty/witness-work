import moment from 'moment'
import { Contact } from '../types/contact'
import { Conversation } from './../types/conversation'

export const contactStudiedForGivenMonth = ({
  conversations,
  contact,
  month,
}: {
  conversations: Conversation[]
  contact: Contact
  month: Date
}) => {
  const targetMonth = moment(month)

  const hasStudied = conversations.some((conversation) => {
    // Check if the conversation involves the contact and is flagged as a study in the given month
    const isStudyInMonth =
      conversation.contact.id === contact.id &&
      conversation.isBibleStudy &&
      moment(conversation.date).isSame(targetMonth, 'month')

    return isStudyInMonth
  })

  return hasStudied
}

export const contactHasAtLeastOneStudy = ({
  conversations,
  contact,
}: {
  conversations: Conversation[]
  contact: Contact
}) => {
  const hasStudied = conversations.some(
    (conversation) =>
      conversation.contact.id === contact.id && conversation.isBibleStudy
  )

  return hasStudied
}

export const contactMostRecentStudy = ({
  conversations,
  contact,
}: {
  conversations: Conversation[]
  contact: Contact
}) => {
  const contactStudies = conversations.filter(
    (conversation) =>
      conversation.contact.id === contact.id && conversation.isBibleStudy
  )

  if (contactStudies.length === 0) {
    return null
  }

  const sortedStudies = contactStudies.sort(
    (a, b) => moment(b.date).unix() - moment(a.date).unix()
  )

  return sortedStudies[0]
}

/**
 * A follow-up only counts as an "appointment" once the user has expressed
 * intent for it — by enabling a notification or writing a topic. Without
 * either, the follow-up date is just the placeholder the conversation form
 * auto-fills from `returnVisitTimeOffset`, and surfacing it in widgets or the
 * home screen would clutter the user with intentions they never set.
 *
 * Used by `upcomingFollowUpConversations`, `overdueFollowUpConversations`, and
 * the widget appointments builder so all three places agree on what counts as
 * an appointment.
 */
export const isAppointment = (conversation: Conversation): boolean => {
  const followUp = conversation.followUp
  if (!followUp) return false
  return !!followUp.notifyMe || !!(followUp.topic && followUp.topic.length > 0)
}

export const upcomingFollowUpConversations = ({
  currentTime,
  conversations,
  withinNextDays,
}: {
  currentTime: Date
  conversations: Conversation[]
  withinNextDays: number
}) => {
  const endOfMorning = moment(currentTime).endOf('day').hour(16) // 4:59:59 pm
  const isMorning = moment(currentTime).isBefore(endOfMorning)

  const maxDate = isMorning
    ? moment(currentTime).endOf('day')
    : moment(currentTime).add(withinNextDays, 'days').endOf('day')

  const minDate = moment(currentTime).subtract(4, 'hours')

  return conversations.filter((conversation) => {
    if (!isAppointment(conversation)) return false
    const date = conversation.followUp?.date
    if (!date) return false
    return moment(date).isBetween(minDate, maxDate)
  })
}

/**
 * Returns conversations whose follow-up date has already passed (more than 4
 * hours ago) within `lookbackDays`. Used by the home screen to surface missed
 * appointments — same intent as `upcomingFollowUpConversations` but on the
 * other side of "now". Mirrors the widget's overdue lookback so a user tapping
 * a missed appointment from the widget lands in the app and finds the same set
 * listed there.
 */
export const overdueFollowUpConversations = ({
  currentTime,
  conversations,
  lookbackDays,
}: {
  currentTime: Date
  conversations: Conversation[]
  lookbackDays: number
}) => {
  const max = moment(currentTime).subtract(4, 'hours')
  const min = moment(currentTime).subtract(lookbackDays, 'days').startOf('day')

  return conversations.filter((conversation) => {
    if (!isAppointment(conversation)) return false
    const date = conversation.followUp?.date
    if (!date) return false
    return moment(date).isBetween(min, max, undefined, '[]')
  })
}
