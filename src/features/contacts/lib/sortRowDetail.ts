import type { Contact } from '@/types/contact'
import type { ConversationIndex } from '@/lib/conversationIndex'
import type { ContactSortKey } from '@/lib/contactsSort'
import {
  followUpDayLabel,
  type SuggestedRowDetail,
} from '@/lib/suggestedContacts'
import { formatRelative } from '@/lib/dates'
import i18n from '@/lib/locales'

export const sortRowDetail = ({
  sort,
  sortLabel,
  contact,
  index,
  currentTime = new Date(),
}: {
  sort: ContactSortKey

  sortLabel: string
  contact: Contact
  index: ConversationIndex
  currentTime?: Date
}): SuggestedRowDetail | undefined => {
  const fieldDetail = (value: string | undefined): SuggestedRowDetail => {
    const text = value?.trim()
    return text
      ? { text }
      : {
          text: i18n.t('contacts_sortDetail_notSet', { label: sortLabel }),
        }
  }

  if (sort.startsWith('customField:')) {
    return fieldDetail(
      contact.customFields?.[sort.slice('customField:'.length)]
    )
  }
  switch (sort) {
    case 'nextFollowUp': {
      const upcoming = index.nextFollowUpMs.get(contact.id)
      const missed = index.missedFollowUpMs.get(contact.id)
      const due = upcoming ?? missed
      if (due === undefined) {
        return { text: i18n.t('contacts_sortDetail_noFollowUp') }
      }

      const isDue = upcoming === undefined || upcoming <= endOfDay(currentTime)
      return {
        text: followUpDayLabel(due, currentTime),
        tone: isDue ? 'due' : 'default',
      }
    }
    case 'bibleStudy': {
      const studied = index.mostRecentStudyMs.get(contact.id)
      return {
        text:
          studied === undefined
            ? i18n.t('contacts_sortDetail_noStudy')
            : i18n.t('contacts_sortDetail_studied', {
                date: formatRelative(studied),
              }),
      }
    }
    case 'createdAt':
      return contact.createdAt
        ? {
            text: i18n.t('contacts_sortDetail_added', {
              date: formatRelative(contact.createdAt),
            }),
          }
        : undefined
    case 'city':
    case 'state':
    case 'zip':
      return fieldDetail(contact.address?.[sort])
    default:
      return undefined
  }
}

const endOfDay = (d: Date) => {
  const copy = new Date(d)
  copy.setHours(23, 59, 59, 999)
  return copy.getTime()
}
