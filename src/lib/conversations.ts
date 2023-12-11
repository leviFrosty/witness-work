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
    const date = conversation.followUp?.date

    if (date) {
      const isUpcoming = moment(date).isBetween(minDate, maxDate)
      return isUpcoming
    }
    return false
  })
}
