import moment from 'moment'
import { Contact } from '../types/contact'
import { Conversation } from '../types/conversation'
import { contactStudiedForGivenMonth } from './conversations'

export const getStudiesForGivenMonth = ({
  contacts,
  conversations,
  month,
}: {
  contacts: Contact[]
  conversations: Conversation[]
  month: Date
}) => {
  return contacts.reduce((accumulator, contact) => {
    if (contactStudiedForGivenMonth({ contact, conversations, month })) {
      return accumulator + 1
    }
    return accumulator
  }, 0)
}

export const getMostRecentConversationForContact = ({
  conversations,
  contact,
}: {
  conversations: Conversation[]
  contact: Contact
}) => {
  const contactConversations = conversations.filter(
    (convo) => convo.contact.id === contact.id
  )

  if (contactConversations.length === 0) {
    return null
  }

  const sorted = contactConversations.sort(
    (a, b) => moment(b.date).unix() - moment(a.date).unix()
  )

  return sorted[0]
}
