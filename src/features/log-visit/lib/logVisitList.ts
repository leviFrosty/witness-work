import type { FuseResultMatch } from 'fuse.js'
import type { Contact } from '@/types/contact'
import type { LogVisitPickedFrom } from '@/types/rootStack'
import i18n from '@/lib/locales'
import {
  suggestedRowDetail,
  suggestedSectionTitleKey,
  type SuggestedContacts,
  type SuggestedRowDetail,
} from '@/lib/suggestedContacts'
import type { SuggestedHeaderSection } from '@/components/SuggestedSectionHeader'
import type { ContactSearchMatch } from '@/features/contacts/lib/contactsSearch'

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

/** Contacts A–Z by name, ignoring case and accents. */
export const sortContactsByName = (contacts: Contact[]): Contact[] =>
  [...contacts].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      sensitivity: 'base',
      numeric: true,
    })
  )

/**
 * The picker without a search: each suggested section under its header, then
 * everyone A–Z under All Contacts (suggested people again too, so the A–Z list
 * is predictable). Without suggestions the A–Z list stands alone.
 */
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

/**
 * The picker while searching: Fuse-ranked matches, then a row that adds what
 * was typed as a new Contact. An empty query has no items.
 */
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
