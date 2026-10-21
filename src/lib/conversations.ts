import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'

/**
 * Whether the User made this Visit. One that came with a shared Contact
 * (`receivedAt`) is the sender's ministry: it stays in the Contact's history
 * but counts toward none of the User's own figures (report, Progress, profile,
 * widgets).
 */
export const isOwnVisit = (visit: Pick<Visit, 'receivedAt'>): boolean =>
  visit.receivedAt === undefined

/**
 * Whether the User studied with the Contact in `month`: one of their own Visits
 * that month is marked as a Bible Study. This is what the month's report
 * counts, so a study the sender of a shared Contact conducted doesn't count.
 */
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
      isOwnVisit(conversation) &&
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
 * The Contact's latest real conversation on or before `before`. Not at Home
 * Visits don't count: no one answered, so they say nothing about a study.
 */
export const contactLastConversation = ({
  conversations,
  contactId,
  before,
}: {
  conversations: Visit[]
  contactId: string
  before: Date
}): Visit | undefined => {
  const cutoff = before.getTime()
  let last: Visit | undefined
  for (const visit of conversations) {
    if (visit.contact.id !== contactId || visit.notAtHome) continue
    const ts = new Date(visit.date).getTime()
    if (ts > cutoff) continue
    if (!last || ts > new Date(last.date).getTime()) last = visit
  }
  return last
}

/**
 * A new Visit's Bible Study switch starts as the Contact's last real
 * conversation left it, so one missed toggle doesn't drop a study from the
 * Service Report. Not at Home is never a Bible Study.
 */
export const newVisitIsBibleStudy = ({
  conversations,
  contactId,
  date,
  notAtHome,
}: {
  conversations: Visit[]
  contactId: string
  date: Date
  notAtHome?: boolean
}): boolean =>
  !notAtHome &&
  !!contactId &&
  !!contactLastConversation({ conversations, contactId, before: date })
    ?.isBibleStudy

/**
 * The topic planned for the Follow-up a new Visit answers, when it was opened
 * from one (e.g. Home's Follow-up card). Undefined when there's none to show.
 */
export const plannedFollowUpTopic = ({
  conversations,
  followUpVisitId,
}: {
  conversations: Visit[]
  followUpVisitId?: string
}): string | undefined => {
  if (!followUpVisitId) return undefined
  const followUp = conversations.find((c) => c.id === followUpVisitId)?.followUp
  return followUp?.topic?.trim() || undefined
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

/** An open Follow-up becomes missed this many hours after its time. */
export const MISSED_FOLLOW_UP_AFTER_HOURS = 4
/** Missed Follow-ups older than this many days stop surfacing as missed. */
export const MISSED_FOLLOW_UP_LOOKBACK_DAYS = 30

/**
 * Groups Visits by Contact id, for `followUpAnswer` lookups. With `contactIds`,
 * only those Contacts' Visits.
 */
export const visitsByContact = (
  visits: Visit[],
  contactIds?: ReadonlySet<string>
) => {
  const byContact = new Map<string, Visit[]>()
  for (const visit of visits) {
    if (contactIds && !contactIds.has(visit.contact.id)) continue
    const list = byContact.get(visit.contact.id) ?? []
    list.push(visit)
    byContact.set(visit.contact.id, list)
  }
  return byContact
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whether a Follow-up `date` falls in `[min, max]`, as moment reads it. A plain
 * `Date` parse settles dates more than a day from either end, which is most of
 * a long history; that day of slack covers strings moment reads as local time.
 * Dates near an end, and any `Date` can't parse, go to moment.
 */
const followUpInRange = (
  date: Date,
  min: moment.Moment,
  max: moment.Moment
) => {
  const time = new Date(date).getTime()
  if (time < min.valueOf() - DAY_MS || time > max.valueOf() + DAY_MS)
    return false
  if (time > min.valueOf() + DAY_MS && time < max.valueOf() - DAY_MS)
    return true
  return moment(date).isBetween(min, max, undefined, '[]')
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
  const missedBefore = now
    .clone()
    .subtract(MISSED_FOLLOW_UP_AFTER_HOURS, 'hours')
  const due = conversations.filter(
    (visit) =>
      isAppointment(visit) && followUpInRange(visit.followUp!.date, min, max)
  )
  if (due.length === 0) return []
  const byContact = visitsByContact(
    conversations,
    new Set(due.map((visit) => visit.contact.id))
  )

  return due
    .flatMap((visit): FollowUpCardItem[] => {
      const answeredBy = followUpAnswer(
        visit,
        byContact.get(visit.contact.id) ?? []
      )
      if (!answeredBy && moment(visit.followUp!.date).isBefore(missedBefore))
        return []
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
  const max = moment(currentTime).subtract(
    MISSED_FOLLOW_UP_AFTER_HOURS,
    'hours'
  )
  const min = moment(currentTime).subtract(lookbackDays, 'days').startOf('day')
  const missed = conversations.filter((conversation) => {
    if (!isAppointment(conversation)) return false
    const date = conversation.followUp?.date
    return !!date && followUpInRange(date, min, max)
  })
  if (missed.length === 0) return []
  const byContact = visitsByContact(
    conversations,
    new Set(missed.map((conversation) => conversation.contact.id))
  )

  return missed.filter(
    (conversation) =>
      !followUpAnswer(
        conversation,
        byContact.get(conversation.contact.id) ?? []
      )
  )
}
