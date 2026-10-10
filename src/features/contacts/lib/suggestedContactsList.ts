import type { Contact } from '@/types/contact'
import {
  suggestedRowDetail,
  type SuggestedContacts,
  type SuggestedRowDetail,
  type SuggestedSectionKey,
} from '@/lib/suggestedContacts'

/** Every Contact the suggested sections leave out, under one more header. */
export type ContactsListSectionKey = SuggestedSectionKey | 'other'

export type ContactsListItem =
  | { kind: 'header'; key: string; section: ContactsListSectionKey }
  | {
      kind: 'contact'
      key: string
      contact: Contact
      /** The section the row sits in, or null in a flat list. */
      section: ContactsListSectionKey | null
      /** Replaces the row's usual "last visit · city" line. */
      detail?: SuggestedRowDetail
    }

export type ContactsList = {
  /** What the list draws: rows, plus section headers when sectioned. */
  items: ContactsListItem[]
  /** The Contacts in the order they're drawn, once each (no headers). */
  contacts: Contact[]
  sectioned: boolean
}

const flat = (contacts: Contact[]): ContactsList => ({
  items: contacts.map((contact) => ({
    kind: 'contact',
    key: contact.id,
    contact,
    section: null,
  })),
  contacts,
  sectioned: false,
})

const header = (section: ContactsListSectionKey): ContactsListItem => ({
  kind: 'header',
  key: `header:${section}`,
  section,
})

/**
 * Lays out the Contacts list for the Suggested sort: each non-empty suggested
 * section under its header, then every other Contact under "Other Contacts" in
 * the order given. `contacts` must already be filtered and sorted; sections
 * only ever hold Contacts from it, so filters apply before sectioning. Each
 * Contact appears once, which keeps Select mode's counts and Select All right.
 *
 * Pass `suggested: null` (another sort, or a search) for the flat list. With no
 * suggested section at all the list stays flat too, rather than showing a lone
 * "Other Contacts" header.
 */
export const buildContactsList = ({
  contacts,
  suggested,
  currentTime = new Date(),
}: {
  contacts: Contact[]
  suggested: SuggestedContacts | null
  currentTime?: Date
}): ContactsList => {
  if (!suggested || suggested.sections.length === 0) return flat(contacts)

  const listed = new Set(contacts.map((contact) => contact.id))
  const items: ContactsListItem[] = []
  const ordered: Contact[] = []
  const placed = new Set<string>()
  for (const { key: section, contacts: members } of suggested.sections) {
    // Only Contacts this list shows, each once, whatever the caller passed.
    const shown = members.filter(
      (contact) => listed.has(contact.id) && !placed.has(contact.id)
    )
    if (shown.length === 0) continue
    items.push(header(section))
    for (const contact of shown) {
      placed.add(contact.id)
      ordered.push(contact)
      items.push({
        kind: 'contact',
        key: contact.id,
        contact,
        section,
        detail: suggestedRowDetail(section, contact, suggested, currentTime),
      })
    }
  }
  if (ordered.length === 0) return flat(contacts)

  const others = contacts.filter((contact) => !placed.has(contact.id))
  if (others.length > 0) {
    items.push(header('other'))
    for (const contact of others) {
      ordered.push(contact)
      items.push({
        kind: 'contact',
        key: contact.id,
        contact,
        section: 'other',
      })
    }
  }
  return { items, contacts: ordered, sectioned: true }
}

/** Where a Contact sits in `items`, for scrolling to it; -1 when absent. */
export const contactItemIndex = (
  items: readonly ContactsListItem[],
  contactId: string
): number =>
  items.findIndex(
    (item) => item.kind === 'contact' && item.contact.id === contactId
  )
