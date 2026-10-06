import type { ActiveFilter } from '@/lib/contactsFilters'
import type { ContactSortDirection, ContactSortKey } from '@/lib/contactsSort'

/**
 * What a Saved View captures from the Contacts list: its filters and sort. The
 * search text is deliberately left out — it's a momentary lookup, not part of a
 * reusable list.
 */
export type ContactsQuery = {
  filters: ActiveFilter[]
  sort: ContactSortKey
  direction: ContactSortDirection
}

/**
 * A named filter + sort combination the User switches to from the Contacts
 * screen (Supporter feature). Keyed by a stable id in the preferences map, so
 * iCloud merges each view independently. Custom fields are referenced by
 * definition id, so a renamed or archived field keeps the view working.
 */
export type SavedContactView = ContactsQuery & {
  name: string
  /** Position in the Contacts chip row. Explicit so sync can merge reorders. */
  order: number
  /** Epoch ms. Breaks `order` ties so every device shows the same sequence. */
  createdAt: number
}

/**
 * The view the Contacts list is showing on this device, plus any changes the
 * User has made to its filters or sort since opening it. `edits` is absent
 * while the view is unchanged, so updates to the view from another device show
 * through.
 */
export type ActiveSavedContactView = {
  id: string
  edits?: ContactsQuery
}
