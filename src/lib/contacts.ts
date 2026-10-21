import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import { isOwnVisit } from '@/lib/conversations'

type StudiesForMonthArgs = {
  contacts: Contact[]
  conversations: Visit[]
  month: Date
}

/**
 * The Contacts the User studied with in `month`, as the month's report counts
 * them (`contactStudiedForGivenMonth`). One pass over the Visits, then one over
 * the Contacts: checking each Contact against every Visit took most of Home's
 * render on an account with thousands of each.
 */
export const getStudyContactsForGivenMonth = ({
  contacts,
  conversations,
  month,
}: StudiesForMonthArgs) => {
  const targetMonth = moment(month)
  const studied = new Set<string>()
  for (const conversation of conversations) {
    if (
      !conversation.isBibleStudy ||
      !isOwnVisit(conversation) ||
      studied.has(conversation.contact.id)
    )
      continue
    if (moment(conversation.date).isSame(targetMonth, 'month'))
      studied.add(conversation.contact.id)
  }
  return contacts.filter((contact) => studied.has(contact.id))
}

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
