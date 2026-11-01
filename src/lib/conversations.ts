import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'

export const isOwnVisit = (visit: Pick<Visit, 'receivedAt'>): boolean =>
  visit.receivedAt === undefined

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

export const isPlaceholderFollowUp = (followUp: Visit['followUp']): boolean => {
  if (!followUp) return false
  return !followUp.notifyMe && !(followUp.topic && followUp.topic.length > 0)
}

export const stripPlaceholderFollowUp = (visit: Visit): Visit => {
  if (!isPlaceholderFollowUp(visit.followUp)) return visit
  const { followUp: _placeholder, ...rest } = visit
  return rest
}

export const isAppointment = (conversation: Visit): boolean => {
  const followUp = conversation.followUp
  if (!followUp) return false

  return !followUp.dismissed
}

export const MISSED_FOLLOW_UP_AFTER_HOURS = 4

export const MISSED_FOLLOW_UP_LOOKBACK_DAYS = 30

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

export type FollowUpCardItem = { visit: Visit; answeredBy?: Visit }

export const followUpCardItems = ({
  currentTime,
  conversations,
}: {
  currentTime: Date
  conversations: Visit[]
}): FollowUpCardItem[] => {
  const now = moment(currentTime)
  const isMorning = now.isBefore(now.clone().endOf('day').hour(16))
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
