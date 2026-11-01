import type { FuseResultMatch } from 'fuse.js'
import type { Contact } from '@/types/contact'
import type { LogVisitPickedFrom } from '@/types/rootStack'
import i18n from '@/lib/locales'
import { compareText } from '@/lib/collation'
import {
  suggestedRowDetail,
  suggestedSectionTitleKey,
  type SuggestedContacts,
  type SuggestedRowDetail,
} from '@/lib/suggestedContacts'
import type { SuggestedHeaderSection } from '@/components/SuggestedSectionHeader'
import type { ContactSearchMatch } from '@/lib/contactsSearch'

export type LogVisitListItem =
  | {
      type: 'header'
      key: string
      title: string
      section: SuggestedHeaderSection
    }
  | {
      type: 'contact'
      key: string
      contact: Contact
      pickedFrom: LogVisitPickedFrom
      detail?: SuggestedRowDetail
      searchMatches?: readonly FuseResultMatch[]
    }
  | { type: 'noMatches'; key: string; query: string }
  | { type: 'addNew'; key: string; name: string }

export const sortContactsByName = (contacts: Contact[]): Contact[] =>
  [...contacts].sort((a, b) =>
    compareText(a.name, b.name, { sensitivity: 'base', numeric: true })
  )

export const buildBrowseItems = ({
  suggested,
  contacts,
  currentTime = new Date(),
}: {
  suggested: Pick<SuggestedContacts, 'sections' | 'dueFollowUpById'>
  contacts: Contact[]
  currentTime?: Date
}): LogVisitListItem[] => {
  const items: LogVisitListItem[] = []
  for (const section of suggested.sections) {
    items.push({
      type: 'header',
      key: `header-${section.key}`,
      title: i18n.t(suggestedSectionTitleKey[section.key]),
      section: section.key,
    })
    for (const contact of section.contacts) {
      items.push({
        type: 'contact',
        key: `${section.key}-${contact.id}`,
        contact,
        pickedFrom: section.key,
        detail: suggestedRowDetail(
          section.key,
          contact,
          suggested,
          currentTime
        ),
      })
    }
  }
  if (items.length > 0 && contacts.length > 0) {
    items.push({
      type: 'header',
      key: 'header-all',
      title: i18n.t('suggested_allContacts'),
      section: 'all',
    })
  }
  for (const contact of sortContactsByName(contacts)) {
    items.push({
      type: 'contact',
      key: `all-${contact.id}`,
      contact,
      pickedFrom: 'all',
    })
  }
  return items
}

export const buildSearchItems = (
  query: string,
  results: ContactSearchMatch[]
): LogVisitListItem[] => {
  const name = query.trim()
  if (!name) return []
  const items: LogVisitListItem[] = results.map((result) => ({
    type: 'contact',
    key: `search-${result.contact.id}`,
    contact: result.contact,
    pickedFrom: 'search',
    searchMatches: result.matches,
  }))
  if (items.length === 0) {
    items.push({ type: 'noMatches', key: 'no-matches', query: name })
  }
  items.push({ type: 'addNew', key: 'add-new', name })
  return items
}
