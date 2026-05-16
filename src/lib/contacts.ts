import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import { contactStudiedForGivenMonth } from '@/lib/conversations'

export const getStudiesForGivenMonth = ({
  contacts,
  conversations,
  month,
}: {
  contacts: Contact[]
  conversations: Visit[]
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
  conversations: Visit[]
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
