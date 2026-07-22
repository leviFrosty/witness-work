import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import { contactStudiedForGivenMonth } from '@/lib/conversations'

type StudiesForMonthArgs = {
  contacts: Contact[]
  conversations: Visit[]
  month: Date
}

export const getStudyContactsForGivenMonth = ({
  contacts,
  conversations,
  month,
}: StudiesForMonthArgs) =>
  contacts.filter((contact) =>
    contactStudiedForGivenMonth({ contact, conversations, month })
  )

export const getStudiesForGivenMonth = (args: StudiesForMonthArgs) =>
  getStudyContactsForGivenMonth(args).length

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
