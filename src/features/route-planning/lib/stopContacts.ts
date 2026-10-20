import type Fuse from 'fuse.js'
import {
  type ContactSearchEntry,
  searchContactsFuzzy,
} from '@/lib/contactsSearch'
import type { Contact } from '@/types/contact'

/** How many contacts Add Stop lists at once. */
export const MAX_STOP_CONTACTS = 30

/**
 * The contacts Add Stop lists: the Contacts list's search while there's a query
 * (best match first), otherwise everyone A to Z. Only the first `limit` show;
 * `more` counts the rest so the sheet can say there are more.
 */
export const stopContactResults = <C extends Contact>(
  contacts: C[],
  query: string,
  fuse: Fuse<ContactSearchEntry<C>> | undefined,
  limit = MAX_STOP_CONTACTS
): { shown: C[]; more: number } => {
  const matched =
    fuse && query.trim()
      ? searchContactsFuzzy(query, fuse, contacts).map(({ contact }) => contact)
      : [...contacts].sort((a, b) => a.name.localeCompare(b.name))
  return {
    shown: matched.slice(0, limit),
    more: Math.max(0, matched.length - limit),
  }
}
