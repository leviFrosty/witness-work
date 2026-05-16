import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'

export const contactStudiedForGivenMonth = ({
  conversations,
  contact,
  month,
}: {
  conversations: Visit[]
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
  conversations: Visit[]
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
  conversations: Visit[]
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
export const isAppointment = (conversation: Visit): boolean => {
  const followUp = conversation.followUp
  if (!followUp) return false
  // A dismissed follow-up is preserved on the record (so the topic/date stay
  // in history) but should not surface as an active appointment anywhere.
  if (followUp.dismissed) return false
  return !!followUp.notifyMe || !!(followUp.topic && followUp.topic.length > 0)
}

export const upcomingFollowUpConversations = ({
  currentTime,
  conversations,
  withinNextDays,
}: {
  currentTime: Date
  conversations: Visit[]
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
 *
 * Suppresses follow-ups that have been superseded: if the same contact has any
 * other conversation whose start date is at or after this follow-up's date, the
 * user effectively already had the visit (either by logging the follow-up
 * itself or a subsequent conversation), so it shouldn't be flagged as missed.
 */
export const overdueFollowUpConversations = ({
  currentTime,
  conversations,
  lookbackDays,
}: {
  currentTime: Date
  conversations: Visit[]
  lookbackDays: number
}) => {
  const max = moment(currentTime).subtract(4, 'hours')
  const min = moment(currentTime).subtract(lookbackDays, 'days').startOf('day')

  // Group conversation timestamps by contact once, so the supersede check
  // below is O(k) per candidate rather than O(n).
  const datesByContact = new Map<string, Array<{ id: string; ts: number }>>()
  for (const c of conversations) {
    const list = datesByContact.get(c.contact.id) ?? []
    list.push({ id: c.id, ts: moment(c.date).valueOf() })
    datesByContact.set(c.contact.id, list)
  }

  return conversations.filter((conversation) => {
    if (!isAppointment(conversation)) return false
    const date = conversation.followUp?.date
    if (!date) return false
    if (!moment(date).isBetween(min, max, undefined, '[]')) return false

    // Superseded if another conversation for the same contact has a start
    // date at or after this follow-up — the visit already happened.
    const followUpTs = moment(date).valueOf()
    const siblings = datesByContact.get(conversation.contact.id) ?? []
    const superseded = siblings.some(
      (s) => s.id !== conversation.id && s.ts >= followUpTs
    )
    return !superseded
  })
}
