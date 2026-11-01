import type { ActiveFilter } from '@/lib/contactsFilters'
import type { ContactSortDirection, ContactSortKey } from '@/lib/contactsSort'

export type ContactsQuery = {
  filters: ActiveFilter[]
  sort: ContactSortKey
  direction: ContactSortDirection
}

export type SavedContactView = ContactsQuery & {
  name: string

  order: number

  createdAt: number
}

export type ActiveSavedContactView = {
  id: string
  edits?: ContactsQuery
}
