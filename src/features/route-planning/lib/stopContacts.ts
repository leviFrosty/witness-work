import type Fuse from 'fuse.js'
import {
  type ContactSearchEntry,
  searchContactsFuzzy,
} from '@/lib/contactsSearch'
import type { Contact } from '@/types/contact'

export const MAX_STOP_CONTACTS = 30

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
