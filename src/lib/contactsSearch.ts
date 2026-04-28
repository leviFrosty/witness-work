import Fuse, { IFuseOptions } from 'fuse.js'
import { Contact } from '../types/contact'
import { Conversation } from '../types/conversation'

export type ContactSearchEntry = {
  contact: Contact
  notes: string
  customFieldValues: string
}

const buildEntries = (
  contacts: Contact[],
  conversations: Conversation[]
): ContactSearchEntry[] => {
  const notesByContactId = new Map<string, string[]>()
  for (const c of conversations) {
    if (!c.note) continue
    const list = notesByContactId.get(c.contact.id) ?? []
    list.push(c.note)
    notesByContactId.set(c.contact.id, list)
  }
  return contacts.map((contact) => ({
    contact,
    notes: (notesByContactId.get(contact.id) ?? []).join(' • '),
    customFieldValues: contact.customFields
      ? Object.values(contact.customFields).filter(Boolean).join(' • ')
      : '',
  }))
}

const FUSE_KEYS: IFuseOptions<ContactSearchEntry>['keys'] = [
  { name: 'contact.name', weight: 0.5 },
  { name: 'contact.phone', weight: 0.15 },
  { name: 'contact.email', weight: 0.15 },
  { name: 'contact.address.city', weight: 0.05 },
  { name: 'contact.address.state', weight: 0.05 },
  { name: 'contact.address.zip', weight: 0.05 },
  { name: 'customFieldValues', weight: 0.1 },
  { name: 'notes', weight: 0.15 },
]

export const buildContactsFuse = (
  contacts: Contact[],
  conversations: Conversation[]
): Fuse<ContactSearchEntry> => {
  const entries = buildEntries(contacts, conversations)
  return new Fuse(entries, {
    keys: FUSE_KEYS,
    // Loose enough to absorb single-letter transpositions ("jhon" → "John")
    // while still rejecting unrelated terms. With `ignoreLocation: true` and
    // weighted multi-key search, scores trend higher than fuse's default 0.6,
    // so we open up to 0.6 to catch typos in short fields like a first name.
    threshold: 0.6,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: false,
  })
}

/**
 * Returns a fuzzy-matched subset of `contacts` for a free-text query.
 *
 * - Empty/whitespace query short-circuits to the full list (in original order).
 * - Builds a fresh Fuse index per call; callers should memoize against
 *   `[contacts, conversations]` to avoid rebuilding on every keystroke.
 */
export const searchContactsFuzzy = (
  query: string,
  fuse: Fuse<ContactSearchEntry>,
  contacts: Contact[]
): Contact[] => {
  const trimmed = query.trim()
  if (trimmed.length === 0) return contacts
  return fuse.search(trimmed).map((r) => r.item.contact)
}
