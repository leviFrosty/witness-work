import type { Contact } from '@/types/contact'
import {
  suggestedRowDetail,
  type SuggestedContacts,
  type SuggestedRowDetail,
  type SuggestedSectionKey,
} from '@/lib/suggestedContacts'

export type ContactsListSectionKey = SuggestedSectionKey | 'other'

export type ContactsListItem =
  | { kind: 'header'; key: string; section: ContactsListSectionKey }
  | {
      kind: 'contact'
      key: string
      contact: Contact

      section: ContactsListSectionKey | null

      detail?: SuggestedRowDetail
    }

export type ContactsList = {
  items: ContactsListItem[]

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

export const contactItemIndex = (
  items: readonly ContactsListItem[],
  contactId: string
): number =>
  items.findIndex(
    (item) => item.kind === 'contact' && item.contact.id === contactId
  )
