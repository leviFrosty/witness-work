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
 * A follow-up is a "legacy placeholder" when it was auto-filled by the visit
 * form before the Follow Up switch existed: the form always attached a
 * `followUp` with a default date, and the user's intent was inferred from
 * whether they enabled a reminder or wrote a topic. With the switch, the
 * presence of `followUp` _is_ the intent, so these placeholders must be
 * stripped on the way in (persist migration + sync payload parser) or they
 * would flood "Missed Conversations".
 */
export const isPlaceholderFollowUp = (followUp: Visit['followUp']): boolean => {
  if (!followUp) return false
  return !followUp.notifyMe && !(followUp.topic && followUp.topic.length > 0)
}

/**
 * Returns the same Visit instance when nothing needs to change, so callers can
 * detect "did anything get stripped" with a reference comparison.
 */
export const stripPlaceholderFollowUp = (visit: Visit): Visit => {
  if (!isPlaceholderFollowUp(visit.followUp)) return visit
  const { followUp: _placeholder, ...rest } = visit
  return rest
}

/**
 * A follow-up counts as an "appointment" whenever the user has one attached and
 * hasn't dismissed it. The visit form's Follow Up switch is the gate: when it's
 * off the Visit carries no `followUp` at all, so there is nothing to infer from
 * reminders or topics.
 *
 * Used by `followUpCardItems`, `overdueFollowUpConversations`, and the widget
 * appointments builder so all three places agree on what counts as an
 * appointment.
 */
export const isAppointment = (conversation: Visit): boolean => {
  const followUp = conversation.followUp
  if (!followUp) return false
  // A dismissed follow-up is preserved on the record (so the topic/date stay
  // in history) but should not surface as an active appointment anywhere.
  return !followUp.dismissed
}

/** Groups Visits by Contact id, for `followUpAnswer` lookups. */
export const visitsByContact = (visits: Visit[]) => {
  const byContact = new Map<string, Visit[]>()
  for (const visit of visits) {
    const list = byContact.get(visit.contact.id) ?? []
    list.push(visit)
    byContact.set(visit.contact.id, list)
  }
  return byContact
}

/**
 * The Visit that answers a Follow-up: the earliest later Visit with the same
 * Contact on the Follow-up's day or after. Arriving a bit early still counts,
 * and so does a Not at Home (the user went). Undefined while it's still open.
 *
 * Shared by Home's Follow-up card, missed Follow-ups, and the widget, so a
 * Follow-up the card shows as done is never reported as missed.
 */
export const followUpAnswer = (
  visit: Visit,
  contactVisits: Visit[]
): Visit | undefined => {
  if (!visit.followUp) return undefined
  const after = new Date(visit.date).getTime()
  const from = moment(visit.followUp.date).startOf('day').valueOf()
  let answer: Visit | undefined
  for (const other of contactVisits) {
    const ts = new Date(other.date).getTime()
    if (other.id === visit.id || ts <= after || ts < from) continue
    if (!answer || ts < new Date(answer.date).getTime()) answer = other
  }
  return answer
}

/** A Follow-up on Home's card, with the Visit that answered it, if any. */
export type FollowUpCardItem = { visit: Visit; answeredBy?: Visit }

/**
 * Follow-ups for Home's card: today's, plus tomorrow's from 5 PM on. Answered
 * ones stay (so the card can show progress) until the day ends; open ones drop
 * off 4 hours after their time, when they become missed (see
 * `overdueFollowUpConversations`). Sorted by Follow-up time.
 */
export const followUpCardItems = ({
  currentTime,
  conversations,
}: {
  currentTime: Date
  conversations: Visit[]
}): FollowUpCardItem[] => {
  const now = moment(currentTime)
  const isMorning = now.isBefore(now.clone().endOf('day').hour(16)) // 4:59:59 pm
  const min = now.clone().startOf('day')
  const max = isMorning
    ? now.clone().endOf('day')
    : now.clone().add(1, 'day').endOf('day')
  const missedBefore = now.clone().subtract(4, 'hours')
  const byContact = visitsByContact(conversations)

  return conversations
    .flatMap((visit): FollowUpCardItem[] => {
      if (!isAppointment(visit)) return []
      const date = moment(visit.followUp!.date)
      if (!date.isBetween(min, max, undefined, '[]')) return []
      const answeredBy = followUpAnswer(
        visit,
        byContact.get(visit.contact.id) ?? []
      )
      if (!answeredBy && date.isBefore(missedBefore)) return []
      return [{ visit, answeredBy }]
    })
    .sort(
      (a, b) =>
        new Date(a.visit.followUp!.date).getTime() -
        new Date(b.visit.followUp!.date).getTime()
    )
}

/**
 * Returns conversations whose follow-up date has already passed (more than 4
 * hours ago) within `lookbackDays`. Used by the home screen to surface missed
 * appointments — same intent as `followUpCardItems` but on the other side of
 * "now". Mirrors the widget's overdue lookback so a user tapping a missed
 * appointment from the widget lands in the app and finds the same set listed
 * there.
 *
 * Skips answered follow-ups (see `followUpAnswer`): the user already went.
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
  const byContact = visitsByContact(conversations)

  return conversations.filter((conversation) => {
    if (!isAppointment(conversation)) return false
    const date = conversation.followUp?.date
    if (!date) return false
    if (!moment(date).isBetween(min, max, undefined, '[]')) return false
    return !followUpAnswer(
      conversation,
      byContact.get(conversation.contact.id) ?? []
    )
  })
}
