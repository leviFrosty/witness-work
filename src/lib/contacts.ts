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
  // One pass, parsing each date once. Ties keep the earliest-listed visit,
  // as the stable sort this replaced did.
  let mostRecent: Visit | null = null
  let mostRecentUnix = -Infinity
  for (const convo of conversations) {
    if (convo.contact.id !== contact.id) continue
    const unix = moment(convo.date).unix()
    if (mostRecent === null || unix > mostRecentUnix) {
      mostRecent = convo
      mostRecentUnix = unix
    }
  }

  return mostRecent
}
